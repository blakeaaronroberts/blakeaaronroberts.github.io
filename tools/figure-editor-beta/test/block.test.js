// F5.1: the built-in block. Its pin rule, its drawn outline and leads, editing, save and open, dark drawing.

import {
  addElement, addWire, deleteSelection, endpoint, lint, moveSelection, newDoc, parse, resizeBlock, serialize, setBlockParams, wireCorners,
} from "../src/doc.js";
import {
  BLOCK, blockDef, blockGeometry, blockNodes, canonicalParams, formatPins, handlesOf, minSize, normalizeBlock, parsePins,
} from "../src/block.js";
import { drawing, exportSvg } from "../src/export.js";
import { hitTest } from "../src/hit.js";
import { labelItems, texNeeded } from "../src/labels.js";
import { PRESETS } from "../src/presets.js";
import { assert, assertClose, assertEquals, assertThrows, pack, typeset } from "./helpers.js";

const rect = (w, h, pins = {}, extra = {}) => ({ shape: "rect", w, h, pins, ...extra });
const place = (params, at = [0, 0], rotation = 0) => addElement(newDoc(), pack, BLOCK, at, rotation, params);
const P = (at) => ({ kind: "point", at });

Deno.test("pin rule: pins are one module apart, centred on the side, in drawing order", () => {
  const g = blockGeometry(rect(4, 6, { left: ["A", "B", "C"], right: ["Y"], top: ["T1", "T2"], bottom: ["S"] }));
  assertEquals(g.pins.A.tip, [-4, 2]);       // left, top to bottom: +2, 0, -2 (one module = 2 steps apart)
  assertEquals(g.pins.B.tip, [-4, 0]);
  assertEquals(g.pins.C.tip, [-4, -2]);
  assertEquals(g.pins.Y.tip, [4, 0]);        // a single pin sits at the middle
  assertEquals(g.pins.T1.tip, [-1, 6]);      // top, left to right: -1, +1
  assertEquals(g.pins.T2.tip, [1, 6]);
  assertEquals(g.pins.S.tip, [0, -6]);
  assertEquals([g.pins.A.direction, g.pins.Y.direction, g.pins.T1.direction, g.pins.S.direction], ["left", "right", "up", "down"]);
  for (const q of Object.values(g.pins)) assert(q.tip.every(Number.isInteger), `${q.tip} is a whole grid step`);
});

Deno.test("pin rule: each side is at least pins + 1 modules long, so w and h are raised to that", () => {
  assertEquals(minSize({ left: ["a", "b", "c"], top: ["x"] }), { w: 2, h: 4 });
  assertEquals(minSize({}), { w: 1, h: 1 });
  const p = normalizeBlock(rect(1, 1, { left: ["A", "B", "C", "D"], bottom: ["S", "T"] }));
  assertEquals([p.w, p.h], [3, 5]);
  assertEquals([blockDef(rect(1, 1, { left: ["A", "B"] })).bbox.max[1]], [3]);   // half-height is h steps
});

Deno.test("pins with an even or odd count stay on whole steps for every size", () => {
  for (let n = 1; n <= 8; n++) {
    const names = Array.from({ length: n }, (_, i) => `P${i}`);
    for (const shape of ["rect", "chevron", "triangle", "circle"]) {
      const g = blockGeometry({ shape, w: 1, h: 1, pins: { left: names, top: names.map((s) => `T${s}`) } });
      for (const q of Object.values(g.pins)) assert(q.tip.every(Number.isInteger), `${shape} ${n}: ${q.tip}`);
      assert(g.params.w >= n + 1 && g.params.h >= n + 1);
    }
  }
});

