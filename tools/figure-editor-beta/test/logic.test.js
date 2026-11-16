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
