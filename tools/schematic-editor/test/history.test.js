// Snapshot undo and redo.

import { addElement, moveSelection, newDoc } from "../src/doc.js";
import { History } from "../src/history.js";
import { assert, assertEquals, pack } from "./helpers.js";

Deno.test("undo returns each earlier document; redo replays them", () => {
  const h = new History();
  const d0 = newDoc();
  const { doc: d1, id } = addElement(d0, pack, "and_gate", [0, 0]);
  h.record(d0);
  const d2 = moveSelection(d1, pack, { elements: [id] }, [2, 0]);
  h.record(d1);
  assertEquals(h.undo(d2), d1);
  assertEquals(h.undo(d1), d0);
  assertEquals(h.undo(d0), null);
  assertEquals(h.redo(d0), d1);
  assertEquals(h.redo(d1), d2);
  assertEquals(h.redo(d2), null);
});

Deno.test("a new edit clears redo", () => {
  const h = new History();
  const d0 = newDoc(), d1 = addElement(d0, pack, "and_gate", [0, 0]).doc;
  h.record(d0);
  h.undo(d1);
  assert(h.canRedo);
  h.record(d0);
  assert(!h.canRedo);
});

Deno.test("snapshots cannot be changed after they are recorded", () => {
  const h = new History();
  const d0 = newDoc();
  h.record(d0);
  d0.elements.push({ id: "x", type: "and_gate", at: [0, 0] });
  assertEquals(h.undo(newDoc()).elements, []);
});

Deno.test("a drag is one step: only its start is recorded", () => {
  const h = new History();
  const start = addElement(newDoc(), pack, "and_gate", [0, 0]).doc;
  let live = start;
  for (let i = 0; i < 10; i++) live = moveSelection(live, pack, { elements: ["and1"] }, [2, 0]);
  h.record(start);                    // the canvas records once, on pointer up
  assertEquals(h.undo(live), start);
  assert(!h.canUndo);
});

Deno.test("history keeps at most its limit", () => {
  const h = new History(3);
  for (let i = 0; i < 5; i++) h.record({ i });
  assertEquals([h.undo({}), h.undo({}), h.undo({}), h.undo({})], [{ i: 4 }, { i: 3 }, { i: 2 }, null]);
});
