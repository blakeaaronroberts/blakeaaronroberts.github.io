// Copy the parts of circuit-model the tools use, pinned by tag (VISION.md section 4: modules connect through formats
// pinned by release tag; no repository imports another's code directly, so the site keeps its own pinned copy).
//
//   quarto run tools/shared/scripts/copy-model.js [--source ../circuit-model] [--ref <tag>] [--logic-ref <tag>] [--only logic]
//
// The only writer of tools/shared/src/sim/ (the simulator, used at run time) and tools/shared/test/model/ (the
// validator and schemas, used by tests to check what the tools write). Files are read from git (`git show <ref>:<path>`),
// not from the working tree, so the copy is exactly what the tag holds. Writes MANIFEST.json (tag, commit, SHA-256 per file).

const here = new URL(".", import.meta.url);
const repoRoot = new URL("../../../", here);
const arg = (name, fallback) => { const i = Deno.args.indexOf(name); return i >= 0 && i + 1 < Deno.args.length ? Deno.args[i + 1] : fallback; };
const path = (u) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, "$1");
const source = path(new URL(arg("--source", "../circuit-model"), repoRoot));
// The tags live in tools/schematic-editor/MODEL_PIN.json and nowhere else (F25.3). --ref and --logic-ref try another tag;
// the pin file is then updated by hand, and tools/schematic-editor/test/manifests.test.js fails until it agrees.
const pin = JSON.parse(await Deno.readTextFile(new URL("../../schematic-editor/MODEL_PIN.json", here)));
const ref = arg("--ref", pin.tag);

async function git(args, binary = false) {
  const r = await new Deno.Command("git", { args: ["-C", source, ...args], stdout: "piped", stderr: "piped" }).output();
  if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${new TextDecoder().decode(r.stderr).trim()}`);
  return binary ? r.stdout : new TextDecoder().decode(r.stdout).trim();
}
const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

// The logic tools (L5 and the rest of tools/logic/) pin their own, newer tag, with the folder layout kept (analyze/ imports
// ../sim and ../logic), so the editors' pin above does not move. Override with --logic-ref.
const logicRef = arg("--logic-ref", pin.logic_tag);
const logicFiles = [
  "sim/simulate.mjs", "sim/logic.mjs",
  ...["circuit", "compare", "expr", "function", "index", "kmap", "qm", "rewrite"].map((n) => `logic/${n}.mjs`),
  "analyze/index.mjs", "analyze/combinational.mjs",
  "validate/jsonschema.mjs", "schema/function.schema.json", "schema/circuit.schema.json",
  "examples/full_adder_gates.json", "examples/comparator_2bit.json", "examples/bcd_to_7seg.json", "examples/nand_sr_latch.json", "examples/d_flipflop.json",
];
// The SystemVerilog importer for the browser (F22.1b; circuit-model C11.1b): the files import/sv/index.mjs and engines-browser.mjs
// reach, with the folder layout kept (they import each other by relative path), plus slang's two files, which
// engines-browser.mjs fetches by default from ../../third_party/slang/. Slang only: Yosys (@yowasp/yosys) is not copied.
const svFiles = [
  "import/sv/index.mjs", "import/sv/engines-browser.mjs", "import/sv/engine-core.mjs", "import/sv/map.mjs", "import/sv/races.mjs", "import/sv/stimulus.mjs",
  "import/layout.mjs", "analyze/combinational.mjs", "logic/expr.mjs", "logic/function.mjs", "logic/qm.mjs",
  "sim/flatten.mjs", "sim/logic.mjs", "sim/simulate.mjs", "validate/jsonschema.mjs",
  "third_party/slang/slang.mjs", "third_party/slang/slang.wasm.gz", "third_party/slang/README.md", "third_party/NOTICES.md",
];
const sets = [
  { ref, dir: new URL("../src/sim/", here), files: ["sim/simulate.mjs", "sim/logic.mjs", "sim/flatten.mjs", "sim/README.md"] },
  { ref, dir: new URL("../test/model/", here), files: ["validate/jsonschema.mjs", "validate/formats.mjs", "schema/circuit.schema.json", "schema/scenario.schema.json", "schema/trace.schema.json", "examples/nand_sr_latch.json", "examples/sv_demo.json", "examples/sv/demo.sv", ["examples/scenarios/sv_demo.json", "sv_demo.scenario.json"], ["examples/traces/sv_demo.json", "sv_demo.trace.json"]] },
  { ref, keepPaths: true, dir: new URL("../src/sv/", here), files: svFiles },
  { ref: logicRef, keepPaths: true, dir: new URL("../../logic/analyze/model/", here), files: logicFiles },
];
const only = arg("--only", null);   // "logic": copy just the logic tools' set
for (const set of sets) {
  if (only === "logic" && !set.keepPaths) continue;
  const commit = await git(["rev-parse", `${set.ref}^{commit}`]);
  const pinned = set.ref === pin.tag ? pin.commit : set.ref === pin.logic_tag ? pin.logic_commit : null;
  if (pinned && commit !== pinned) throw new Error(`${set.ref} is ${commit} in ${source}, but MODEL_PIN.json pins ${pinned}`);
  await Deno.mkdir(set.dir, { recursive: true });
  const manifest = { note: "Written by tools/shared/scripts/copy-model.js. Do not edit this folder by hand.", source: "circuit-model", ref: set.ref, commit, files: [] };
  for (const entry of set.files) {
    const file = Array.isArray(entry) ? entry[0] : entry;   // [path, name in the copy] when two files share a name
    const bytes = await git(["show", `${set.ref}:${file}`], true);
    const name = Array.isArray(entry) ? entry[1] : set.keepPaths ? file : file.split("/").pop();
    if (set.keepPaths) await Deno.mkdir(new URL(name.replace(/[^/]*$/, ""), set.dir), { recursive: true });
    await Deno.writeFile(new URL(name, set.dir), bytes);
    manifest.files.push({ name, from: file, bytes: bytes.length, sha256: await sha256(bytes) });
  }
  await Deno.writeTextFile(new URL("MANIFEST.json", set.dir), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Copied ${set.files.length} files from circuit-model ${set.ref} @ ${commit.slice(0, 7)} to ${path(set.dir)}`);
}
