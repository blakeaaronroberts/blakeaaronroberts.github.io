// Wire levels: colours from the theme's roles, on wires, pin leads, joints and junction dots;
// the optional 0/1/X/Z tag; and the unavailable levels of a theme that lacks a role.
// (Saving and loading levels is in roundtrip.test.js.)

import { addElement, addWire, lint, newDoc, setLevel } from "../src/doc.js";
import { drawing, exportSvg, tagAnchor } from "../src/export.js";
import { LEVELS } from "../src/pack.js";
import { buildFullAdderLevels, INPUTS, propagate } from "../examples/full-adder-levels.js";
import { deriveNets } from "../src/doc.js";
import { assert, assertEquals, assertThrows, pack, packWith, typeset } from "./helpers.js";

const P = (at) => ({ kind: "point", at });
const roles = pack.theme.roles;

Deno.test("each level is coloured by its theme role; a theme without the role leaves the level unavailable", async () => {
  assertEquals(LEVELS.map((l) => [l.value, l.role]), [["0", "low"], ["1", "high"], ["X", "unknown"], ["Z", "floating"]]);
  assertEquals(["0", "1", "X", "Z"].map((v) => pack.levelColour(v)), [roles.low, roles.high, roles.unknown, roles.floating]);
  assertEquals(pack.levelColour("Q"), null);
  const old = await packWith((p, j) => { if (p === "theme.json") { delete j.roles.unknown; delete j.roles.floating; } });
  assertEquals([old.levelColour("1"), old.levelColour("X"), old.levelColour("Z")], [roles.high, null, null]);
});

Deno.test("a wire is drawn at its level's colour, and with no level in the default ink", () => {
  let doc = addWire(newDoc(), pack, P([0, 0]), P([10, 0])).doc;
  doc = addWire(doc, pack, P([0, 4]), P([10, 4])).doc;
  doc = setLevel(doc, ["w1"], "1");
  const d = drawing(doc, pack);
  assertEquals(d.wires.map((w) => [w.id, w.level, w.colour]), [["w1", "1", roles.high], ["w2", null, roles.ink]]);
  const svg = exportSvg(doc, pack);
  assert(svg.includes(`<path stroke="${roles.high}" d="M 0 0 L 5 0"/>`), "the level-1 wire carries its own stroke");
  assert(svg.includes(`<path d="M 0 -2 L 5 -2"/>`), "the other wire inherits the group's ink");
});

Deno.test("all four levels draw, each in its own colour", () => {
  let doc = newDoc();
  for (const [i, level] of ["0", "1", "X", "Z"].entries()) {
    doc = addWire(doc, pack, P([0, 4 * i]), P([10, 4 * i])).doc;
    doc = setLevel(doc, [`w${i + 1}`], level);
  }
  assertEquals(drawing(doc, pack).wires.map((w) => w.colour), [roles.low, roles.high, roles.unknown, roles.floating]);
});

Deno.test("a pin's lead takes the colour of the wire that ends on it; other leads keep the pack's", () => {
  let doc = addElement(newDoc(), pack, "and_gate", [0, 0]).doc;
  doc = addWire(doc, pack, P([-12, 1]), { kind: "pin", ref: "and1.A" }).doc;
  doc = setLevel(doc, ["w1"], "1");
  const el = drawing(doc, pack).elements[0];
  const lead = {};
  const visit = (n) => { if (n.pin) lead[n.pin] = n.attrs.find(([k]) => k === "stroke")[1]; n.children.forEach(visit); };
  el.nodes.forEach(visit);
  assertEquals(lead, { A: roles.high, B: roles.ink, Y: roles.ink });
});

Deno.test("a junction's dot and a line joint take their wire's level colour", () => {
  let doc = addWire(newDoc(), pack, P([-10, 0]), P([10, 0])).doc;
  doc = addWire(doc, pack, P([0, 8]), { kind: "wire", id: "w1", at: [0, 0] }).doc;
  doc = addWire(doc, pack, { kind: "junction", id: "j1" }, P([0, -8])).doc;
  assertEquals(drawing(doc, pack).dots.map((d) => d.colour), [roles.ink]);
  doc = setLevel(doc, ["w1"], "X");
  const d = drawing(doc, pack);
  assertEquals(d.dots.map((x) => x.colour), [roles.unknown]);
  assert(exportSvg(doc, pack).includes(`fill="${roles.unknown}"`), "the dot's own fill is written");
});