Deno.test("bad params are refused with a reason", () => {
  assertThrows(() => normalizeBlock({ shape: "hexagon", w: 2, h: 2 }), /shape must be/);
  assertThrows(() => normalizeBlock({ shape: "rect", w: 0, h: 2 }), /whole number of modules/);
  assertThrows(() => normalizeBlock({ shape: "rect", w: 2.5, h: 2 }), /whole number of modules/);
  assertThrows(() => normalizeBlock({ shape: "rect", w: 2, h: 2, pins: { left: ["A", "A"] } }), /used twice/);
  assertThrows(() => normalizeBlock({ shape: "rect", w: 2, h: 2, pins: { left: ["a.b"] } }), /not a pin name/);
  assertThrows(() => normalizeBlock({ shape: "rect", w: 2, h: 2, pins: { middle: ["A"] } }), /unknown side/);
  assertThrows(() => normalizeBlock({ shape: "rect", w: 2, h: 2, colour: "red" }), /unknown field/);
  assertThrows(() => normalizeBlock(null), /needs params/);
  assertThrows(() => addElement(newDoc(), pack, BLOCK, [0, 0], 0, null), /needs params/);
});

Deno.test("every preset is valid, lint-clean, and has all its pins on whole steps on the outline's box", () => {
  assert(PRESETS.length >= 19);
  const ids = new Set();
  for (const preset of PRESETS) {
    assert(!ids.has(preset.id), `${preset.id} twice`); ids.add(preset.id);
    const doc = place(preset.params).doc;
    assertEquals(lint(doc, pack), [], preset.id);
    const g = blockGeometry(canonicalParams(preset.params));
    for (const [name, q] of Object.entries(g.pins)) {
      const onBox = Math.abs(q.tip[0]) === g.params.w || Math.abs(q.tip[1]) === g.params.h;
      assert(onBox, `${preset.id}.${name} tip ${q.tip} is on the box edge`);
    }
    // what the preset puts in a file is exactly its canonical params
    assertEquals(doc.elements[0].params, canonicalParams(preset.params));
  }
});

Deno.test("leads: a rect pin sits on the outline (no lead); a chevron's reach the notch; a triangle's reach the slope", () => {
  const rectG = blockGeometry(rect(4, 4, { left: ["A", "B"] }));
  assertEquals(rectG.pins.A.lead.length, 0);
  const chev = blockGeometry({ shape: "chevron", w: 4, h: 4, pins: { left: ["A"], right: ["Y"] } });
  assertEquals(chev.pins.A.tip, [-4, 0]);
  assertEquals(chev.pins.A.lead.from, [-2, 0]);        // the notch is one module (2 steps) deep, so the lead runs to its apex
  assertEquals(chev.pins.Y.lead.length, 0);
  const chev2 = blockGeometry({ shape: "chevron", w: 4, h: 4, pins: { left: ["A", "B"] } });
  // the notch edge runs from (-4, 4) to (-2, 0): at y = 1 it is at x = -2.5, so the lead is 1.5 steps
  assertClose(chev2.pins.A.lead.length, 1.5, 1e-9);
  assertClose(chev2.pins.A.lead.from[0], -2.5, 1e-9);
  const tri = blockGeometry({ shape: "triangle", w: 4, h: 4, pins: { left: ["In"], right: ["Out"], top: ["T"] } });
  assertEquals(tri.pins.In.lead.length, 0);
  assertEquals(tri.pins.Out.lead.length, 0);           // the apex
  assertClose(tri.pins.T.lead.length, 2, 1e-9);        // top pin at x = 0: the slope is at y = 2
  const circ = blockGeometry({ shape: "circle", w: 3, h: 3, pins: { left: ["P"], bottom: ["M"], right: ["Y"] } });
  for (const n of ["P", "M", "Y"]) assertClose(circ.pins[n].lead.length, 0, 1e-9);
});

