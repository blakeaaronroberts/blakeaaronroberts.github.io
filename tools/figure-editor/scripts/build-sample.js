// Write the sample figure (examples/full-adder.js) as a saved file and an SVG export:
//
//   quarto run tools/figure-editor/scripts/build-sample.js
//
// Writes examples/full-adder.json (circuit/0.2) and examples/full-adder.svg.

import { loadPack } from "../src/pack.js";
import { lint, serialize } from "../src/doc.js";
import { exportSvg } from "../src/export.js";
import { buildFullAdder } from "../examples/full-adder.js";

const packDir = new URL("../symbol-pack/", import.meta.url);
const out = new URL("../examples/", import.meta.url);
const pack = await loadPack((p) => Deno.readTextFile(new URL(p, packDir)));
const doc = buildFullAdder(pack);
await Deno.writeTextFile(new URL("full-adder.json", out), serialize(doc, pack));
await Deno.writeTextFile(new URL("full-adder.svg", out), exportSvg(doc, pack));
const warnings = lint(doc, pack);
console.log(`examples/full-adder.json and .svg: ${doc.elements.length} elements, ${doc.wires.length} wires, ${doc.junctions.length} junctions`);
console.log(warnings.length ? `Warnings:\n  ${warnings.join("\n  ")}` : "No warnings.");
