// Server-only: authoritative content validation for uploaded files.
import { MAX_UPLOAD_BYTES } from "./uploads";

export type AllowedExt = "pdf" | "jpg" | "jpeg" | "png" | "doc" | "docx";

export const EXT_MIME: Record<AllowedExt, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function startsWith(b: Uint8Array, sig: number[]) {
  if (b.length < sig.length) return false;
  return sig.every((v, i) => b[i] === v);
}

const MAX_DOCX_METADATA_BYTES = 2 * 1024 * 1024;

const td = new TextDecoder("utf-8", { fatal: false });

/** Parses the ZIP End Of Central Directory + central directory entries. */
function zipEntries(
  b: Uint8Array,
): { name: string; method: number; compSize: number; expandedSize: number; localOffset: number }[] | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const minEocd = 22;
  if (b.length < minEocd) return null;
  let eocd = -1;
  const stop = Math.max(0, b.length - (minEocd + 0xffff));
  for (let i = b.length - minEocd; i >= stop; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const total = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (total === 0 || total > 10000 || cdOffset + cdSize > eocd) return null;
  const out: { name: string; method: number; compSize: number; expandedSize: number; localOffset: number }[] = [];
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) return null;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const expandedSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    if (p + 46 + nameLen > b.length) return null;
    out.push({
      name: td.decode(b.subarray(p + 46, p + 46 + nameLen)),
      method,
      compSize,
      expandedSize,
      localOffset,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function readZipEntry(
  b: Uint8Array,
  e: { method: number; compSize: number; expandedSize: number; localOffset: number },
): Promise<Uint8Array | null> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const lo = e.localOffset;
  if (lo + 30 > b.length || dv.getUint32(lo, true) !== 0x04034b50) return null;
  const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
  if (e.compSize > MAX_DOCX_METADATA_BYTES || e.expandedSize > MAX_DOCX_METADATA_BYTES || start + e.compSize > b.length) return null;
  const raw = b.subarray(start, start + e.compSize);
  if (e.method === 0) return raw.length === e.expandedSize ? raw : null;
  if (e.method !== 8) return null;
  const stream = new Blob([raw.slice() as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      // The advertised ZIP size is untrusted. Stop reading actual output
      // before accumulating more than the metadata budget.
      if (total > MAX_DOCX_METADATA_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total !== e.expandedSize) return null;
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function isRealDocx(b: Uint8Array): Promise<boolean> {
  if (!startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return false;
  const entries = zipEntries(b);
  if (!entries) return false;
  const ct = entries.find((e) => e.name === "[Content_Types].xml");
  const main = entries.find((e) => e.name === "word/document.xml");
  if (!ct || !main) return false;
  try {
    const xml = await readZipEntry(b, ct);
    if (!xml) return false;
    return td
      .decode(xml)
      .includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml");
  } catch {
    return false;
  }
}

function tailText(b: Uint8Array, n: number) {
  return new TextDecoder("latin1").decode(b.subarray(Math.max(0, b.length - n)));
}

/** PDF: header, at least one object, and an end-of-file marker with a cross-reference pointer. */
function isStructuredPdf(b: Uint8Array) {
  if (!startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return false;
  const tail = tailText(b, 2048);
  if (!tail.includes("%%EOF") || !/startxref\s+\d+/.test(tail)) return false;
  const head = new TextDecoder("latin1").decode(b.subarray(0, Math.min(b.length, 1024 * 1024)));
  return /\d+\s+\d+\s+obj/.test(head);
}

/** PNG: signature, IHDR first (13 bytes, non-zero size) and IEND as the final chunk. */
function isStructuredPng(b: Uint8Array) {
  if (!startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || b.length < 8 + 25 + 12) return false;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const ihdr = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
  if (dv.getUint32(8) !== 13 || ihdr !== "IHDR" || dv.getUint32(16) === 0 || dv.getUint32(20) === 0) return false;
  const end = b.length - 12;
  return dv.getUint32(end) === 0 && String.fromCharCode(b[end + 4]!, b[end + 5]!, b[end + 6]!, b[end + 7]!) === "IEND";
}

/** JPEG: SOI, a valid segment marker next, a frame header, and EOI near the end. */
function isStructuredJpeg(b: Uint8Array) {
  if (!startsWith(b, [0xff, 0xd8, 0xff]) || b.length < 128) return false;
  let hasFrame = false;
  for (let i = 2; i + 1 < Math.min(b.length, 512 * 1024); i++) {
    if (b[i] === 0xff && b[i + 1]! >= 0xc0 && b[i + 1]! <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(b[i + 1]!)) { hasFrame = true; break; }
  }
  if (!hasFrame) return false;
  for (let i = b.length - 2; i >= Math.max(0, b.length - 4096); i--) {
    if (b[i] === 0xff && b[i + 1] === 0xd9) return true;
  }
  return false;
}

/** DOC (OLE2): signature, little-endian byte order mark and a valid sector size. */
function isStructuredDoc(b: Uint8Array) {
  if (!startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) || b.length < 1024) return false;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const shift = dv.getUint16(30, true);
  return dv.getUint16(28, true) === 0xfffe && (shift === 9 || shift === 12) && (b.length - 512) % (1 << shift) === 0;
}

export async function validateFileBytes(
  bytes: Uint8Array,
  ext: AllowedExt,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (bytes.length === 0) return { ok: false, reason: "arquivo vazio" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "arquivo acima do limite" };
  let ok = false;
  switch (ext) {
    case "pdf":
      ok = isStructuredPdf(bytes);
      break;
    case "jpg":
    case "jpeg":
      ok = isStructuredJpeg(bytes);
      break;
    case "png":
      ok = isStructuredPng(bytes);
      break;
    case "doc":
      ok = isStructuredDoc(bytes);
      break;
    case "docx":
      ok = await isRealDocx(bytes);
      break;
  }
  return ok ? { ok: true } : { ok: false, reason: "conteudo nao corresponde ao formato" };
}