Deno.test("a block is one closed outline plus a lead per pin that needs one: no butted lines, so no gap at a corner or the notch", () => {
  const nodes = blockNodes({ shape: "chevron", w: 4, h: 4, pins: { left: ["A", "B"], right: ["Y"] } }, pack);
  assertEquals(nodes.length, 3);                         // outline + two leads (the right pin is on the outline)
  const outline = nodes[0].attrs.find(([k]) => k === "d")[1];
  assert(outline.endsWith("Z") && outline.split("M").length === 2, `one closed subpath: ${outline}`);
  assertEquals(nodes[0].attrs.find(([k]) => k === "stroke-linejoin")[1], pack.theme.line.join);
  assertEquals(nodes.slice(1).map((n) => n.pin), ["A", "B"]);
  // each lead runs on past the outline by a fraction of a line width, and the nodes carry every attribute themselves
  for (const n of nodes) for (const k of ["stroke", "stroke-width", "fill"]) assert(n.attrs.some(([a]) => a === k), `${k} on ${n.pin ?? "outline"}`);
});

Deno.test("a placed block: pins resolve, wires anchor to them and follow the block when it moves", () => {
  let { doc, id } = place(rect(4, 4, { left: ["A", "B"], right: ["Y"] }), [10, 6]);
  assertEquals(id, "blk1");
  assertEquals(endpoint(doc, pack, "blk1.A").at, [6, 7]);
  assertEquals(endpoint(doc, pack, "blk1.A").dir, [-1, 0]);
  assertEquals(endpoint(doc, pack, "blk1.Y").at, [14, 6]);
  doc = addWire(doc, pack, P([0, 7]), { kind: "pin", ref: "blk1.A" }).doc;
  assertEquals(wireCorners(doc, pack, doc.wires[0]).at(-1), [6, 7]);
  doc = moveSelection(doc, pack, { elements: ["blk1"] }, [4, -2]);
  assertEquals(wireCorners(doc, pack, doc.wires[0]).at(-1), [10, 5]);
  assertEquals(lint(doc, pack), []);
});

Deno.test("a rotated and a mirrored block put their pins where the transform says", () => {
  const params = { shape: "chevron", w: 4, h: 3, pins: { left: ["A", "B"], right: ["Y"] } };
  const rot = place(params, [0, 0], 90).doc;
  assertEquals(endpoint(rot, pack, "blk1.A").at, [-1, -4]);     // left pins turn to the bottom, 90 degrees counter-clockwise
  assertEquals(endpoint(rot, pack, "blk1.Y").at, [0, 4]);
  const mir = { ...place(params).doc };
  mir.elements = mir.elements.map((e) => ({ ...e, mirror: true }));
  assertEquals(endpoint(mir, pack, "blk1.A").at, [4, 1]);       // mirrored: the notch and the left pins are on the right
  assertEquals(pack.mirrorable(BLOCK), true);
});

Deno.test("hit testing finds a block's pins and body", () => {
  const { doc } = place(rect(4, 4, { left: ["A"] }), [0, 0]);
  const hits = hitTest(doc, pack, [-4, 0]);
  assert(hits.some((h) => h.kind === "pin" && h.ref === "blk1.A"));
  assert(hitTest(doc, pack, [1, 1]).some((h) => h.kind === "element" && h.id === "blk1"));
  assertEquals(hitTest(doc, pack, [30, 30]), []);
});

Deno.test("setBlockParams: a bigger pin list raises the size about the centre; a rename keeps its wires; a removed pin frees its wire", () => {
  let doc = place(rect(4, 4, { left: ["A", "B"], right: ["Y"] }), [0, 0]).doc;
  doc = addWire(doc, pack, P([-12, 1]), { kind: "pin", ref: "blk1.A" }).doc;
  doc = addWire(doc, pack, { kind: "pin", ref: "blk1.Y" }, P([12, 0])).doc;
  const grown = setBlockParams(doc, pack, "blk1", { pins: { left: ["A", "B", "C", "D"], right: ["Y"] } });
  assertEquals([grown.elements[0].params.w, grown.elements[0].params.h], [4, 5]);
  assertEquals(grown.elements[0].at, [0, 0]);
  const renamed = setBlockParams(doc, pack, "blk1", { pins: { left: ["X1", "B"], right: ["Y"] } });
  assertEquals(renamed.wires[0].to, "blk1.X1");                // same count on that side: a rename, the wire follows
  const removed = setBlockParams(doc, pack, "blk1", { pins: { left: ["A", "B"] } });
  assertEquals(removed.wires[1].from, [4, 0]);                  // Y is gone: the wire keeps its drawn end as a free end
  assertEquals(lint(removed, pack), []);
  assertThrows(() => setBlockParams(doc, pack, "blk1", { shape: "hexagon" }), /shape must be/);
  assertThrows(() => setBlockParams(doc, pack, "nope", {}), /not a block/);
});

