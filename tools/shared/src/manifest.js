// Check a pinned copy against its MANIFEST.json (F25.3). No DOM, no Deno calls: the caller supplies the reader.
//   verifyManifest(manifest, read) -> [] when every listed file is present with the recorded size and SHA-256,
//   otherwise one { name, problem } per file that is missing, the wrong size or changed.
// `read(name)` returns the file's bytes (Uint8Array) or throws when it does not exist.

const hex = async (bytes) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function verifyManifest(manifest, read) {
  const problems = [];
  for (const f of manifest.files ?? []) {
    let bytes;
    try { bytes = await read(f.name); } catch { problems.push({ name: f.name, problem: "missing" }); continue; }
    if (bytes.length !== f.bytes) { problems.push({ name: f.name, problem: `size ${bytes.length}, manifest says ${f.bytes}` }); continue; }
    const sum = await hex(bytes);
    if (sum !== f.sha256) problems.push({ name: f.name, problem: `SHA-256 ${sum.slice(0, 12)}…, manifest says ${f.sha256.slice(0, 12)}…` });
  }
  return problems;
}
