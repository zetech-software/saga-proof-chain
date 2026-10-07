import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { validateFileBytes } from "./uploads.server";
const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
function docx(xml: string, method = 8, advertised?: number) {
  const entries: [string, string][] = [["[Content_Types].xml", xml], ["word/document.xml", "<document/>"]];
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, contents] of entries) {
    const data = Buffer.from(contents), filename = Buffer.from(name);
    const packed = method === 8 ? deflateRawSync(data) : data;
    const size = name === "[Content_Types].xml" ? advertised ?? data.length : data.length;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(method, 8);
    header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(size, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, packed);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(method, 10);
    cd.writeUInt32LE(packed.length, 20); cd.writeUInt32LE(size, 24); cd.writeUInt16LE(filename.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(cd, filename);
    offset += header.length + filename.length + packed.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(2, 8); end.writeUInt16LE(2, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dir, end]);
}
describe("bounded DOCX metadata", () => {
  it.each([0, 8])("accepts ordinary metadata with compression method %i", async method => {
    expect(await validateFileBytes(docx("<Types>" + mime + "</Types>", method), "docx")).toEqual({ ok: true });
  });
  it("rejects oversized declared metadata before decompression", async () => {
    expect((await validateFileBytes(docx(mime, 8, 3 * 1024 * 1024), "docx")).ok).toBe(false);
  });
  it("bounds actual output even when the ZIP size is forged", async () => {
    const compressedBomb = docx(mime + " ".repeat(3 * 1024 * 1024), 8, 100);
    expect(compressedBomb.length).toBeLessThan(10000);
    expect((await validateFileBytes(compressedBomb, "docx")).ok).toBe(false);
  });
  it("rejects a mismatched metadata length", async () => {
    expect((await validateFileBytes(docx(mime, 8, 1), "docx")).ok).toBe(false);
  });
});
