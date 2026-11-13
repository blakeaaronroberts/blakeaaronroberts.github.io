// Labels: TeX to MathJax text, outlined paths, placement, and the export with labels in it.
// The MathJax output is real (fixtures/mathjax.json, made by fixtures/capture-mathjax.html).

import { addElement, addLabel, addPort, exitSide, newDoc, setElementLabel, setPort, addWire } from "../src/doc.js";
import { drawing, ExportError, exportSvg } from "../src/export.js";
import { emModules, labelItems, packLabelPt, parseTypeset, placeLabel, REFERENCE_TEX, texNeeded, texOf } from "../src/labels.js";
import { parseXml, walk } from "../src/xml.js";
import { buildFullAdderLevels } from "../examples/full-adder-levels.js";
import { assert, assertClose, assertEquals, assertThrows, mathjaxVersion, pack, typeset } from "./helpers.js";

const ts = (tex) => typeset.get(tex);
const gap = pack.theme.geometry.label_gap_cm / pack.theme.geometry.module_cm;
const em = emModules(pack, 10);

Deno.test("the captured MathJax output is from the version the editor loads", () => {
  assertEquals(mathjaxVersion, "4.1.3");
});

Deno.test("label text becomes TeX: maths as given, words as \\text, mixed as words with maths inside", () => {
  assertEquals(texOf("$A_0$"), "A_0");
  assertEquals(texOf("  $C_{\\mathrm{in}}$ "), "C_{\\mathrm{in}}");
  assertEquals(texOf("4-bit adder"), "\\text{4-bit adder}");
  assertEquals(texOf("Value $x$ here"), "\\text{Value $x$ here}");
  assertEquals(texOf("50% & more_"), "\\text{50\\% \\& more\\_}");
  assertThrows(() => texOf("$A"), /not closed/);
  assertThrows(() => texOf("  "), /empty/);
});

Deno.test("a typeset label is plain paths: no data attributes, ids, styles or fonts, and colour is currentColor", () => {
  for (const tex of ["A", "C_{\\mathrm{in}}", "A \\oplus B", "\\text{4-bit adder}", "\\mathrm{1}"]) {
    const t = ts(tex);
    assert(t.ok, `${tex}: ${t.error}`);
    const tags = new Set(), attrs = new Set();
    for (const n of t.nodes) walk(n, (x) => { tags.add(x.tag); x.attrs.forEach(([k, v]) => { attrs.add(k); if (k === "fill" || k === "stroke") assertEquals(v, "currentColor", tex); }); });
    assert([...tags].every((x) => ["g", "path", "rect"].includes(x)), `${tex}: tags ${[...tags]}`);
    assert(![...attrs].some((k) => k.startsWith("data-") || ["id", "class", "style", "font-family"].includes(k)), `${tex}: attrs ${[...attrs]}`);
  }
});

Deno.test("a label is typeset whole: MathJax's line breaking is off, so operators and spaces do not cut it short", () => {
  const glyphs = (tex) => { let n = 0; for (const node of ts(tex).nodes) walk(node, (x) => { if (x.tag === "path") n++; }); return n; };
  assertEquals(glyphs("A \\oplus B"), 3);                  // A, the circled plus, B (a broken label kept only the A)
  assert(ts("A \\oplus B").width > 2.5, `width ${ts("A \\oplus B").width} em`);
  assertEquals(glyphs("\\text{4-bit adder}"), 11);         // a space does not end the label either
  assertEquals(glyphs("\\text{Value $x$ here}"), 12);
});

Deno.test("sizes come from MathJax's viewBox: height above the baseline, depth below", () => {
  const x = ts("X"), sub = ts("C_{\\mathrm{in}}");
  assertClose(x.height, 0.657, 1e-9); assertClose(x.depth, 0, 1e-9);
  assert(sub.depth > 0.1, "a subscript hangs below the baseline");
});

Deno.test("a glyph outside the STIX2 font, an unknown command and a colour of the label's own are refused", () => {
  const cjk = ts("\\text{\u4e2d}");
  assertEquals(cjk.ok, false);
  assert(/font/.test(cjk.error), cjk.error);
  const unknown = ts("\\notamacro");
  assertEquals(unknown.ok, false);
  assert(/colour of its own \(red\)/.test(unknown.error), unknown.error);
  assertEquals(parseTypeset("<svg").ok, false);
});

Deno.test("label size is points at the pack's own pt-to-cm ratio: 10 pt is 0.703 modules", () => {
  assertClose(em, (10 * 0.03866) / 1.1 / 0.5, 1e-9);
  assertEquals(packLabelPt(pack), 10);                       // the pack carries no label size, so the toolbox's 10 pt
  assertEquals(packLabelPt({ theme: { label: { size_pt: 12 } } }), 12);
});

Deno.test("placement: each side is attached by the edge facing the point, a label gap away", () => {
  const t = ts("A"), ref = ts(REFERENCE_TEX), at = [10, 5];
  const right = placeLabel(t, ref, at, [1, 0], em, gap), left = placeLabel(t, ref, at, [-1, 0], em, gap);
  const up = placeLabel(t, ref, at, [0, -1], em, gap), down = placeLabel(t, ref, at, [0, 1], em, gap), mid = placeLabel(t, ref, at, null, em, gap);
  assertClose(right.box.min[0], at[0] + gap, 1e-9, "right: left edge");
  assertClose(left.box.max[0], at[0] - gap, 1e-9, "left: right edge");
  assertClose(up.box.max[1], at[1] - gap, 1e-9, "above: bottom edge (y is down)");
  assertClose(down.box.min[1], at[1] + gap, 1e-9, "below: top edge");
  assertClose((mid.box.min[0] + mid.box.max[0]) / 2, at[0], 1e-9, "centred");
  assertClose((up.box.min[0] + up.box.max[0]) / 2, at[0], 1e-9, "above is centred across");
});

