// Copy the parts of circuit-model the tools use, pinned by tag (VISION.md section 4: modules connect through formats
// pinned by release tag; no repository imports another's code directly, so the site keeps its own pinned copy).
//
//   quarto run tools/shared/scripts/copy-model.js [--source ../circuit-model] [--ref model-v0.7.0] [--logic-ref model-v0.10.0] [--only logic]
//
// The only writer of tools/shared/src/sim/ (the simulator, used at run time) and tools/shared/test/model/ (the
// validator and schemas, used by tests to check what the tools write). Files are read from git (`git show <ref>:<path>`),
// not from the working tree, so the copy is exactly what the tag holds. Writes MANIFEST.json (tag, commit, SHA-256 per file).

const here = new URL(".", import.meta.url);
const repoRoot = new URL("../../../", here);
const arg = (name, fallback) => { const i = Deno.args.indexOf(name); return i >= 0 && i + 1 < Deno.args.length ? Deno.args[i + 1] : fallback; };
const path = (u) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, "$1");
const source = path(new URL(arg("--source", "../circuit-model"), repoRoot));
const ref = arg("--ref", "model-v0.7.0");

async function git(args, binary = false) {
  const r = await new Deno.Command("git", { args: ["-C", source, ...args], stdout: "piped", stderr: "piped" }).output();
  if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${new TextDecoder().decode(r.stderr).trim()}`);
  return binary ? r.stdout : new TextDecoder().decode(r.stdout).trim();
}
const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

// The logic tools (L5 and the rest of tools/logic/) pin their own, newer tag, with the folder layout kept (analyze/ imports
// ../sim and ../logic), so the editors' pin above does not move. Override with --logic-ref.
const logicRef = arg("--logic-ref", "model-v0.10.0");
const logicFiles = [
  "sim/simulate.mjs", "sim/logic.mjs",
  ...["circuit", "compare", "expr", "function", "index", "kmap", "qm", "rewrite"].map((n) => `logic/${n}.mjs`),
  "analyze/index.mjs", "analyze/combinational.mjs",
  "validate/jsonschema.mjs", "schema/function.schema.json", "schema/circuit.schema.json",
  "examples/full_adder_gates.json", "examples/comparator_2bit.json", "examples/bcd_to_7seg.json", "examples/nand_sr_latch.json", "examples/d_flipflop.json",
];
const sets = [
  { ref, dir: new URL("../src/sim/", here), files: ["sim/simulate.mjs", "sim/logic.mjs", "sim/README.md"] },
  { ref, dir: new URL("../test/model/", here), files: ["validate/jsonschema.mjs", "validate/formats.mjs", "schema/circuit.schema.json", "schema/scenario.schema.json", "schema/trace.schema.json", "examples/nand_sr_latch.json"] },
  { ref: logicRef, keepPaths: true, dir: new URL("../../logic/analyze/model/", here), files: logicFiles },
];
const only = arg("--only", null);   // "logic": copy just the logic tools' set
for (const set of sets) {
  if (only === "logic" && !set.keepPaths) continue;
  const commit = await git(["rev-parse", `${set.ref}^{commit}`]);
  await Deno.mkdir(set.dir, { recursive: true });
  const manifest = { note: "Written by tools/shared/scripts/copy-model.js. Do not edit this folder by hand.", source: "circuit-model", ref: set.ref, commit, files: [] };
  for (const file of set.files) {
    const bytes = await git(["show", `${set.ref}:${file}`], true);
    const name = set.keepPaths ? file : file.split("/").pop();
    if (set.keepPaths) await Deno.mkdir(new URL(name.replace(/[^/]*$/, ""), set.dir), { recursive: true });
    await Deno.writeFile(new URL(name, set.dir), bytes);
    manifest.files.push({ name, from: file, bytes: bytes.length, sha256: await sha256(bytes) });
  }
  await Deno.writeTextFile(new URL("MANIFEST.json", set.dir), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Copied ${set.files.length} files from circuit-model ${set.ref} @ ${commit.slice(0, 7)} to ${path(set.dir)}`);
}