Deno.test("resizeBlock: the opposite edge stays put, the pin rule is the floor, wires on pins follow, rotation is respected", () => {
  let doc = place(rect(4, 4, { left: ["A", "B"], right: ["Y"] }), [10, 0]).doc;
  doc = addWire(doc, pack, { kind: "pin", ref: "blk1.Y" }, P([30, 0])).doc;
  const left = (d) => d.elements[0].at[0] - d.elements[0].params.w;
  const right = (d) => d.elements[0].at[0] + d.elements[0].params.w;
  const e = resizeBlock(doc, pack, "blk1", "e", 2, 0);
  assertEquals([e.elements[0].params.w, left(e), right(e)], [6, left(doc), right(doc) + 2 * 2]);   // two modules wider: right edge +4 steps
  const w = resizeBlock(doc, pack, "blk1", "w", 1, 0);
  assertEquals([w.elements[0].params.w, right(w), left(w)], [5, right(doc), left(doc) - 2]);
  assertEquals(wireCorners(e, pack, e.wires[0])[0], [18, 0]);                                        // the wire's end followed the pin
  const small = resizeBlock(doc, pack, "blk1", "se", -9, -9);
  assertEquals([small.elements[0].params.w, small.elements[0].params.h], [1, 3]);                    // floor: three pins' rule on the left side is 2 pins -> h >= 3
  // a rotated block grows along its own frame: a 90 degree turn puts its width along the document's y
  let r = place(rect(4, 4, { left: ["A"] }), [0, 0], 90).doc;
  r = resizeBlock(r, pack, "blk1", "e", 1, 0);
  assertEquals([r.elements[0].params.w, r.elements[0].at], [5, [0, 1]]);
  assertThrows(() => resizeBlock(doc, pack, "blk1", "e", 0.5, 0), /whole modules/);
  assertEquals(handlesOf(rect(4, 4)).length, 8);
});

Deno.test("pin lists: text to pins and back, commas inside a label stay in the label", () => {
  assertEquals(parsePins("A, B: $B_1$, Cin: $C_{in}$"), [{ name: "A" }, { name: "B", label: "$B_1$" }, { name: "Cin", label: "$C_{in}$" }]);
  assertEquals(parsePins("X: $f(a,b)$, Y"), [{ name: "X", label: "$f(a,b)$" }, { name: "Y" }]);
  assertEquals(parsePins("  "), []);
  assertEquals(formatPins(parsePins("A, B: $B_1$")), "A, B: $B_1$");
  assertThrows(() => parsePins("A b"), /not a pin name/);
});

Deno.test("a block's own text: the label in the middle and each pin's label, upright, with the TeX needed to draw them", () => {
  const params = { shape: "rect", w: 4, h: 4, label: "FA", pins: { left: [{ name: "A", label: "$A$" }], right: [{ name: "S", label: "$S$" }, "C"] } };
  const doc = place(params, [10, 0], 90).doc;
  const items = labelItems(doc, pack);
  assertEquals(items.map((i) => [i.key, i.kind, i.tex]), [
    ["block:blk1", "block", "\\text{FA}"], ["pin:blk1.A", "pin", "A"], ["pin:blk1.S", "pin", "S"],
  ]);
  assertEquals(items[0].at, [10, 0]);
  assertEquals(items[0].dir, null);
  // rotated 90 degrees: the left pin A is at the bottom, so its label sits above it (inward), a little inside the outline
  assertEquals(items[1].dir, [0, 1]);
  assertClose(items[1].at[1], -4 + 0.3, 1e-9);
  assert(texNeeded(doc, pack).includes("\\text{FA}"));
});

