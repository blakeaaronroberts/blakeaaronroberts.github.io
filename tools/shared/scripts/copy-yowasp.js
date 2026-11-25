// Copy the Yosys engine the SystemVerilog importer uses for behavioural code (F22.1c-0): the npm package @yowasp/yosys, pinned
// exactly, with its large files gzipped. Yosys is not in circuit-model's git (npm only), so copy-model.js cannot carry it.
//
//   quarto run tools/shared/scripts/copy-yowasp.js [--tarball path/to/yosys-0.71.1284.tgz]
//
// The only writer of tools/shared/src/sv/third_party/yowasp/. It downloads the package tarball (or reads --tarball), refuses it
// unless its sha512 is the integrity recorded in circuit-model's DECISIONS.md (C11.0b), checks the version, and writes
//   bundle.js                    as published (Pages gzips JavaScript itself)
//   <name>.gz                    each .wasm and the resources .tar, gzipped here (so nothing depends on how a host compresses)
//   MANIFEST.json                size and SHA-256 of every file written, and of the raw file inside each .gz
// gzip output can differ between zlib builds, so the test checks the committed .gz bytes and that gunzip gives the raw hash.
// Run it with network access and write permission: quarto run --allow-all is not needed, `quarto run` grants what it needs.

const VERSION = "0.71.1284";
const INTEGRITY = "sha512-sEqbe2F1XgBk/pkykD8YBAF1/3BvyT6DgeJjzZEubo+piXAkFq/ih9WmXuplrpXtTQ6iHkQg6BbBxBgZYFfHWg==";
const YOSYS_SHA1 = "b4c586fd3";   // what the binary reports (circuit-model DECISIONS, C11.0b)
const URL_TGZ = `https://registry.npmjs.org/@yowasp/yosys/-/yosys-${VERSION}.tgz`;
const KEEP = ["bundle.js", "yosys.core.wasm", "yosys.core2.wasm", "yosys.core3.wasm", "yosys.core4.wasm", "yosys-resources.0.tar"];

const here = new URL(".", import.meta.url);
const outDir = new URL("../src/sv/third_party/yowasp/", here);
const arg = (name) => { const i = Deno.args.indexOf(name); return i >= 0 && i + 1 < Deno.args.length ? Deno.args[i + 1] : null; };

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (bytes) => hex(await crypto.subtle.digest("SHA-256", bytes));
const collect = async (stream) => new Uint8Array(await new Response(stream).arrayBuffer());
const through = (bytes, transform) => collect(new Blob([bytes]).stream().pipeThrough(transform));

/** The files of a tar, as { name: bytes }, names as stored (npm: "package/gen/..."). */
function untar(tar) {
  const files = {};
  const text = (a, b) => new TextDecoder().decode(tar.subarray(a, b)).replace(/\0.*$/s, "");
  for (let at = 0; at + 512 <= tar.length;) {
    const name = text(at, at + 100);
    if (!name) break;
    const size = parseInt(text(at + 124, at + 136).trim() || "0", 8);
    const type = String.fromCharCode(tar[at + 156] || 48);
    if (type === "0") files[name] = tar.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

/** gzip -9 -n (smallest, no timestamp) when the gzip program exists; otherwise the browser-standard stream at its default level (about 2.5% larger). */
async function gzip(bytes) {
  try {
    const child = new Deno.Command("gzip", { args: ["-9", "-n", "-c"], stdin: "piped", stdout: "piped", stderr: "null" }).spawn();
    const writer = child.stdin.getWriter();
    const done = writer.write(bytes).then(() => writer.close());
    const [out] = await Promise.all([child.output(), done]);
    if (out.success) return out.stdout;
  } catch { /* no gzip program */ }
  return through(bytes, new CompressionStream("gzip"));
}

let tgz;
const local = arg("--tarball");
if (local) tgz = await Deno.readFile(local);
else {
  const r = await fetch(URL_TGZ);
  if (!r.ok) throw new Error(`${URL_TGZ}: the registry answered ${r.status}`);
  tgz = new Uint8Array(await r.arrayBuffer());
}
const integrity = "sha512-" + btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-512", tgz))));
if (integrity !== INTEGRITY) throw new Error(`the tarball's integrity is ${integrity}, not the pinned ${INTEGRITY}`);

const pkg = untar(await through(tgz, new DecompressionStream("gzip")));
const meta = JSON.parse(new TextDecoder().decode(pkg["package/package.json"]));
if (meta.name !== "@yowasp/yosys" || meta.version !== VERSION || meta.license !== "ISC") throw new Error(`unexpected package: ${meta.name} ${meta.version} ${meta.license}`);

await Deno.mkdir(outDir, { recursive: true });
const files = [];
for (const name of KEEP) {
  const raw = pkg[`package/gen/${name}`];
  if (!raw) throw new Error(`package/gen/${name} is not in the package`);
  const entry = { name, bytes: 0, sha256: "" };
  let written = raw;
  if (name !== "bundle.js") {
    written = await gzip(raw);
    entry.name = `${name}.gz`;
    entry.raw = { name, bytes: raw.length, sha256: await sha256(raw) };
  }
  entry.bytes = written.length;
  entry.sha256 = await sha256(written);
  if (written.length >= 50 * 1024 * 1024) throw new Error(`${entry.name} is ${written.length} bytes; GitHub warns at 50 MB`);
  await Deno.writeFile(new URL(entry.name, outDir), written);
  files.push(entry);
}
const manifest = {
  note: "Written by tools/shared/scripts/copy-yowasp.js. Do not edit this folder by hand.",
  package: "@yowasp/yosys", version: VERSION, integrity, license: "ISC", yosys: `Yosys 0.71, git sha1 ${YOSYS_SHA1}`,
  licenses: "../NOTICES.md",
  files,
};
await Deno.writeTextFile(new URL("MANIFEST.json", outDir), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${files.length} files (${files.reduce((n, f) => n + f.bytes, 0)} bytes) from @yowasp/yosys ${VERSION} to ${decodeURIComponent(outDir.pathname)}`);
