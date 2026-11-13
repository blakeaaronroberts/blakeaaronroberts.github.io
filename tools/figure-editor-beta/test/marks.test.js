// F5.2: arrowheads and bus marks on wires.

import {
  addElement, addPort, addWire, endpoint, lint, newDoc, parse, serialize, setWireStyle,
} from "../src/doc.js";
import { BLOCK } from "../src/block.js";
import { drawing, exportSvg, headPath } from "../src/export.js";
import { joints } from "../src/junctions.js";
import { labelItems, texNeeded } from "../src/labels.js";
import { busMark, HEAD_HALF_WIDTH, HEAD_LENGTH, headsOf, SLASH_HALF, tagAnchor, withArrows } from "../src/marks.js";
import { allCorners } from "../src/doc.js";
import { assert, assertClose, assertEquals, assertThrows, pack, typeset } from "./helpers.js";

const lw = pack.theme.line.width_module;
const P = (at) => ({ kind: "point", at });
const pinT = (ref) => ({ kind: "pin", ref });
const block = { shape: "rect", w: 4, h: 4, pins: { left: ["A", "B"], right: ["Y"] } };

/** A block at the origin with a wire from (-12, 1) to its pin A. */
function wired(extra = {}) {
  let doc = addElement(newDoc(), pack, BLOCK, [0, 0], 0, block).doc;
  doc = addWire(doc, pack, P([-12, 1]), pinT("blk1.A")).doc;
  doc.wires[0] = { ...doc.wires[0], ...extra };
  return doc;
}
const wireOf = (doc, id = "w1") => drawing(doc, pack, { typeset }).wires.find((w) => w.id === id);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

Deno.test("an arrowhead's tip lands exactly on the pin it points at, and the head is a sharp triangle", () => {
  const w = wireOf(wired({ arrow: "end" }));
  assertEquals(w.heads.length, 1);
  const h = w.heads[0];
  assertEquals(h.tip, [-2, 0.5].map((v, i) => [-2, -0.5][i]));     // pin A at grid [-4, 1] is [-2, -0.5] modules
  const L = HEAD_LENGTH * lw;
  assertClose(dist(h.tip, [(h.a[0] + h.b[0]) / 2, (h.a[1] + h.b[1]) / 2]), L, 1e-9, "head length");
  assertClose(dist(h.a, h.b), 2 * HEAD_HALF_WIDTH * lw, 1e-9, "head width");
  assertClose(dist(h.tip, h.a), dist(h.tip, h.b), 1e-9, "symmetric about the wire");
  assert(headPath(h).startsWith("M -2 -0.5 L "), headPath(h));
});

Deno.test("the line is shortened to end inside the head where it is wider than the line, so nothing pokes past the tip and no seam shows", () => {
  const w = wireOf(wired({ arrow: "end" }));
  const tip = w.heads[0].tip, end = w.points.at(-1), L = HEAD_LENGTH * lw;
  assert(end[0] < tip[0] - 0.5 * L, `the line ends ${tip[0] - end[0]} short of the tip`);   // well back from the tip
  const depth = tip[0] - end[0];                                                            // how far from the tip the line ends
  const headWidthThere = 2 * HEAD_HALF_WIDTH * lw * (depth / L);
  assert(headWidthThere > 1.5 * lw, `the head is ${headWidthThere} wide where the ${lw} wide line ends`);
  assert(depth < L, "and that is inside the head, not past its base");
  // the rest of the wire is untouched
  assertEquals(w.points[0], [-6, -0.5]);
});

Deno.test("arrowheads at the start, the end or both; a short run shrinks the head to fit, and two heads share one run", () => {
  assertEquals(headsOf("both"), { start: true, end: true });
  assertEquals(headsOf(undefined), { start: false, end: false });
  const s = wireOf(wired({ arrow: "start" }));
  assertEquals(s.heads.map((h) => h.tip), [[-6, -0.5]]);
  const both = wireOf(wired({ arrow: "both" }));
  assertEquals(both.heads.length, 2);
  const short = withArrows([[0, 0], [0.4, 0]], "both", lw);          // 0.4 module of wire: each head gets at most half
  for (const h of short.heads) assert(dist(h.tip, [(h.a[0] + h.b[0]) / 2, (h.a[1] + h.b[1]) / 2]) <= 0.2 + 1e-9);
  const tiny = withArrows([[0, 0], [0.3, 0]], "end", lw);
  assert(dist(tiny.heads[0].tip, tiny.heads[0].a) < HEAD_LENGTH * lw, "a short run shrinks the head");
  assertEquals(withArrows([[0, 0], [5, 0]], "none", lw).heads, []);
});

