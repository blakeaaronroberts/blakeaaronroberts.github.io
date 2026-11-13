// Ports and free labels as parts of the figure: placed, edited, moved, copied and deleted like elements,
// with the wires on a port staying on it.

import {
  addElement, addLabel, addPort, addWire, deleteSelection, endpoint, extractFragment, moveSelection,
  newDoc, pasteFragment, setLabel, setPort, wireCorners,
} from "../src/doc.js";
import { drawing, labelBoxes } from "../src/export.js";
import { hitTest, inBox } from "../src/hit.js";
import { History } from "../src/history.js";
import { assert, assertEquals, assertThrows, pack, typeset } from "./helpers.js";

const P = (at) => ({ kind: "point", at });
const wireOf = (doc, id) => doc.wires.find((w) => w.id === id);

function portAndWire() {
  let doc = addPort(newDoc(), pack, [-10, 4], "in").doc;
  doc = addWire(doc, pack, { kind: "port", id: "in1", at: [-10, 4] }, P([10, 4])).doc;
  return doc;
}

Deno.test("a port is an id at a point; its label, side and direction can be set", () => {
  let { doc, id } = addPort(newDoc(), pack, [0, 0], "out");
  assertEquals([id, doc.ports], ["out1", [{ id: "out1", dir: "out", at: [0, 0] }]]);
  doc = setPort(doc, pack, id, { label: "$Y$", side: "right", dir: "in" });
  assertEquals(doc.ports[0], { id: "out1", dir: "in", at: [0, 0], label: "$Y$", side: "right" });
  doc = setPort(doc, pack, id, { label: "", side: "" });
  assertEquals(doc.ports[0], { id: "out1", dir: "in", at: [0, 0] });
  assertThrows(() => setPort(doc, pack, id, { side: "middle" }), /left, right, up or down/);
  assertThrows(() => setPort(doc, pack, id, { dir: "both" }), /in or out/);
});

Deno.test("renaming a port keeps its wires on it, and refuses a bad or used id", () => {
  let doc = portAndWire();
  doc = setPort(doc, pack, "in1", { id: "Clk" });
  assertEquals(doc.ports[0].id, "Clk");
  assertEquals(wireOf(doc, "w1").from, "Clk");
  assertThrows(() => setPort(doc, pack, "Clk", { id: "9x" }), /not an id/);
  assertThrows(() => setPort(doc, pack, "Clk", { id: "w1" }), /already used/);
});

Deno.test("a wire on a port follows it when the port moves, and its end stays on the port", () => {
  const doc = portAndWire();
  const moved = moveSelection(doc, pack, { ports: ["in1"] }, [0, 6]);
  assertEquals(moved.ports[0].at, [-10, 10]);
  const c = wireCorners(moved, pack, wireOf(moved, "w1"));
  assertEquals(c[0], [-10, 10]);
  assertEquals(c.at(-1), [10, 4]);
  assertEquals(endpoint(moved, pack, "in1").at, [-10, 10]);
});

Deno.test("deleting a port leaves its wire's end free where the port was", () => {
  const doc = deleteSelection(portAndWire(), pack, { ports: ["in1"] });
  assertEquals(doc.ports, []);
  assertEquals(wireOf(doc, "w1").from, [-10, 4]);
});

Deno.test("free labels: add, edit, move and delete by index", () => {
  let doc = addLabel(newDoc(), [0, 0], "$A$", "up").doc;
  doc = addLabel(doc, [10, 0], "$B$").doc;
  assertEquals(doc.labels, [{ text: "$A$", at: [0, 0], side: "up" }, { text: "$B$", at: [10, 0] }]);
  doc = setLabel(doc, 1, { text: "$C$", side: "left" });
  assertEquals(doc.labels[1], { text: "$C$", at: [10, 0], side: "left" });
  doc = setLabel(doc, 1, { side: "" });
  assertEquals(doc.labels[1], { text: "$C$", at: [10, 0] });
  doc = moveSelection(doc, pack, { labels: [0] }, [2, 3]);
  assertEquals(doc.labels[0].at, [2, 3]);
  doc = deleteSelection(doc, pack, { labels: [0] });
  assertEquals(doc.labels, [{ text: "$C$", at: [10, 0] }]);
});

Deno.test("copy and paste take ports and labels along, with fresh ids and the wire on the pasted port", () => {
  let doc = portAndWire();
  doc = addLabel(doc, [0, 8], "$A$", "up").doc;
  const frag = extractFragment(doc, pack, { ports: ["in1"], labels: [0], wires: ["w1"] });
  assertEquals([frag.ports.length, frag.labels.length, frag.wires.length], [1, 1, 1]);
  const r = pasteFragment(doc, pack, frag, [0, -8]);
  assertEquals(r.doc.ports.map((p) => p.id), ["in1", "in2"]);
  assertEquals(r.doc.ports[1].at, [-10, -4]);
  assertEquals(r.doc.labels[1], { text: "$A$", at: [0, 0], side: "up" });
  assertEquals(wireOf(r.doc, r.selection.wires[0]).from, "in2");
  assertEquals(r.selection, { elements: [], wires: ["w2"], ports: ["in2"], labels: [1] });
});

Deno.test("box select takes ports and labels by their anchor", () => {
  let doc = addPort(newDoc(), pack, [0, 0]).doc;
  doc = addLabel(doc, [4, 4], "$A$").doc;
  doc = addLabel(doc, [40, 40], "$B$").doc;
  const got = inBox(doc, pack, { min: [-2, -2], max: [6, 6] });
  assertEquals([got.ports, got.labels], [["in1"], [0]]);
});

Deno.test("a click on a label's text, or a port's, finds it; a port's own point wins over text", () => {
  let doc = addPort(newDoc(), pack, [0, 0], "in").doc;
  doc = setPort(doc, pack, "in1", { label: "$A$", side: "left" });
  doc = addLabel(doc, [20, 0], "$B$", "up").doc;
  const d = drawing(doc, pack, { typeset });
  const boxes = labelBoxes(d);
  assertEquals(boxes.map((b) => [b.kind, b.id ?? b.index]), [["port", "in1"], ["label", 0]]);
  const [lb] = boxes.filter((b) => b.kind === "label");
  const centre = [(lb.box.min[0] + lb.box.max[0]) / 2, (lb.box.min[1] + lb.box.max[1]) / 2];
  assertEquals(hitTest(doc, pack, centre, undefined, boxes)[0], { kind: "label", index: 0 });
  assertEquals(hitTest(doc, pack, [0, 0], undefined, boxes)[0].kind, "port");
});

Deno.test("edits to ports and labels undo and redo like any other", () => {
  const h = new History();
  const d0 = newDoc();
  const d1 = addPort(d0, pack, [0, 0]).doc; h.record(d0);
  const d2 = setPort(d1, pack, "in1", { label: "$A$" }); h.record(d1);
  assertEquals(h.undo(d2), d1);
  assertEquals(h.undo(d1), d0);
  assertEquals(h.redo(d0), d1);
  assert(h.canRedo);
});

Deno.test("a port at an element's pin tip joins that pin's net", async () => {
  const { deriveNets } = await import("../src/doc.js");
  let doc = addElement(newDoc(), pack, "and_gate", [0, 0]).doc;
  doc = addPort(doc, pack, [-4, 1], "in").doc;
  assertEquals(deriveNets(doc, pack), { in1: ["and1.A", "in1"] });
});
