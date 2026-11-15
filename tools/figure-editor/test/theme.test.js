// The theme: nothing drawn comes from the editor's own constants. Joint size, colours and label
// sizes come from the pack; a private theme recolours; drafts are a switch; scale is an option.

import { addElement, addWire, newDoc } from "../src/doc.js";
import { drawing, exportSvg, exportSize } from "../src/export.js";
import { parsePrivateTheme } from "../src/pack.js";
import { parseXml, walk } from "../src/xml.js";
import { buildFullAdder } from "../examples/full-adder.js";
import { assert, assertClose, assertEquals, assertThrows, pack, packWith } from "./helpers.js";

const P = (at) => ({ kind: "point", at });

Deno.test("the straight-joint size is theme.json's line.straight_joint_frac, not a number in the editor", async () => {
  const joint = (p) => {
    let doc = addWire(newDoc(), p, P([0, 0]), P([6, 0])).doc;
    doc = addWire(doc, p, P([6, 0]), P([12, 0])).doc;                     // straight on: a seam patch at [6, 0]
    return drawing(doc, p).joints.find((j) => j.straight);
  };
  const lw = pack.theme.line.width_module;
  assertClose(joint(pack).r, (lw / 2) * pack.theme.line.straight_joint_frac, 1e-12);
  const half = await packWith((p, j) => { if (p === "theme.json") j.line.straight_joint_frac = 0.5; });
  assertClose(joint(half).r, (lw / 2) * 0.5, 1e-12);
});

Deno.test("a pack with no straight_joint_frac (symbol pack 0.1) is refused with a reason", async () => {
  let err;
  try { await packWith((p, j) => { if (p === "theme.json") delete j.line.straight_joint_frac; }); } catch (e) { err = e; }
  assert(err && /straight_joint_frac/.test(err.message), err?.message);
});

Deno.test("mirror follows the pack's flag: on where mirrorable is true, refused where it is false", () => {
  const flags = Object.fromEntries(pack.types(true).map((t) => [t, pack.mirrorable(t)]));
  assertEquals(flags.and_gate, true);
  assert(Object.values(flags).every((v) => typeof v === "boolean"), "every family says whether it can be mirrored");
  assert(Object.values(flags).some((v) => !v), "some families cannot be mirrored");
  assertEquals(flags.d_flipflop, false);
});

Deno.test("drafts: the palette lists approved elements, and drafts only when asked; replaced families are left out", async () => {
  const withDraft = await packWith((p, j) => { if (p === "index.json") j.elements.find((e) => e.type === "resistor").status = "draft"; });
  assert(!withDraft.types().includes("resistor"));
  assert(withDraft.types(true).includes("resistor"));
  assertEquals(withDraft.statusOf("resistor"), "draft");
  assert(withDraft.types().length < withDraft.types(true).length, "drafts add to the list");
  assert(!pack.types(true).includes("mux2") && pack.allTypes().includes("mux2"), "mux2 is replaced by mux but old figures still draw it");
});

Deno.test("scale: 1 is real size; the option multiplies width and height, never the drawing", () => {
  const doc = buildFullAdder(pack);
  const root = (opts) => Object.fromEntries(parseXml(exportSvg(doc, pack, opts)).attrs);
  const real = root({}), half = root({ scale: 0.5 }), double = root({ scale: 2 });
  const [, , w, h] = real.viewBox.split(" ").map(Number);
  assertEquals(real.width, `${+(w * 0.5).toFixed(5)}cm`);
  assertEquals(half.width, `${+(w * 0.25).toFixed(5)}cm`);
  assertEquals(double.height, `${+(h * 1).toFixed(5)}cm`);
  assertEquals(half.viewBox, real.viewBox);
  const size = exportSize(drawing(doc, pack), 0.5);
  assertClose(size.widthCm, w * 0.25, 1e-9);
  assertThrows(() => exportSvg(doc, pack, { scale: 0 }), /above 0/);
  assertThrows(() => exportSvg(doc, pack, { scale: -1 }), /above 0/);
});

