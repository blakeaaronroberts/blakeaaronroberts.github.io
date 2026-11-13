// F6: dragging a wire segment, selecting and deleting a wire.

import { addElement, addWire, deleteSelection, endpoint, moveWireSegment, newDoc, wireCorners } from "../src/doc.js";
import { dots } from "../src/junctions.js";
import { History } from "../src/history.js";
import { hitTest } from "../src/hit.js";
import { nearestOnPolyline } from "../src/router.js";
import { assert, assertEquals, assertThrows, pack } from "./helpers.js";

const pin = (ref) => ({ kind: "pin", ref });
const corners = (doc, id = "w1") => wireCorners(doc, pack, doc.wires.find((w) => w.id === id));
const orthogonal = (c) => c.every((p, i) => i === 0 || p[0] === c[i - 1][0] || p[1] === c[i - 1][1]);
const noZeroRuns = (c) => c.every((p, i) => i === 0 || p[0] !== c[i - 1][0] || p[1] !== c[i - 1][1]);

/** and1 at the origin, not1 up and to the right, one wire between their pins (a Z: right, up, right). */
function zWire() {
  let doc = newDoc();
  doc = addElement(doc, pack, "and_gate", [0, 0]).doc;
  doc = addElement(doc, pack, "not_gate", [20, 6]).doc;
  return addWire(doc, pack, pin("and1.Y"), pin("not1.A")).doc;
}

Deno.test("the middle run slides sideways and its neighbours stretch; the ends stay on their pins", () => {
  const doc = zWire();
  assertEquals(corners(doc), [[5, 0], [10, 0], [10, 6], [16, 6]]);
  const moved = moveWireSegment(doc, pack, "w1", 1, 2);
  assertEquals(corners(moved), [[5, 0], [12, 0], [12, 6], [16, 6]]);
  assertEquals(moved.wires[0].from, "and1.Y");
  assertEquals(moved.wires[0].to, "not1.A");
  const left = moveWireSegment(doc, pack, "w1", 1, -3);
  assertEquals(corners(left), [[5, 0], [7, 0], [7, 6], [16, 6]]);
});

Deno.test("a moved wire stays orthogonal, whichever run is dragged and by how much", () => {
  const doc = zWire();
  for (const index of [0, 1, 2]) {
    for (const d of [-3, -1, 1, 2, 5]) {
      let moved;
      try { moved = moveWireSegment(doc, pack, "w1", index, d); } catch { continue; }
      const c = corners(moved);
      assert(orthogonal(c) && noZeroRuns(c), `run ${index} by ${d}: ${JSON.stringify(c)}`);
      assertEquals(c[0], endpoint(moved, pack, "and1.Y").at);
      assertEquals(c.at(-1), endpoint(moved, pack, "not1.A").at);
    }
  }
});

Deno.test("a run that touches a pin keeps a one-step stub, so the wire still leaves the pin the same way", () => {
  const moved = moveWireSegment(zWire(), pack, "w1", 0, 1);
  assertEquals(corners(moved), [[5, 0], [6, 0], [6, 1], [10, 1], [10, 6], [16, 6]]);
  const last = moveWireSegment(zWire(), pack, "w1", 2, -1);
  assertEquals(corners(last), [[5, 0], [10, 0], [10, 5], [15, 5], [15, 6], [16, 6]]);
});

Deno.test("a run with no room for its stubs is refused, and the document is unchanged", () => {
  let doc = newDoc();
  doc = addElement(doc, pack, "and_gate", [0, 0]).doc;
  doc = addElement(doc, pack, "and_gate", [8, 0]).doc;
  doc = addWire(doc, pack, pin("and1.Y"), pin("and2.A")).doc;
  const before = JSON.stringify(doc);
  assertThrows(() => moveWireSegment(doc, pack, "w1", 0, 1), /too short/, "straight run, 2 steps");
  assertEquals(JSON.stringify(doc), before);
});

Deno.test("a free end moves with its run, with no stub", () => {
  let doc = newDoc();
  doc = addElement(doc, pack, "and_gate", [0, 0]).doc;
  doc = addWire(doc, pack, pin("and1.Y"), { kind: "point", at: [12, 4] }, [[9, 0], [9, 4]]).doc;
  assertEquals(corners(doc), [[5, 0], [9, 0], [9, 4], [12, 4]]);
  const moved = moveWireSegment(doc, pack, "w1", 2, 2);
  assertEquals(corners(moved), [[5, 0], [9, 0], [9, 6], [12, 6]]);
  assertEquals(moved.wires[0].to, [12, 6]);
});

Deno.test("a junction on the moving run goes with it, and the wire that ends on it follows", () => {
  let doc = zWire();
  doc = addElement(doc, pack, "and_gate", [0, 20]).doc;
  const tap = addWire(doc, pack, pin("and2.Y"), { kind: "wire", id: "w1", at: [10, 3] });
  doc = tap.doc;
  assertEquals(doc.junctions.map((j) => j.at), [[10, 3]]);
  const moved = moveWireSegment(doc, pack, "w1", 1, 4);
  assertEquals(corners(moved), [[5, 0], [14, 0], [14, 6], [16, 6]]);
  assertEquals(moved.junctions.map((j) => j.at), [[14, 3]]);
  const t = corners(moved, tap.id);
  assertEquals(t.at(-1), [14, 3]);
  assert(orthogonal(t), JSON.stringify(t));
});

Deno.test("junction dots follow the four-wire rule after dragging and deleting", () => {
  let doc = zWire();
  doc = addElement(doc, pack, "and_gate", [0, 20]).doc;
  doc = addElement(doc, pack, "and_gate", [30, 20]).doc;
  doc = addWire(doc, pack, pin("and2.Y"), { kind: "wire", id: "w1", at: [10, 3] }).doc;
  assertEquals(dots(doc, pack).length, 0);                       // a T: three wires, no dot
  const j = doc.junctions[0].id;
  doc = addWire(doc, pack, pin("and3.A"), { kind: "junction", id: j }).doc;
  assertEquals(dots(doc, pack).length, 1);                       // a fourth wire makes the dot
  const moved = moveWireSegment(doc, pack, "w1", 1, 2);
  assertEquals(dots(moved, pack).map((d) => d.at), [[12, 3]]);   // the dot went with the run
  const gone = deleteSelection(moved, pack, { wires: ["w3"] });
  assertEquals(dots(gone, pack).length, 0);                      // back to a T: the dot is gone
});

Deno.test("clicking a wire finds it; deleting removes it; undo brings it back", () => {
  const doc = zWire();
  const hit = hitTest(doc, pack, [10, 3]).find((h) => h.kind === "wire");
  assertEquals(hit.id, "w1");
  assertEquals(nearestOnPolyline([10.2, 3], corners(doc)).segment, 1);
  const history = new History();
  history.record(doc);
  const gone = deleteSelection(doc, pack, { wires: ["w1"] });
  assertEquals(gone.wires, []);
  assertEquals(history.undo(gone), doc);
});

Deno.test("one drag is one undo step: the live preview never touches history", () => {
  const base = zWire();
  const history = new History();
  let doc = base;
  for (const d of [1, 2, 3, 2]) doc = moveWireSegment(base, pack, "w1", 1, d);   // the preview, redone from the base each move
  assert(!history.canUndo);
  history.record(base);                                                          // the drag ends
  assertEquals(history.past.length, 1);
  assertEquals(history.undo(doc), base);
});
