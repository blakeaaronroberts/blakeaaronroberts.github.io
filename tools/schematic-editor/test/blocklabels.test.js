// F22.1b, the known limits of F22.1a: a module block draws its pin names, and a block's label never sits over wires
// or over the pin names (it moves under the block when it does not fit inside). Real MathJax output is not captured for
// these strings, so the typesetter here is synthetic: every string is 0.6 em wide per character.

import { drawing } from "../src/export.js";
import { labelBoxes } from "../src/export.js";
import { labelItems } from "../src/labels.js";
import { parse } from "../src/doc.js";
import { assert, assertEquals, pack } from "./helpers.js";

const demoText = await Deno.readTextFile(new URL("../../shared/test/model/sv_demo.json", import.meta.url));
const fake = new Proxy(new Map(), {
  get(target, key) {
    if (key === "get") return (tex) => ({ ok: true, width: 0.6 * String(tex).replace(/\\[a-z]+|[{}]/g, "").length, left: 0, height: 0.7, depth: 0.2, nodes: [] });
    const v = Reflect.get(target, key); return typeof v === "function" ? v.bind(target) : v;
  },
});
const { doc } = parse(demoText);
const d = drawing(doc, pack, { typeset: fake });

const overlap = (a, b) => a.min[0] < b.max[0] && b.min[0] < a.max[0] && a.min[1] < b.max[1] && b.min[1] < a.max[1];
const hitsSegment = (box, p, q) => {   // sample the segment: wires here are short, so 0.02 module steps are plenty
  const n = Math.max(2, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.02));
  for (let i = 0; i <= n; i++) {
    const x = p[0] + (q[0] - p[0]) * i / n, y = p[1] + (q[1] - p[1]) * i / n;
    if (x > box.min[0] && x < box.max[0] && y > box.min[1] && y < box.max[1]) return true;
  }
  return false;
};

Deno.test("every pin of a module block is named, as drawn text; an ordinary block's pins are not", () => {
  const names = labelItems(doc, pack).filter((i) => i.kind === "pinname");
  const expected = doc.elements.flatMap((e) => ["left", "right", "top", "bottom"].flatMap((s) => (e.params.pins[s] ?? []).map((p) => `${e.id}.${typeof p === "string" ? p : p.name}`)));
  assertEquals(names.map((i) => i.id).sort(), expected.sort());
  assertEquals(names.every((i) => i.text === i.id.split(".")[1]), true);
  const plain = parse(demoText.replace(/"module": "[a-z_]+",?\s*/g, "")).doc;   // the same blocks, no longer instances
  assertEquals(labelItems(plain, pack).filter((i) => i.kind === "pinname").length, 0);
});

Deno.test("a pin that already has a label keeps that label, with no second name beside it", () => {
  const labelled = structuredClone(doc);
  labelled.elements[0].params.pins.left[0] = { name: "a1", label: "$A_1$" };
  const items = labelItems(labelled, pack);
  assertEquals(items.some((i) => i.kind === "pinname" && i.id === "add.a1"), false);
  assertEquals(items.some((i) => i.kind === "pin" && i.id === "add.a1"), true);
});

Deno.test("pin names are not selectable text", () => {
  assertEquals(labelBoxes(d).some((b) => b.kind === "pinname"), false);
});

Deno.test("no block label sits over a wire or over a pin name", () => {
  const names = d.labels.filter((l) => l.kind === "pinname");
  assert(names.length >= 10, "pin names are drawn: " + names.length);
  for (const l of d.labels.filter((x) => x.kind === "block")) {
    for (const n of names) assert(!overlap(l.box, n.box), `${l.key} overlaps the pin name ${n.key}`);
    for (const w of d.wires) for (let i = 0; i + 1 < w.points.length; i++) assert(!hitsSegment(l.box, w.points[i], w.points[i + 1]), `${l.key} sits over wire ${w.id}`);
  }
});

Deno.test("a label that fits stays in the middle of its block; one that does not fit goes under the block", () => {
  const wide = structuredClone(doc);
  wide.elements[0].params.w = 20;   // the adder block, made wide enough for its name between the pin names
  const dw = drawing(wide, pack, { typeset: fake });
  const box = (dd, id) => dd.elements.find((e) => e.el.id === id).box;
  const inside = (a, b) => a.min[0] >= b.min[0] && a.max[0] <= b.max[0] && a.min[1] >= b.min[1] && a.max[1] <= b.max[1];
  const adder = dw.labels.find((l) => l.key === "block:add");
  assert(adder && inside(adder.box, box(dw, "add")), "a label that fits stays inside");
  for (const l of dw.labels.filter((x) => x.kind === "pinname" && x.id.startsWith("add."))) assert(!overlap(adder.box, l.box), "stays clear of " + l.key);
  const reg = d.labels.find((l) => l.key === "block:r");
  assert(reg && reg.box.min[1] >= box(d, "r").max[1] - 1e-6, "the long label is under its block");
});