Deno.test("a private theme file: only #RRGGBB roles are accepted", () => {
  assertEquals(parsePrivateTheme('{"roles": {"ink": "#112233", "high": "#aabbcc"}}'), { ink: "#112233", high: "#AABBCC" });
  assertThrows(() => parsePrivateTheme("{"), /not JSON/);
  assertThrows(() => parsePrivateTheme("{}"), /roles/);
  assertThrows(() => parsePrivateTheme('{"roles": {}}'), /empty/);
  assertThrows(() => parsePrivateTheme('{"roles": {"ink": "red"}}'), /not a #RRGGBB colour/);
  assertThrows(() => parsePrivateTheme('{"roles": {"Ink": "#000000"}}'), /lowercase/);
});

Deno.test("a private theme recolours the drawing and the pack's own symbols, and leaves the loaded pack alone", () => {
  const priv = pack.withTheme({ ink: "#112233", background: "#EEEEEE", high: "#AA0000" });
  assert(priv.isPrivate && !pack.isPrivate);
  assertEquals(pack.theme.roles.ink, "#000000");                         // the pack itself is unchanged
  let doc = addElement(newDoc(), pack, "and_gate", [0, 0]).doc;
  doc = addWire(doc, pack, P([-12, 1]), { kind: "pin", ref: "and1.A" }).doc;
  doc = { ...doc, wires: doc.wires.map((w) => ({ ...w, level: "1" })) };
  const svg = exportSvg(doc, priv);
  const colours = new Set();
  walk(parseXml(svg), (n) => n.attrs.forEach(([k, v]) => { if ((k === "fill" || k === "stroke") && v !== "none") colours.add(v.toUpperCase()); }));
  assertEquals([...colours].sort(), ["#112233", "#AA0000"]);              // symbol ink and leads, wire level, no #000000 left
  assert(!svg.includes("#000000"));
  assert(exportSvg(doc, pack).includes("#000000"));                       // the default theme is still black
});

Deno.test("a dark mapping turns the pack's baked black into ink and white into background, with no external references", () => {
  const dark = pack.withTheme({ ink: "#E6E6E6", low: "#E6E6E6", background: "#131211", high: "#FF8A3D" });
  let doc = addElement(newDoc(), pack, "and_gate", [0, 0]).doc;
  doc = addWire(doc, pack, P([6, 0]), P([14, 0])).doc;
  doc = { ...doc, wires: doc.wires.map((w) => ({ ...w, level: "1" })) };
  const light = exportSvg(doc, pack, {}), svg = exportSvg(doc, dark, {});
  assert(/#000000/i.test(light), "the light export keeps the pack's black");
  assert(!/#000000|#FFFFFF/i.test(svg), "the dark export has no baked black or white left");
  assert(/#E6E6E6/i.test(svg) && /#FF8A3D/i.test(svg), "ink and the dark high colour are used");
  assert(!/<text|font-family|href=|url\(/.test(svg), "no text, fonts or references");
  assertEquals(pack.role("ink"), "#000000");                                   // the loaded pack is untouched
});

Deno.test("families: a 4-input gate has four input pins, is saved as params {n: 4}, and draws and exports as the variant", async () => {
  const { addElement, serialize, parse } = await import("../src/doc.js");
  const { drawing } = await import("../src/export.js");
  assertEquals(pack.parametersOf("and_gate"), [{ name: "n", default: 2, values: [2, 3, 4, 5, 6, 7, 8] }]);
  assertEquals(pack.parametersOf("resistor"), []);
  const d = addElement({ ...(await import("../src/doc.js")).newDoc(), }, pack, "and_gate", [0, 0], 0, { n: 4 });
  const el = d.doc.elements[0];
  assertEquals(pack.stemOf(el), "and_gate--n4");
  assertEquals(Object.keys(pack.defFor(el).pins).sort(), ["A", "B", "C", "D", "Y"]);
  assertEquals(pack.stemOf({ type: "and_gate", params: { n: 2 } }), "and_gate");
  const back = parse(serialize(d.doc, pack)).doc;
  assertEquals(back.elements[0].params, { n: 4 });
  assert(drawing(back, pack, {}).elements.length === 1);
});
