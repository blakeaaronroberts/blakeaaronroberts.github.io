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
  const flags = Object.fromEntries(pack.types().map((t) => [t, pack.mirrorable(t)]));
  assertEquals(flags.and_gate, true);
  assertEquals(flags.full_adder, false);
  assertEquals(Object.values(flags).filter(Boolean).length, 15);
  assertEquals(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k).sort(), ["d_flipflop", "d_latch", "decoder2to4", "full_adder", "mux2", "voltage_source"]);
});

Deno.test("drafts: the palette lists approved elements, and drafts only when asked", async () => {
  const withDraft = await packWith((p, j) => { if (p === "index.json") j.elements.find((e) => e.type === "resistor").status = "draft"; });
  assert(!withDraft.types().includes("resistor"));
  assert(withDraft.types(true).includes("resistor"));
  assertEquals(withDraft.types(true).length, 21);
  assertEquals(withDraft.types().length, 20);
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
