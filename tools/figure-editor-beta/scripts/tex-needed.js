// Print the TeX strings the sample figures and the block presets need, as a JSON list, for
// test/fixtures/capture-mathjax.html (it says how to use it):
//
//   quarto run tools/figure-editor/scripts/tex-needed.js
//
// The list is the union of what test/fixtures/mathjax.json already holds and what the figures below need.

import { loadPack } from "../src/pack.js";
import { addElement, newDoc } from "../src/doc.js";
import { BLOCK } from "../src/block.js";
import { texNeeded } from "../src/labels.js";
import { PRESETS } from "../src/presets.js";
import { buildClaChevron as buildCla } from "../examples/cla-chevron.js";
import { buildRippleCarryBlocks } from "../examples/ripple-carry-blocks.js";

const packDir = new URL("../symbol-pack/", import.meta.url);
const pack = await loadPack((p) => Deno.readTextFile(new URL(p, packDir)));
const have = Object.keys(JSON.parse(await Deno.readTextFile(new URL("../test/fixtures/mathjax.json", import.meta.url))).svg);
const need = new Set(have);
const add = (doc) => texNeeded(doc, pack, { levelTags: true }).forEach((t) => need.add(t));
add(buildRippleCarryBlocks(pack));
add(buildCla(pack));
let all = newDoc();
for (const p of PRESETS) all = addElement(all, pack, BLOCK, [0, 0], 0, p.params).doc;
add(all);
for (const t of ["N", "\\text{4}"]) need.add(t);
console.log(JSON.stringify([...need], null, 1));