Deno.test("beside a wire a capital is centred on the point, so A, C_in and B share one baseline", () => {
  const ref = ts(REFERENCE_TEX);
  const ys = ["A", "B", "C_{\\mathrm{in}}"].map((tex) => placeLabel(ts(tex), ref, [0, 3], [-1, 0], em, gap).transform.split(" ")[1]);
  assertEquals(new Set(ys).size, 1);
  const baseline = +ys[0].replace(")", "");
  assertClose(baseline, 3 + (ref.height * em) / 2, 1e-4);
});

Deno.test("labels of a document: ports and free text always, an element's only where the pack gives it a label position", () => {
  let doc = newDoc();
  const r = addElement(doc, pack, "resistor", [0, 0]), g = addElement(r.doc, pack, "and_gate", [10, 0]);
  doc = setElementLabel(setElementLabel(g.doc, "R1", "$R_1$"), "and1", "$G$");
  const p = addPort(doc, pack, [-8, 0]);
  doc = setPort(p.doc, pack, "in1", { label: "$A$", side: "left" });
  doc = addLabel(doc, [4, 8], "4-bit adder").doc;
  const items = labelItems(doc, pack);
  assertEquals(items.map((i) => [i.kind, i.tex]), [["element", "R_1"], ["port", "A"], ["label", "\\text{4-bit adder}"]]);
  assertEquals(items[0].dir, [0, 1]);                              // the resistor's label sits above (pack: direction up)
  assertEquals(items[1].dir, [-1, 0]);
  assertEquals(items[2].dir, null);
});

Deno.test("an element's label turns with the element and stays upright", () => {
  const { doc } = addElement(newDoc(), pack, "voltage_source", [0, 0], 90);
  const labelled = setElementLabel(doc, "V1", "$V$");
  const [item] = labelItems(labelled, pack);
  assertEquals(item.dir, [0, 1]);                                  // pack: right; rotated 90° counter-clockwise: up
  assertEquals(item.at.map((v) => Math.round(v * 1000) / 1000), [-0.5, 1.5]);   // pack anchor [1.5, 0.5], rotated
});

Deno.test("exitSide: outward from a pin tip, away from a wire end, nothing elsewhere", () => {
  let doc = addElement(newDoc(), pack, "and_gate", [0, 0]).doc;
  assertEquals(exitSide(doc, pack, [-4, 1]), "left");              // A pin tip
  assertEquals(exitSide(doc, pack, [5, 0]), "right");              // Y pin tip
  doc = addWire(doc, pack, { kind: "point", at: [20, 0] }, { kind: "point", at: [20, 10] }).doc;
  assertEquals(exitSide(doc, pack, [20, 10]), "up");
  assertEquals(exitSide(doc, pack, [20, 0]), "down");
  assertEquals(exitSide(doc, pack, [3, 3]), null);
});

Deno.test("the drawing places a port's label at its point and reports labels it cannot draw", () => {
  let doc = addPort(newDoc(), pack, [0, 0], "in").doc;
  doc = setPort(doc, pack, "in1", { label: "$A$", side: "left" });
  doc = addLabel(doc, [8, 0], "$\\notamacro$", "up").doc;        // unknown command
  doc = addLabel(doc, [8, 4], "$B$", "up").doc;                    // not typeset (absent from the map)
  const d = drawing(doc, pack, { typeset: new Map([...typeset].filter(([k]) => k !== "B")) });
  assertEquals(d.labels.map((l) => l.key), ["port:in1"]);
  assertClose(d.labels[0].box.max[0], -gap, 1e-9);
  assertEquals(d.pending, ["B"]);
  assertEquals(d.problems.length, 2);
  assert(/colour of its own/.test(d.problems.find((p) => p.includes("notamacro"))));
});

Deno.test("export refuses a figure with a label it cannot draw, instead of leaving it out", () => {
  const doc = addLabel(newDoc(), [0, 0], "$B$", "up").doc;
  assertThrows(() => exportSvg(doc, pack, { typeset: new Map() }), /not typeset yet/);
  try { exportSvg(doc, pack, { typeset: new Map() }); } catch (e) { assert(e instanceof ExportError); }
});

Deno.test("the labelled sample exports with outlined labels only: no text, fonts, links or currentColor", () => {
  const doc = buildFullAdderLevels(pack);
  const svg = exportSvg(doc, pack, { typeset });
  const root = parseXml(svg);
  const tags = new Set(), names = new Set();
  walk(root, (n) => { tags.add(n.tag); n.attrs.forEach(([k]) => names.add(k)); });
  assertEquals([...tags].filter((t) => t !== "#text").sort(), ["circle", "g", "path", "svg", "title"]);
  for (const bad of ["href", "xlink:href", "id", "class", "style", "font-family"]) assert(!names.has(bad), `has ${bad}`);
  assert(![...names].some((k) => k.startsWith("data-")), "data- attribute");
  assert(!/currentColor|<text|@import|url\(/.test(svg), "an unresolved colour, text or a reference");
  const labelGroups = svg.split("\n").filter((l) => /^  <g transform="translate\([-\d. ]+\) scale\(/.test(l));
  assertEquals(labelGroups.length, 6);                              // five port labels and one signal name
});

Deno.test("every TeX string the labelled sample needs is in the captured MathJax output", () => {
  const doc = buildFullAdderLevels(pack);
  for (const tex of texNeeded(doc, pack, { levelTags: true })) assert(typeset.get(tex)?.ok, `${JSON.stringify(tex)} is not in fixtures/mathjax.json (add it to capture-mathjax.html)`);
});
