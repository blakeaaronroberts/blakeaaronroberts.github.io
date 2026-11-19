import { zipStore } from "../src/zip.js";

const assert = (condition, message) => { if (!condition) throw new Error(message); };

function readStoredEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), decoder = new TextDecoder();
  const entries = [];
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const dataStart = offset + 30 + nameLength + extraLength;
    entries.push({ name, crc: view.getUint32(offset + 14, true), data: bytes.slice(dataStart, dataStart + size) });
    offset = dataStart + size;
  }
  return { entries, directoryOffset: offset, view };
}

Deno.test("ZIP archives store text and binary files with a valid directory", async () => {
  const zip = await zipStore([
    { name: "plain.txt", data: "hello" },
    { name: "diagram/μ.json", data: new Blob([new Uint8Array([0, 255, 1])]) },
  ]);
  const { entries, directoryOffset, view } = readStoredEntries(zip);
  assert(entries.length === 2, "both files are present");
  assert(entries[0].name === "plain.txt" && new TextDecoder().decode(entries[0].data) === "hello", "text content round-trips");
  assert(entries[0].crc === 0x3610a686, "the local header has the standard CRC-32 for hello");
  assert(entries[1].name === "diagram/μ.json" && entries[1].data.join(",") === "0,255,1", "UTF-8 names and binary content round-trip");
  assert(view.getUint32(directoryOffset, true) === 0x02014b50, "the central directory follows the file data");
  assert(view.getUint32(zip.length - 22, true) === 0x06054b50, "the end-of-directory record is present");
  assert(view.getUint16(zip.length - 12, true) === 2, "the end record counts both files");
});

Deno.test("ZIP archives reject empty and malformed inputs", async () => {
  let emptyRejected = false, dataRejected = false;
  try { await zipStore([]); } catch { emptyRejected = true; }
  try { await zipStore([{ name: "bad.bin", data: {} }]); } catch { dataRejected = true; }
  assert(emptyRejected && dataRejected, "invalid archives fail explicitly");
});
