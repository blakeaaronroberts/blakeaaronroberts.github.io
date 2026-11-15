// Wire ends stay on their pins when parts move, rotate or are deleted.

import { addElement, addWire, deleteSelection, endpoint, moveSelection, rotateElements, wireCorners, newDoc } from "../src/doc.js";
import { assertEquals, pack } from "./helpers.js";

function twoGates() {
  let doc = newDoc();
  let r = addElement(doc, pack, "and_gate", [0, 0]); doc = r.doc; const g1 = r.id;
  r = addElement(doc, pack, "not_gate", [20, 6]); doc = r.doc; const g2 = r.id;
  const w = addWire(doc, pack, { kind: "pin", ref: `${g1}.Y` }, { kind: "pin", ref: `${g2}.A` });
  return { doc: w.doc, g1, g2, w: w.id };
}
const wireOf = (doc, id) => doc.wires.find((w) => w.id === id);
const tip = (doc, ref) => endpoint(doc, pack, ref).at;

Deno.test("a wire's ends are pin references, so they follow the pins", () => {
  const { doc, g1, g2, w } = twoGates();
  assertEquals(wireOf(doc, w), { id: w, from: `${g1}.Y`, to: `${g2}.A` });
  const moved = moveSelection(doc, pack, { elements: [g2] }, [6, -4]);
  const c = wireCorners(moved, pack, wireOf(moved, w));
  assertEquals(c[0], tip(moved, `${g1}.Y`));
  assertEquals(c[c.length - 1], tip(moved, `${g2}.A`));
  assertEquals(tip(moved, `${g2}.A`), [tip(doc, `${g2}.A`)[0] + 6, tip(doc, `${g2}.A`)[1] - 4]);
});

Deno.test("moving one end re-routes the first and last legs but keeps the clicked corners", () => {
  let { doc, g1, g2 } = twoGates();
  const r = addWire(doc, pack, { kind: "pin", ref: `${g1}.A` }, { kind: "pin", ref: `${g2}.A` }, [[-8, 1], [-8, 14]]);
  doc = moveSelection(r.doc, pack, { elements: [g2] }, [4, 0]);
  assertEquals(wireOf(doc, r.id).via, [[-8, 1], [-8, 14]]);
});

Deno.test("moving both ends moves the wire's corners too", () => {
  let { doc, g1, g2 } = twoGates();
  const r = addWire(doc, pack, { kind: "pin", ref: `${g1}.A` }, { kind: "pin", ref: `${g2}.A` }, [[-8, 1], [-8, 14]]);
  doc = moveSelection(r.doc, pack, { elements: [g1, g2] }, [2, 2]);
  assertEquals(wireOf(doc, r.id).via, [[-6, 3], [-6, 16]]);
});

Deno.test("rotating an element carries its wire end with the pin", () => {
  const { doc, g2, w } = twoGates();
  const turned = rotateElements(doc, pack, [g2]);
  const c = wireCorners(turned, pack, wireOf(turned, w));
  assertEquals(c[c.length - 1], tip(turned, `${g2}.A`));
});

Deno.test("deleting an element leaves its wires with free ends where the pin was", () => {
  const { doc, g2, w } = twoGates();
  const where = tip(doc, `${g2}.A`);
  const after = deleteSelection(doc, pack, { elements: [g2] });
  assertEquals(wireOf(after, w).to, where);
});
