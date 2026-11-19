// F5.3: an element's logic level colours its body; its leads keep their wire's colour.

import { addElement, addWire, lint, newDoc, parse, serialize, setLevel } from "../src/doc.js";
import { BLOCK } from "../src/block.js";
import { drawing, exportSvg } from "../src/export.js";
import { labelItems, texNeeded } from "../src/labels.js";
import { assert, assertEquals, pack, typeset } from "./helpers.js";

const roles = pack.theme.roles;
const P = (at) => ({ kind: "point", at });
const block = { shape: "chevron", w: 4, h: 4, label: "FA", pins: { left: ["A", "B"], right: ["Y"] } };

const strokes = (nodes) => {
  const out = [];
  const visit = (n) => { n.attrs.forEach(([k, v]) => { if (k === "stroke" && v !== "none") out.push([n.pin ?? "body", v]); }); n.children.forEach(visit); };
  nodes.forEach(visit);
  return out;
};

/** A leveled block with one wire (level 1) on its pin A and nothing on pin B. */
function scene(level = "X") {
  let doc = addElement(newDoc(), pack, BLOCK, [0, 0], 0, block).doc;
  doc = addWire(doc, pack, P([-12, 1]), { kind: "pin", ref: "blk1.A" }).doc;
  doc = setLevel(doc, ["w1"], "1", ["blk1"]);
  doc.elements[0].level = level;
  return doc;
}

Deno.test("a block's body is drawn in its level's colour, and its leads keep their wire's colour (or the ink)", () => {
  const d = drawing(scene("X"), pack, { typeset });
  const s = strokes(d.elements[0].nodes);
  assertEquals(s.find(([n]) => n === "body")[1], roles.unknown);       // the outline
  assertEquals(s.find(([n]) => n === "A")[1], roles.high);             // the lead whose wire is at level 1
  assertEquals(s.find(([n]) => n === "B")[1], roles.ink);              // a lead with no wire
});

Deno.test("a block's middle text, pin labels and own label stay ink; only the body takes the level colour (F15)", () => {
  const doc = scene("1");
  doc.elements[0].params.pins.left[0] = { name: "A", label: "$A$" };
  const labels = drawing(doc, pack, { typeset: new Map([...typeset, ["\\text{FA}", typeset.get("X")]]) }).labels;
  const colourOf = (l) => { let c = null; const v = (n) => { for (const [k, x] of n.attrs) if (k === "fill" || k === "stroke") c = x; n.children.forEach(v); }; l.nodes.forEach(v); return c; };
  const middle = labels.find((l) => l.key === "block:blk1"), pin = labels.find((l) => l.key === "pin:blk1.A");
  assertEquals(colourOf(middle), roles.ink);
  assertEquals(colourOf(pin), roles.ink);
});

Deno.test("a pack symbol's body is recoloured, its leads are not", () => {
  let doc = addElement(newDoc(), pack, "and_gate", [0, 0]).doc;
  const plain = strokes(drawing(doc, pack).elements[0].nodes);
  assert(plain.every(([, v]) => v.toUpperCase() === roles.ink.toUpperCase()), "ink by default");
  doc = setLevel(doc, [], "1", ["and1"]);
  const s = strokes(drawing(doc, pack).elements[0].nodes);
  const body = s.filter(([n]) => n === "body"), leads = s.filter(([n]) => n !== "body");
  assert(body.length > 0 && body.every(([, v]) => v.toUpperCase() === roles.high.toUpperCase()), `body strokes ${JSON.stringify(body)}`);
  assert(leads.length > 0 && leads.every(([, v]) => v.toUpperCase() === roles.ink.toUpperCase()), `lead strokes ${JSON.stringify(leads)}`);
  // glyph fills in the symbol body follow too, and nothing is left black
  const svg = exportSvg(doc, pack, { typeset });
  assert(svg.includes(roles.high), "the level colour is in the file");
});

Deno.test("the dark theme's level colours are used, never the light ones", () => {
  const dark = pack.withTheme({ ink: "#E6E6E6", low: "#E6E6E6", background: "#131211", high: "#FF8A3D", unknown: "#D98BBA" });
  const svg = exportSvg(scene("X"), dark, { typeset });
  assert(/#D98BBA/i.test(svg) && /#FF8A3D/i.test(svg), "the dark X and 1 colours");
  assert(!/#000000|#CC79A7|#D55E00/i.test(svg), "no light-theme colour is left");
});

Deno.test("setLevel sets and clears the level on wires and elements together; the level is saved between label and params", () => {
  let doc = scene("X");
  doc = setLevel(doc, ["w1"], null, ["blk1"]);
  assertEquals([doc.elements[0].level, doc.wires[0].level], [undefined, undefined]);
  doc = setLevel(doc, [], "Z", ["blk1"]);
  assertEquals(doc.elements[0].level, "Z");
  doc.elements[0].label = "$ADD$";
  const text = serialize(doc, pack);
  assert(/"label": "\$ADD\$", "level": "Z", "params"/.test(text), text);
  assertEquals(serialize(parse(text).doc, pack), text);
  assertEquals(parse(text).doc.elements[0].level, "Z");
});

Deno.test("an element level the theme has no colour for is reported and drawn in the default colour", () => {
  const bare = pack.withTheme({});
  const doc = scene("X");
  const noX = { ...bare, levelColour: (v) => (v === "X" ? null : bare.levelColour(v)) };
  assert(lint(doc, noX).some((m) => /blk1: level X has no colour/.test(m)));
  assertEquals(strokes(drawing(doc, noX).elements[0].nodes).find(([n]) => n === "body")[1], roles.ink);
});

Deno.test("level tags: a leveled element shows its level as text, just right of its top-right corner, and the TeX is requested", () => {
  const doc = scene("X");
  assert(!texNeeded(doc, pack).includes("\\mathrm{X}"), "no tag unless asked for");
  assert(texNeeded(doc, pack, { levelTags: true }).includes("\\mathrm{X}"));
  const withTags = new Map(typeset);
  const d = drawing(doc, pack, { typeset: withTags, levelTags: true });
  const tag = d.labels.find((l) => l.key === "tag:blk1");
  assert(tag, "the element's tag is drawn");
  assert(tag.box.min[0] >= 2 - 1e-9, `right of the box's right edge (${tag.box.min[0]})`);   // block right edge at x = 4 steps = 2 modules
  assert(tag.box.min[1] < -2 && tag.box.max[1] > -2, "level with the top edge (y is -2 modules there)");
  assertEquals(labelItems(doc, pack).some((i) => i.kind === "tag"), false);
});

Deno.test("a bad element level is refused on open", () => {
  const file = JSON.stringify({ schema: "circuit/0.2", id: "x", grid_cm: 0.25, elements: [{ id: "a1", type: "and_gate", at: [0, 0], level: "2" }] });
  let msg = "";
  try { parse(file); } catch (e) { msg = e.message; }
  assert(/elements\[0\]: level must be/.test(msg), msg);
});
