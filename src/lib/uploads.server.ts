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

const td = new TextDecoder("utf-8", { fatal: false });

/** Parses the ZIP End Of Central Directory + central directory entries. */
function zipEntries(b: Uint8Array): { name: string; method: number; compSize: number; localOffset: number }[] | null {
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
  const out: { name: string; method: number; compSize: number; localOffset: number }[] = [];
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) return null;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    if (p + 46 + nameLen > b.length) return null;
    out.push({ name: td.decode(b.subarray(p + 46, p + 46 + nameLen)), method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function readZipEntry(
  b: Uint8Array,
  e: { method: number; compSize: number; localOffset: number },
): Promise<Uint8Array | null> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const lo = e.localOffset;
  if (lo + 30 > b.length || dv.getUint32(lo, true) !== 0x04034b50) return null;
  const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
  if (e.compSize > 2 * 1024 * 1024 || start + e.compSize > b.length) return null;
  const raw = b.subarray(start, start + e.compSize);
  if (e.method === 0) return raw;
  if (e.method !== 8) return null;
  const stream = new Blob([raw.slice() as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
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

export async function validateFileBytes(
  bytes: Uint8Array,
  ext: AllowedExt,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (bytes.length === 0) return { ok: false, reason: "arquivo vazio" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "arquivo acima do limite" };
  let ok = false;
  switch (ext) {
    case "pdf":
      ok = startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
      break;
    case "jpg":
    case "jpeg":
      ok = startsWith(bytes, [0xff, 0xd8, 0xff]);
      break;
    case "png":
      ok = startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      break;
    case "doc":
      ok = startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      break;
    case "docx":
      ok = await isRealDocx(bytes);
      break;
  }
  return ok ? { ok: true } : { ok: false, reason: "conteudo nao corresponde ao formato" };
}
