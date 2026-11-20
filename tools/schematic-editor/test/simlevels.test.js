// The editor's calculated levels, from circuit-model's simulator (simlevels.js, tag model-v0.7.0). The static cases are
// logic.test.js's (Copilot's evaluator gave the same answers; see the parity commit 902f74e); timing cases follow the
// simulator: Frame 0 is the first step, a pulse is two steps, and what Copilot prompted for is X.

import { addElement, addWire, deleteSelection, newDoc, parse, serialize, setLevel } from "../src/doc.js";
import { drawing } from "../src/export.js";
import { calculateSteps, logicModeOf, resolveLogic, setLogicMode } from "../src/simlevels.js";
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

function nandLatch(set, reset, type = "nand_gate") {
  let doc = addElement(newDoc(), pack, type, [0, 0]).doc;
  doc = addElement(doc, pack, type, [0, 16]).doc;
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

Deno.test("manual logic mode clears calculated outputs, preserves manual levels, and persists with the figure", () => {
  const scene = gate("and_gate", ["1", "1"]);
  const calculated = resolveLogic(scene.doc, pack);
  assertEquals(calculated.wires.find((wire) => wire.id === scene.output).level, "1");

  const manual = setLogicMode(calculated, pack, "manual");
  assertEquals(logicModeOf(manual), "manual");
  assertEquals(manual.groups.logic_generated_levels, undefined);
  assertEquals(manual.wires.filter((wire) => wire.id !== scene.output).map((wire) => wire.level), ["1", "1"]);
  assertEquals(manual.wires.find((wire) => wire.id === scene.output).level, undefined);
  assertEquals(resolveLogic(manual, pack), manual);

  const edited = setLevel(manual, [scene.output], "X", [], pack);
  assertEquals(drawing(edited, pack).wires.find((wire) => wire.id === scene.output).level, "X");
  const reopened = parse(serialize(edited, pack)).doc;
  assertEquals(logicModeOf(reopened), "manual");
  assertEquals(resolveLogic(reopened, pack).wires.find((wire) => wire.id === scene.output).level, "X");

  const automatic = setLogicMode(reopened, pack, "calculated");
  assertEquals(logicModeOf(automatic), "calculated");
  assertEquals(automatic.wires.find((wire) => wire.id === scene.output).level, "1");
});

Deno.test("a gate output carries through disconnected wires with the same net label", () => {
  const scene = gate("or_gate", ["0", "1"]);
  let doc = addWire(scene.doc, pack, point([20, 0]), point([30, 0])).doc;
  doc = setWireLabels(doc, [scene.output, "w4"], "OUT");
  const resolved = resolveLogic(doc, pack);
  assertEquals(resolved.wires.map((wire) => wire.level), ["0", "1", "1", "1"]);
  assert(Object.keys(resolved.groups.logic_generated_levels).includes("w4"));
});

function device(type, names, x = 20) {
  let doc = addElement(newDoc(), pack, type, [0, 0]).doc;
  const el = doc.elements[0], wires = {};
  for (const [i, name] of names.entries()) {
    const added = addWire(doc, pack, pin(`${el.id}.${name}`), point([x + i * 4, 20]));
    doc = added.doc; wires[name] = added.id;
  }
  return { doc, wires };
}
const ids = (wires, levels) => Object.fromEntries(Object.entries(levels).map(([k, v]) => [wires[k], v]));

Deno.test("timing: Frame 0 is the first step and sets a NAND latch the way hardware would", () => {
  const latch = nandLatch("1", "1");
  const at = (a, b) => ({ [latch.setWire]: a, [latch.resetWire]: b });
  const { results } = calculateSteps(latch.doc, pack, [at("0", "1"), at("1", "1"), at("1", "0"), at("0", "0"), at("1", "1")]);
  const q = results.map((r) => [r[latch.qWire], r[latch.qbarWire]]);
  // hold, reset, both active (what the gates give), released together (X: circuit-model C13 accepted difference 1)
  assertEquals(q, [["1", "0"], ["0", "1"], ["1", "1"], ["X", "X"]]);
});

Deno.test("timing: without a step that sets it, a latch's hand-set Frame 0 state is not used (X)", () => {
  const latch = nandLatch("1", "1");
  const at = (a, b) => ({ [latch.setWire]: a, [latch.resetWire]: b });
  const { results } = calculateSteps(latch.doc, pack, [{ ...at("1", "1"), [latch.qWire]: "0" }, at("1", "1")]);
  assertEquals(results[0][latch.qWire], "X");
});

Deno.test("timing: a D flip-flop acts on a rising edge between steps, Frame 0 included", () => {
  const { doc, wires } = device("d_flipflop", ["D", "CLK", "Q", "Qn"]);
  const steps = [{ D: "0", CLK: "0" }, { D: "1", CLK: "1" }, { D: "0", CLK: "0" }, { D: "0", CLK: "1" }].map((l) => ids(wires, l));
  const { results } = calculateSteps(doc, pack, steps);
  assertEquals(results.map((r) => r[wires.Q]), ["1", "1", "0"]);
  assertEquals(results.map((r) => r[wires.Qn]), ["0", "0", "1"]);
});

Deno.test("timing: a pulse is a rising edge in its step (0, then 1)", () => {
  const { doc, wires } = device("jk_flipflop", ["J", "K", "CLK", "Q", "Qn"], 40);
  const steps = [{ J: "0", K: "1", CLK: "0" }, { J: "0", K: "1", CLK: "1" }, { J: "1", K: "1", CLK: "1" }, { J: "1", K: "1", CLK: "1" }].map((l) => ids(wires, l));
  const { results } = calculateSteps(doc, pack, steps, [[wires.CLK], [wires.CLK], [wires.CLK]]);
  assertEquals(results.map((r) => r[wires.Q]), ["0", "1", "0"]);
});

Deno.test("timing: transparent latches propagate through a chain in the same step", () => {
  let doc = addElement(newDoc(), pack, "d_latch", [0, 0]).doc;
  doc = addElement(doc, pack, "d_latch", [24, 0]).doc;
  const [a, b] = doc.elements, wires = {};
  for (const [name, from, to] of [["data", point([-20, 2]), pin(`${a.id}.D`)], ["enableA", point([0, -20]), pin(`${a.id}.CLK`)],
    ["enableB", point([24, -20]), pin(`${b.id}.CLK`)], ["middle", pin(`${a.id}.Q`), pin(`${b.id}.D`)], ["out", pin(`${b.id}.Q`), point([40, 2])]]) {
    const added = addWire(doc, pack, from, to); doc = added.doc; wires[name] = added.id;
  }
  const { results } = calculateSteps(doc, pack, [{}, { [wires.data]: "1", [wires.enableA]: "1", [wires.enableB]: "1" }]);
  assertEquals([results[0][wires.middle], results[0][wires.out]], ["1", "1"]);
});

Deno.test("limit lifted: a clock pulse through a gate (Copilot's evaluator refused it)", () => {
  let doc = addElement(newDoc(), pack, "and_gate", [0, 0]).doc;
  doc = addElement(doc, pack, "d_flipflop", [30, 0]).doc;
  const [g, ff] = doc.elements, wires = {};
  for (const [name, from, to] of [["clk", point([-20, 0]), pin(`${g.id}.A`)], ["en", point([-20, 4]), pin(`${g.id}.B`)],
    ["gated", pin(`${g.id}.Y`), pin(`${ff.id}.CLK`)], ["d", point([10, 10]), pin(`${ff.id}.D`)], ["q", pin(`${ff.id}.Q`), point([60, 0])]]) {
    const added = addWire(doc, pack, from, to); doc = added.doc; wires[name] = added.id;
  }
  const at = (d, en) => ({ [wires.clk]: "1", [wires.en]: en, [wires.d]: d });
  const { results } = calculateSteps(doc, pack, [{ [wires.clk]: "0", [wires.en]: "1", [wires.d]: "0" }, at("1", "1"), at("0", "0"), at("0", "1")],
    [[wires.clk], [wires.clk], [wires.clk]]);
  assertEquals(results.map((r) => r[wires.q]), ["1", "1", "0"]);
});