Deno.test("save and open: a block survives byte-identical, with its params in canonical order and pins as names or {name, label}", () => {
  let doc = place({ w: 4, shape: "chevron", h: 4, label: "", pins: { right: ["Y"], left: [{ name: "A", label: "$A$" }, { name: "B", label: "" }] } }, [0, 0]).doc;
  doc.elements[0].label = "$ADD_1$";
  const text = serialize(doc, pack);
  assert(text.includes('"params": { "shape": "chevron", "w": 4, "h": 4, "pins": { "left": [{ "name": "A", "label": "$A$" }, "B"], "right": ["Y"] } }'), text);
  const again = serialize(parse(text).doc, pack);
  assertEquals(again, text);
  assertEquals(parse(text).doc.elements[0].params.pins.left[1], "B");
  assertEquals(text.indexOf('"label": "$ADD_1$"') < text.indexOf('"params"'), true);   // key order: label before params
});

Deno.test("open refuses a block file with bad params, naming the element and the problem", () => {
  const file = (params, extra = {}) => JSON.stringify({ schema: "circuit/0.2", id: "x", grid_cm: 0.25, elements: [{ id: "b1", type: "block", at: [0, 0], ...extra, params }] });
  assertThrows(() => parse(file({ shape: "hexagon", w: 2, h: 2 })), /elements\[0\]: block shape must be/);
  assertThrows(() => parse(file({ shape: "rect", w: 2 })), /whole number of modules/);
  assertThrows(() => parse(JSON.stringify({ schema: "circuit/0.2", id: "x", grid_cm: 0.25, elements: [{ id: "b1", type: "block", at: [0, 0] }] })), /needs params/);
  assertThrows(() => parse(file({ shape: "rect", w: 2, h: 2 }, { level: "2" })), /level must be/);
  assertEquals(parse(file({ shape: "rect", w: 2, h: 2 })).doc.elements[0].params.shape, "rect");
});

Deno.test("deleting a block frees its wires; copy keeps the params", () => {
  let doc = place(rect(4, 4, { left: ["A"] }), [0, 0]).doc;
  doc = addWire(doc, pack, P([-12, 0]), { kind: "pin", ref: "blk1.A" }).doc;
  const gone = deleteSelection(doc, pack, { elements: ["blk1"] });
  assertEquals(gone.wires[0].to, [-4, 0]);
});

Deno.test("dark: a block is drawn in the theme's ink, never black, in the drawing and in the export", () => {
  const dark = pack.withTheme({ ink: "#E6E6E6", low: "#E6E6E6", background: "#131211" });
  const { doc } = place({ shape: "chevron", w: 4, h: 4, pins: { left: ["A", "B"], right: ["Y"] } });
  const d = drawing(doc, dark, { typeset });
  const colours = new Set();
  const visit = (n) => { n.attrs.forEach(([k, v]) => { if ((k === "stroke" || k === "fill") && v !== "none") colours.add(v.toUpperCase()); }); n.children.forEach(visit); };
  d.elements[0].nodes.forEach(visit);
  assertEquals([...colours], ["#E6E6E6"]);
  const svg = exportSvg(doc, dark, { typeset });
  assert(!/#000000/i.test(svg), "no black in the dark export");
  assert(/<path/.test(svg) && !/<text|href=/.test(svg));
  assert(/#000000/i.test(exportSvg(doc, pack, { typeset })), "the light export is black ink");
});

Deno.test("a block's box bounds the export, so nothing is cropped", () => {
  const { doc } = place(rect(6, 4), [0, 0]);
  const d = drawing(doc, pack, { typeset });
  assert(d.box.min[0] <= -3 && d.box.max[0] >= 3 && d.box.min[1] <= -2 && d.box.max[1] >= 2, JSON.stringify(d.box));
});