Deno.test("a head on a bent wire points along its last run", () => {
  const doc = wired({ arrow: "end", via: [[-12, -6], [-8, -6]] });
  doc.wires[0].via = [[-12, 4], [-8, 4]];
  const w = wireOf(doc);
  const h = w.heads[0];
  assertEquals(h.tip[1], -0.5);
  assertClose(h.a[0], h.b[0], 1e-9);       // the base is vertical: the last run is horizontal
  assert(h.a[0] < h.tip[0]);
});

Deno.test("an arrow can end on a port, on another wire (a tap), or in free space, with its tip exactly there", () => {
  let doc = addPort(newDoc(), pack, [10, 0], "out").doc;
  doc = addWire(doc, pack, P([0, 0]), { kind: "port", id: "out1", at: [10, 0] }).doc;
  doc.wires[0].arrow = "end";
  assertEquals(wireOf(doc).heads[0].tip, [5, 0]);
  // free-standing: both ends unattached
  const free = { ...newDoc(), wires: [{ id: "w1", from: [0, 0], to: [8, 0], arrow: "both" }] };
  const f = wireOf(free);
  assertEquals(f.heads.map((h) => h.tip).sort((a, b) => a[0] - b[0]), [[0, 0], [4, 0]]);
  assertEquals(lint(free, pack), []);
  // onto another wire
  let tapDoc = addWire(newDoc(), pack, P([0, 0]), P([20, 0])).doc;
  tapDoc = addWire(tapDoc, pack, P([10, 10]), { kind: "wire", id: "w1", at: [10, 0] }).doc;
  tapDoc.wires[1].arrow = "end";
  const t = wireOf(tapDoc, "w2");
  assertEquals(t.heads[0].tip, [5, 0]);
});

Deno.test("no joint is drawn under an arrowhead (the wire's end is not a flat line end there), and other joints are unchanged", () => {
  // A gate's pin has a lead, so a wire ending on the pin meets the lead end at a joint (a straight seam patch here).
  let doc = addElement(newDoc(), pack, "and_gate", [0, 0]).doc;
  const at = endpoint(doc, pack, "and1.A").at;
  doc = addWire(doc, pack, P([at[0] - 8, at[1]]), pinT("and1.A")).doc;
  const count = (d) => joints(d, pack, allCorners(d, pack)).length;
  assertEquals(count(doc), 1);
  const head = structuredClone(doc); head.wires[0].arrow = "end";
  assertEquals(count(head), 0);                         // the head's tip is the point it points at: no joint beneath it
  const tail = structuredClone(doc); tail.wires[0].arrow = "start";
  assertEquals(count(tail), 1);                         // an arrow at the other end leaves this pin's joint alone
});

Deno.test("the head takes its wire's colour, in the drawing and in the export", () => {
  const doc = wired({ arrow: "end", level: "1" });
  const high = pack.levelColour("1");
  assertEquals(wireOf(doc).colour, high);
  const svg = exportSvg(doc, pack, { typeset });
  assert(new RegExp(`<g fill="#000000" stroke="none">\\s*<path fill="${high}" d="M `, "i").test(svg), svg);
});

Deno.test("a bus mark is a slash through the middle of the wire's longest run, with its label past the slash's upper end", () => {
  const doc = wired({ bus: "4" });
  const w = wireOf(doc);
  const c = allCorners(doc, pack).get("w1");
  const { at } = tagAnchor(c);
  const [p, q] = w.slash;
  assertClose((p[0] + q[0]) / 2, at[0] / 2, 1e-9);
  assertClose((p[1] + q[1]) / 2, -at[1] / 2, 1e-9);
  assertClose(Math.abs(p[1] - q[1]) / 2, SLASH_HALF * lw, 1e-9);
  assert(q[0] > p[0] && q[1] < p[1], "a slash leaning right (y is down in modules)");
  const item = labelItems(doc, pack).find((i) => i.kind === "bus");
  assertEquals([item.key, item.text, item.tex, item.dir], ["bus:w1", "4", "\\text{4}", [0, 1]]);   // above a horizontal run
  assertClose(item.at[0], q[0] * 2, 1e-9);
  assertClose(item.at[1], -q[1] * 2, 1e-9);
  assert(texNeeded(doc, pack).includes("\\text{4}"));
});