Deno.test("a level whose role the theme lacks is drawn in ink, and the lint says so", async () => {
  const old = await packWith((p, j) => { if (p === "theme.json") delete j.roles.unknown; });
  let doc = addWire(newDoc(), old, P([0, 0]), P([10, 0])).doc;
  doc = setLevel(doc, ["w1"], "X");
  assertEquals(drawing(doc, old).wires[0].colour, old.theme.roles.ink);
  assert(lint(doc, old).some((w) => /level X.*no colour/.test(w)), lint(doc, old).join("; "));
});

Deno.test("setLevel validates, clears and applies to every wire given", () => {
  let doc = addWire(addWire(newDoc(), pack, P([0, 0]), P([10, 0])).doc, pack, P([0, 4]), P([10, 4])).doc;
  doc = setLevel(doc, ["w1", "w2"], "Z");
  assertEquals(doc.wires.map((w) => w.level), ["Z", "Z"]);
  doc = setLevel(doc, ["w2"], null);
  assertEquals(doc.wires.map((w) => w.level), ["Z", undefined]);
  assertThrows(() => setLevel(doc, ["w1"], "2"), /0, 1, X or Z/);
  assertThrows(() => setLevel(doc, ["w1"], "high"), /0, 1, X or Z/);
});

Deno.test("level tags are off by default; on, each levelled wire gets its level beside its longest segment", () => {
  let doc = addWire(newDoc(), pack, P([0, 0]), P([10, 0])).doc;
  doc = addWire(doc, pack, P([20, 0]), P([20, 12])).doc;
  doc = addWire(doc, pack, P([30, 0]), P([40, 0])).doc;          // no level: no tag
  doc = setLevel(setLevel(doc, ["w1"], "1"), ["w2"], "0");
  assertEquals(drawing(doc, pack, { typeset }).labels.length, 0);
  const d = drawing(doc, pack, { typeset, levelTags: true });
  assertEquals(d.labels.map((l) => l.key), ["tag:w1", "tag:w2"]);
  assertEquals(tagAnchor([[0, 0], [10, 0]]), { at: [5, 0], dir: [0, 1] });       // horizontal: above
  assertEquals(tagAnchor([[0, 0], [2, 0], [2, 12]]), { at: [2, 6], dir: [1, 0] }); // longest is vertical: to its right
  assert(exportSvg(doc, pack, { typeset }).split("\n").filter((l) => /scale\(/.test(l)).length === 0, "default export has no tags");
  assertEquals(exportSvg(doc, pack, { typeset, levelTags: true }).split("\n").filter((l) => /^  <g transform="translate\([-\d. ]+\) scale\(/.test(l)).length, 2);
});

Deno.test("the labelled sample's levels are the ones the logic gives for A=1, B=0, Cin=1", () => {
  const doc = buildFullAdderLevels(pack);
  const { value, netOf } = propagate(doc, deriveNets(doc, pack), INPUTS);
  const v = (ref) => value.get(netOf.get(ref));
  assertEquals([v("S"), v("Cout"), v("xor1.Y"), v("and1.Y"), v("and2.Y"), v("and3.Y"), v("or1.Y")], [0, 1, 1, 0, 0, 1, 0]);
  assertEquals(doc.wires.every((w) => w.level === "0" || w.level === "1"), true);
  const level = Object.fromEntries(doc.wires.map((w) => [w.id, w.level]));
  assertEquals([level.w1, level.w2, level.w3, level.w11, level.w16], ["1", "0", "1", "0", "1"]);   // A bus, B bus, Cin bus, S, Cout
  const dots = drawing(doc, pack, { typeset }).dots.map((d) => d.colour);
  assertEquals(dots, [roles.high, roles.high]);                                                      // the A and Cin junctions carry 1
});
