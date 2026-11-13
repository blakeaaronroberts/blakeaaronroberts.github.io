// Write the sample figures as saved files and SVG exports:
//
//   quarto run tools/figure-editor-beta/scripts/build-sample.js
//
// examples/full-adder.json and .svg           the full adder from gates (examples/full-adder.js)
// examples/full-adder-levels.json and .svg    the same with labels and logic levels (examples/full-adder-levels.js)
// examples/ripple-carry-blocks.json and .svg  a 4-bit ripple-carry adder in block form (examples/ripple-carry-blocks.js)
// examples/cla-chevron.json and .svg          an N-bit carry-lookahead adder, chevron form, with buses (examples/cla-chevron.js)
//
// The labels' glyph outlines come from test/fixtures/mathjax.json, real MathJax 4 output captured by
// test/fixtures/capture-mathjax.html. The editor in the browser typesets the same strings live; the
// page's export and this one are the same file (checked by hand when the labelled sample changes).

import { loadPack } from "../src/pack.js";
import { lint, serialize } from "../src/doc.js";
import { exportSvg } from "../src/export.js";
import { parseTypeset } from "../src/labels.js";
import { buildFullAdder } from "../examples/full-adder.js";
import { buildFullAdderLevels } from "../examples/full-adder-levels.js";
import { buildRippleCarryBlocks } from "../examples/ripple-carry-blocks.js";
import { buildClaChevron } from "../examples/cla-chevron.js";

const packDir = new URL("../symbol-pack/", import.meta.url);
const out = new URL("../examples/", import.meta.url);
const pack = await loadPack((p) => Deno.readTextFile(new URL(p, packDir)));
const captured = JSON.parse(await Deno.readTextFile(new URL("../test/fixtures/mathjax.json", import.meta.url)));
const typeset = new Map(Object.entries(captured.svg).map(([tex, svg]) => [tex, parseTypeset(svg)]));

for (const [stem, doc] of [
  ["full-adder", buildFullAdder(pack)], ["full-adder-levels", buildFullAdderLevels(pack)],
  ["ripple-carry-blocks", buildRippleCarryBlocks(pack)], ["cla-chevron", buildClaChevron(pack)],
]) {
  await Deno.writeTextFile(new URL(`${stem}.json`, out), serialize(doc, pack));
  await Deno.writeTextFile(new URL(`${stem}.svg`, out), exportSvg(doc, pack, { typeset }));
  const warnings = lint(doc, pack);
  console.log(`examples/${stem}.json and .svg: ${doc.elements.length} elements, ${doc.wires.length} wires, ${doc.junctions.length} junctions, ${doc.ports.length} ports, ${doc.labels.length} labels`);
  console.log(warnings.length ? `  Warnings:\n    ${warnings.join("\n    ")}` : "  No warnings.");
}
