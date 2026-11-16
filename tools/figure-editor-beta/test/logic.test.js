import { addElement, addWire, deleteSelection, newDoc, parse, serialize, setLevel } from "../src/doc.js";
import { drawing } from "../src/export.js";
import { resolveLogic } from "../src/logic.js";
import { setWireLabels } from "../src/levelframes.js";
import { assert, assertEquals, pack } from "./helpers.js";

const point = (at) => ({ kind: "point", at });
const pin = (ref) => ({ kind: "pin", ref });

function gate(type, inputs, params = null) {
  let doc = addElement(newDoc(), pack, type, [0, 0], 0, params).doc;
  const el = doc.elements[0];
  const inputPins = Object.keys(pack.defFor(el).pins).filter((name) => name !== "Y").sort();
  for (const [i, name] of inputPins.entries()) {
    const added = addWire(doc, pack, point([-12, i * 4]), pin(`${el.id}.${name}`));
    doc = setLevel(added.doc, [added.id], inputs[i]);
  }
  const output = addWire(doc, pack, pin(`${el.id}.Y`), point([12, 0]));
  return { doc: output.doc, output: output.id, gate: el.id };
}

function nandLatch(set, reset) {
  let doc = addElement(newDoc(), pack, "nand_gate", [0, 0]).doc;
  doc = addElement(doc, pack, "nand_gate", [0, 16]).doc;
  const [q, qbar] = doc.elements;
  const qInputs = Object.keys(pack.defFor(q).pins).filter((name) => name !== "Y").sort();
  const qbarInputs = Object.keys(pack.defFor(qbar).pins).filter((name) => name !== "Y").sort();
  const setWire = addWire(doc, pack, point([-12, 0]), pin(`${q.id}.${qInputs[0]}`));
  doc = setLevel(setWire.doc, [setWire.id], set, [], pack);
  const resetWire = addWire(doc, pack, point([-12, 16]), pin(`${qbar.id}.${qbarInputs[0]}`));
  doc = setLevel(resetWire.doc, [resetWire.id], reset, [], pack);
  const qWire = addWire(doc, pack, pin(`${q.id}.Y`), pin(`${qbar.id}.${qbarInputs[1]}`));
  const qbarWire = addWire(qWire.doc, pack, pin(`${qbar.id}.Y`), pin(`${q.id}.${qInputs[1]}`));
  return { doc: qbarWire.doc, setWire: setWire.id, resetWire: resetWire.id, qWire: qWire.id, qbarWire: qbarWire.id };
}

function latchLevels(doc, latch) {
  const resolved = resolveLogic(doc, pack);
  return [resolved.wires.find((wire) => wire.id === latch.qWire)?.level, resolved.wires.find((wire) => wire.id === latch.qbarWire)?.level];
}

Deno.test("basic gates calculate their output from the input nets", () => {
  const cases = [
    ["and_gate", ["1", "1"], "1"],
    ["and_gate", ["0", "1"], "0"],
    ["nand_gate", ["1", "1"], "0"],
    ["or_gate", ["0", "1"], "1"],
    ["nor_gate", ["0", "0"], "1"],
    ["xor_gate", ["1", "0"], "1"],
    ["not_gate", ["0"], "1"],
    ["and_gate", ["1", "1", "0"], "0", { n: 3 }],
  ];
  for (const [type, inputs, expected, params] of cases) {
    const scene = gate(type, inputs, params);
    const resolved = resolveLogic(scene.doc, pack);
    assertEquals(resolved.wires.find((wire) => wire.id === scene.output).level, expected, type);
    assertEquals(drawing(scene.doc, pack).wires.find((wire) => wire.id === scene.output).level, expected, `${type} is visible in the drawing`);
  }
});

Deno.test("unknown and floating inputs use four-valued logic", () => {
  const cases = [
    ["and_gate", ["0", "X"], "0"],
    ["and_gate", ["0", null], "0"],
    ["and_gate", ["1", "Z"], "X"],
    ["or_gate", ["1", "X"], "1"],
    ["xor_gate", ["1", "X"], "X"],
    ["not_gate", ["Z"], "X"],
  ];
  for (const [type, inputs, expected] of cases) {
    const scene = gate(type, inputs);
    assertEquals(resolveLogic(scene.doc, pack).wires.find((wire) => wire.id === scene.output).level, expected, type);
  }
});

Deno.test("an entirely unset gate stays uncolored until an input value is known", () => {
  const scene = gate("and_gate", [null, null]);
  const resolved = resolveLogic(scene.doc, pack);
  assertEquals(resolved.wires.find((wire) => wire.id === scene.output).level, undefined);
});

Deno.test("gate outputs update with changed inputs and clear when the driver is removed", () => {
  const scene = gate("and_gate", ["1", "1"]);
  let resolved = resolveLogic(scene.doc, pack);
  assertEquals(resolved.wires.find((wire) => wire.id === scene.output).level, "1");
  resolved = resolveLogic(setLevel(resolved, ["w1"], "0", [], pack), pack);
  assertEquals(resolved.wires.find((wire) => wire.id === scene.output).level, "0");

  const removed = deleteSelection(resolved, pack, { elements: [scene.gate], wires: [], ports: [], labels: [] });
  resolved = resolveLogic(removed, pack);
  assertEquals(resolved.wires.find((wire) => wire.id === scene.output).level, undefined);
});

Deno.test("cross-coupled NAND latches set, reset, hold, and expose the invalid input state", () => {
  const latch = nandLatch("0", "1");
  let resolved = resolveLogic(latch.doc, pack);
  assertEquals(latchLevels(resolved, latch), ["1", "0"]);

  resolved = resolveLogic(setLevel(resolved, [latch.setWire], "1", [], pack), pack);
  assertEquals(latchLevels(resolved, latch), ["1", "0"]);

  resolved = resolveLogic(setLevel(resolved, [latch.resetWire], "0", [], pack), pack);
  assertEquals(latchLevels(resolved, latch), ["0", "1"]);

  resolved = resolveLogic(setLevel(resolved, [latch.setWire], "0", [], pack), pack);
  assertEquals(latchLevels(resolved, latch), ["1", "1"]);
});

Deno.test("an uninitialized NAND latch with both controls inactive is unknown", () => {
  const latch = nandLatch("1", "1");
  assertEquals(latchLevels(latch.doc, latch), ["X", "X"]);
});

Deno.test("computed output levels survive save and are recalculated when reopened", () => {
  const scene = gate("or_gate", ["0", "1"]);
  const resolved = resolveLogic(scene.doc, pack);
  const text = serialize(resolved, pack);
  const reopened = resolveLogic(parse(text).doc, pack);
  assertEquals(reopened.wires.find((wire) => wire.id === scene.output).level, "1");
  assertEquals(serialize(reopened, pack), text);
});

Deno.test("a gate output carries through disconnected wires with the same net label", () => {
  const scene = gate("or_gate", ["0", "1"]);
  let doc = addWire(scene.doc, pack, point([20, 0]), point([30, 0])).doc;
  doc = setWireLabels(doc, [scene.output, "w4"], "OUT");
  const resolved = resolveLogic(doc, pack);
  assertEquals(resolved.wires.map((wire) => wire.level), ["0", "1", "1", "1"]);
  assert(Object.keys(resolved.groups.logic_generated_levels).includes("w4"));
});
