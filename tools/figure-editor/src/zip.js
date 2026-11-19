const MAX_U16 = 0xffff;
const MAX_U32 = 0xffffffff;
const UTF8 = new TextEncoder();

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < CRC_TABLE.length; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC_TABLE[i] = value >>> 0;
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

async function toBytes(data) {
  if (typeof data === "string") return UTF8.encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data?.arrayBuffer === "function") return new Uint8Array(await data.arrayBuffer());
  throw new TypeError("ZIP file data must be text, bytes, or a Blob.");
}

function fileHeader(name, size, crc, signature) {
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, signature, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0x21, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  header.set(name, 30);
  return header;
}

function centralHeader(name, size, crc, offset) {
  const header = new Uint8Array(46 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0x21, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  header.set(name, 46);
  return header;
}

/** Create a standards-compliant ZIP archive using the store method (no compression). */
export async function zipStore(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_U16) {
    throw new TypeError("A ZIP archive must contain between 1 and 65535 files.");
  }

  const localParts = [], directoryParts = [];
  let offset = 0, directorySize = 0;
  for (const file of files) {
    if (!file || typeof file.name !== "string" || !file.name) throw new TypeError("Every ZIP file needs a name.");
    const name = UTF8.encode(file.name), data = await toBytes(file.data);
    if (name.length > MAX_U16) throw new Error("A ZIP filename is too long.");
    if (data.length > MAX_U32) throw new Error("A file is too large for a standard ZIP archive.");
    if (offset > MAX_U32) throw new Error("The project is too large for a standard ZIP archive.");

    const crc = crc32(data);
    const local = fileHeader(name, data.length, crc, 0x04034b50);
    const central = centralHeader(name, data.length, crc, offset);
    localParts.push(local, data);
    directoryParts.push(central);
    offset += local.length + data.length;
    directorySize += central.length;
  }

  const end = new Uint8Array(22), endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const total = offset + directorySize + end.length;
  if (total > MAX_U32) throw new Error("The project is too large for a standard ZIP archive.");
  const archive = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...localParts, ...directoryParts, end]) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  return archive;
}