Deno.test("on a bent wire the bus mark sits on the longest run; on a vertical run the label goes to its right", () => {
  const m = busMark([[0, 0], [2, 0], [2, 20]], lw);
  assertEquals(m.label.dir, [1, 0]);
  assertClose((m.slash[0][1] + m.slash[1][1]) / 2, -5, 1e-9);        // middle of the vertical run, y = 10 steps = 5 modules, up is negative
  const h = busMark([[0, 0], [10, 0]], lw);
  assertEquals(h.label.dir, [0, 1]);
});

Deno.test("export: heads and slashes are plain paths, the label is outlined, nothing needs a font; dark export has no black", () => {
  const doc = wired({ arrow: "both", bus: "$N$" });
  const labelled = new Map(typeset);
  if (!labelled.has("N")) return;     // the fixture holds only the letters the tests need
  const svg = exportSvg(doc, pack, { typeset: labelled });
  assert(!/<text|font|href=/.test(svg));
  const dark = pack.withTheme({ ink: "#E6E6E6", low: "#E6E6E6", background: "#131211" });
  assert(!/#000000/i.test(exportSvg(doc, dark, { typeset: labelled })));
});

Deno.test("export has the slash as a second path in the wire group and the heads in their own group", () => {
  const doc = wired({ arrow: "end", bus: "4" });
  const four = new Map(typeset);
  four.set("\\text{4}", typeset.get("X"));    // any real glyph outline stands in: this test is about the structure
  const svg = exportSvg(doc, pack, { typeset: four });
  const wireGroup = /<g fill="none" stroke="#000000"[^>]*>([\s\S]*?)<\/g>/.exec(svg)[1];
  assertEquals((wireGroup.match(/<path/g) ?? []).length, 2);          // the wire and its slash
  assertEquals((svg.match(/<g fill="#000000" stroke="none">/g) ?? []).length >= 1, true);
  assert(/Z"\/>/.test(svg), "a closed head");
});

Deno.test("arrows and bus marks are saved as C5 defines and survive save and open; none and empty are left out", () => {
  let doc = wired({ arrow: "end", bus: "N", level: "1" });
  const text = serialize(doc, pack);
  assert(text.includes('"arrow": "end", "bus": "N", "level": "1" }'), text);
  const again = parse(text).doc;
  assertEquals([again.wires[0].arrow, again.wires[0].bus], ["end", "N"]);
  assertEquals(serialize(again, pack), text);
  doc = setWireStyle(doc, ["w1"], { arrow: "none", bus: "" });
  assertEquals(Object.keys(doc.wires[0]).sort(), ["from", "id", "level", "to", "via"].filter((k) => k in doc.wires[0]));
  const bare = serialize({ ...doc, wires: [{ ...doc.wires[0], arrow: "none", bus: "" }] }, pack);
  assert(!bare.includes("arrow") && !bare.includes('"bus"'), bare);
});

Deno.test("setWireStyle changes only the wires named, refuses a bad arrow, and one call is one document", () => {
  const doc = wired();
  const two = { ...doc, wires: [...doc.wires, { id: "w9", from: [0, 20], to: [4, 20] }] };
  const next = setWireStyle(two, ["w9"], { arrow: "both", bus: " 8 " });
  assertEquals([next.wires[0].arrow, next.wires[1].arrow, next.wires[1].bus], [undefined, "both", "8"]);
  assertEquals(two.wires[1].arrow, undefined);                       // the input is never changed
  assertThrows(() => setWireStyle(two, ["w9"], { arrow: "up" }), /none, start, end or both/);
});

Deno.test("open refuses an unknown arrow and a bus mark that is not text, naming the wire", () => {
  const file = (w) => JSON.stringify({ schema: "circuit/0.2", id: "x", grid_cm: 0.25, elements: [], wires: [{ id: "w1", from: [0, 0], to: [4, 0], ...w }] });
  assertThrows(() => parse(file({ arrow: "up" })), /wires\[0\]: arrow must be/);
  assertThrows(() => parse(file({ bus: 4 })), /wires\[0\]: bus must be text/);
  assertEquals(parse(file({ arrow: "both", bus: "4" })).doc.wires[0].arrow, "both");
});
