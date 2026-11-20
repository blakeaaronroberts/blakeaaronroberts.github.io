// R1.4 parity suite: every case of logic.test.js and sequential.test.js, run through Copilot's evaluator (logic.js) and
// circuit-model's simulator (simlevels.js, tag model-v0.7.0). Where they disagree, the case is listed in KNOWN with the
// reason: one of circuit-model C13's four accepted differences, or a question for Blake (not decided here).
// Any other disagreement fails. This file goes when logic.js does; simlevels.test.js keeps the simulator's answers.

import { addElement, addWire, newDoc, setLevel } from "../src/doc.js";
import * as old from "../src/logic.js";
import * as sim from "../src/simlevels.js";
import { setWireLabels } from "../src/levelframes.js";
import { assertEquals, pack } from "./helpers.js";

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

function device(type, names, x = 20) {
  let doc = addElement(newDoc(), pack, type, [0, 0]).doc;
  const el = doc.elements[0], wires = {};
  for (const [i, name] of names.entries()) {
    const added = addWire(doc, pack, pin(`${el.id}.${name}`), point([x + i * 4, 20]));
    doc = added.doc; wires[name] = added.id;
  }
  return { doc, wires };
}

/** Copilot's timing calculator, step by step; a prompt answers `answer` (null cancels the step, which then reads "cancel"). */
function oldTiming(doc, initial, steps, pulses = [], answer = "X") {
  const calc = old.timingCalculator(doc, pack, initial);
  return steps.map((levels, i) => calc.step(levels, () => answer, pulses[i] ?? []) ?? "cancel");
}
const newTiming = (doc, initial, steps, pulses = []) => sim.calculateSteps(doc, pack, [initial, ...steps], pulses).results;

const levelsOf = (doc, ids) => ids.map((id) => doc.wires.find((w) => w.id === id)?.level ?? null);
const staticCase = (name, doc, ids, edits = []) => {
  const run = (impl) => {
    let d = impl.resolveLogic(doc, pack);
    const out = [levelsOf(d, ids)];
    for (const [wire, level] of edits) { d = impl.resolveLogic(setLevel(d, [wire], level, [], pack), pack); out.push(levelsOf(d, ids)); }
    return out;
  };
  return { name, old: run(old), sim: run(sim) };
};
const pick = (results, ids) => results.map((r) => (r === "cancel" ? "cancel" : ids.map((id) => r[id] ?? null)));

const cases = [];
for (const [type, inputs, params] of [
  ["and_gate", ["1", "1"]], ["and_gate", ["0", "1"]], ["nand_gate", ["1", "1"]], ["or_gate", ["0", "1"]], ["nor_gate", ["0", "0"]],
  ["xor_gate", ["1", "0"]], ["not_gate", ["0"]], ["and_gate", ["1", "1", "0"], { n: 3 }],
  ["and_gate", ["0", "X"]], ["and_gate", ["0", null]], ["and_gate", ["1", "Z"]], ["or_gate", ["1", "X"]], ["xor_gate", ["1", "X"]], ["not_gate", ["Z"]],
  ["and_gate", [null, null]],
]) {
  const s = gate(type, inputs, params);
  cases.push(staticCase(`gate ${type} ${JSON.stringify(inputs)}`, s.doc, [s.output]));
}
{
  const s = gate("and_gate", ["1", "1"]);
  cases.push(staticCase("gate output follows a changed input", s.doc, [s.output], [["w1", "0"]]));
}
{
  const l = nandLatch("0", "1");
  cases.push(staticCase("NAND latch set, hold, reset, both active", l.doc, [l.qWire, l.qbarWire], [[l.setWire, "1"], [l.resetWire, "0"], [l.setWire, "0"]]));
  const u = nandLatch("1", "1");
  cases.push(staticCase("NAND latch, both inactive from the start", u.doc, [u.qWire, u.qbarWire]));
}
{
  const s = gate("or_gate", ["0", "1"]);
  let doc = addWire(s.doc, pack, point([20, 0]), point([30, 0])).doc;
  doc = setWireLabels(doc, [s.output, "w4"], "OUT");
  cases.push(staticCase("a net label carries an output to a disconnected wire", doc, ["w1", "w2", s.output, "w4"]));
}
{
  const l = nandLatch("1", "1");
  const inputs = (a, b) => ({ [l.setWire]: a, [l.resetWire]: b });
  const steps = [inputs("1", "1"), inputs("0", "1"), inputs("0", "0"), inputs("1", "1")];
  cases.push({ name: "timing: NAND latch, Frame 0 sets Q = 0 by hand", old: pick(oldTiming(l.doc, { [l.qWire]: "0" }, steps, [], null), [l.qWire, l.qbarWire]),
    sim: pick(newTiming(l.doc, { [l.qWire]: "0", ...inputs("1", "1") }, steps), [l.qWire, l.qbarWire]) });
  const n = nandLatch("0", "0", "nor_gate");
  const nin = (a, b) => ({ [n.setWire]: a, [n.resetWire]: b });
  const nsteps = [nin("0", "0"), nin("1", "0"), nin("0", "0"), nin("0", "1")];
  cases.push({ name: "timing: NOR latch, Frame 0 sets Q = 1 by hand", old: pick(oldTiming(n.doc, { [n.qWire]: "1" }, nsteps), [n.qWire]),
    sim: pick(newTiming(n.doc, { [n.qWire]: "1", ...nin("0", "0") }, nsteps), [n.qWire]) });
}
{
  const { doc, wires } = device("jk_flipflop", ["J", "K", "CLK", "Q", "Qn"], 40);
  const at = (clock) => ({ [wires.J]: "1", [wires.K]: "1", [wires.CLK]: clock });
  cases.push({ name: "timing: JK toggles from an unknown state (Copilot prompts; answered 0)", old: pick(oldTiming(doc, {}, [at("0"), at("1")], [], "0"), [wires.Q]),
    sim: pick(newTiming(doc, {}, [at("0"), at("1")]), [wires.Q]) });
}
{
  const { doc, wires } = device("d_flipflop", ["D", "CLK", "Q", "Qn"]);
  const at = (d, c) => ({ [wires.D]: d, [wires.CLK]: c });
  const steps = [at("1", "1"), at("1", "0"), at("1", "1")];
  cases.push({ name: "timing: D flip-flop, Frame 0 sets Q = 0 by hand, CLK 1 in step 1", old: pick(oldTiming(doc, { [wires.Q]: "0" }, steps), [wires.Q, wires.Qn]),
    sim: pick(newTiming(doc, { [wires.Q]: "0" }, steps), [wires.Q, wires.Qn]) });
}
{
  const { doc, wires } = device("t_flipflop", ["T", "CLK", "Q", "Qn"], 30);
  const at = { [wires.T]: "1", [wires.CLK]: "1" };
  cases.push({ name: "timing: T flip-flop, a pulse in each step, Frame 0 sets Q = 0 by hand", old: pick(oldTiming(doc, { [wires.Q]: "0" }, [at, at, at], [[wires.CLK], [wires.CLK], [wires.CLK]]), [wires.Q]),
    sim: pick(newTiming(doc, { [wires.Q]: "0" }, [at, at, at], [[wires.CLK], [wires.CLK], [wires.CLK]]), [wires.Q]) });
}
{
  let doc = addElement(newDoc(), pack, "d_latch", [0, 0]).doc;
  doc = addElement(doc, pack, "d_latch", [24, 0]).doc;
  const [a, b] = doc.elements, wires = {};
  for (const [name, from, to] of [["data", point([-20, 2]), pin(`${a.id}.D`)], ["enableA", point([0, -20]), pin(`${a.id}.CLK`)],
    ["enableB", point([24, -20]), pin(`${b.id}.CLK`)], ["middle", pin(`${a.id}.Q`), pin(`${b.id}.D`)], ["out", pin(`${b.id}.Q`), point([40, 2])]]) {
    const added = addWire(doc, pack, from, to); doc = added.doc; wires[name] = added.id;
  }
  const step = { [wires.data]: "1", [wires.enableA]: "1", [wires.enableB]: "1" };
  cases.push({ name: "timing: transparent latches in a chain", old: pick(oldTiming(doc, {}, [step]), [wires.middle, wires.out]), sim: pick(newTiming(doc, {}, [step]), [wires.middle, wires.out]) });
}

// sequential.test.js: one element at a time. "previous" Q comes from a first step that sets it as hardware would.
{
  const one = (type, names, setQ, input, clockBefore) => {
    const { doc, wires } = device(type, [...names, "Q", "Qn"]);
    const ids = (levels) => Object.fromEntries(Object.entries(levels).map(([k, v]) => [wires[k], v]));
    const before = { ...input, ...(clockBefore !== null ? { CLK: clockBefore } : {}) };
    const oldR = old.timingCalculator(doc, pack, setQ === null ? {} : { [wires.Q]: setQ });
    if (clockBefore !== null) oldR.step(ids(before), () => setQ ?? "X");
    const r = oldR.step(ids(input), () => "X");
    const steps = clockBefore !== null ? [ids(before), ids(input)] : [ids(input)];
    const s = sim.calculateSteps(doc, pack, [{}, ...steps]).results.at(-1);
    return { old: r ? [r[wires.Q]] : ["cancel"], sim: [s[wires.Q] ?? null] };
  };
  for (const [type, names, q, input, clk] of [
    ["d_latch", ["D", "CLK"], "0", { D: "1", CLK: "1" }, null],
    ["d_latch", ["D", "CLK"], "0", { D: "1", CLK: "0" }, null],
    ["d_flipflop", ["D", "CLK"], "0", { D: "1", CLK: "1" }, "0"],
    ["d_flipflop", ["D", "CLK"], "0", { D: "1", CLK: "0" }, "1"],
    ["t_flipflop", ["T", "CLK"], "0", { T: "1", CLK: "1" }, "0"],
    ["jk_flipflop", ["J", "K", "CLK"], null, { J: "1", K: "0", CLK: "1" }, "0"],
    ["jk_flipflop", ["J", "K", "CLK"], null, { J: "0", K: "1", CLK: "1" }, "0"],
  ]) cases.push({ name: `sequential: ${type} Q=${q} ${JSON.stringify(input)} after CLK ${clk}`, ...one(type, names, q, input, clk) });
}

/** Disagreements, each with its reason. Accepted: circuit-model C13's four. Question: for Blake; not decided here. */
const KNOWN = {
  "timing: NAND latch, Frame 0 sets Q = 0 by hand": "question: Frame 0's hand-set Q is not state the simulator can be given; with both inputs inactive from the start Q is X until a step sets it. Also accepted (2) and (1): both active gives 1, 1 and releasing both together gives X, where Copilot prompted",
  "timing: NOR latch, Frame 0 sets Q = 1 by hand": "question: as above, Frame 0's hand-set Q; the first hold step is X until the latch is set or reset",
  "timing: JK toggles from an unknown state (Copilot prompts; answered 0)": "accepted (3) and prompts become X: toggling an unknown state is X",
  "timing: D flip-flop, Frame 0 sets Q = 0 by hand, CLK 1 in step 1": "question: Frame 0's hand-set Q; and Frame 0 to step 1 is now a step, so CLK X (unset in Frame 0) to 1 is an uncertain edge, accepted (3)",
  "timing: T flip-flop, a pulse in each step, Frame 0 sets Q = 0 by hand": "question: Frame 0's hand-set Q; toggling from X stays X",
  "sequential: d_latch Q=0 {\"D\":\"1\",\"CLK\":\"0\"} after CLK null": "question: hold with a hand-set previous Q; the simulator has no previous Q, so X",
  "sequential: d_flipflop Q=0 {\"D\":\"1\",\"CLK\":\"0\"} after CLK 1": "question: hold with a hand-set previous Q; the simulator has no previous Q, so X",
  "sequential: t_flipflop Q=0 {\"T\":\"1\",\"CLK\":\"1\"} after CLK 0": "question: toggle with a hand-set previous Q; X without it",
};

Deno.test("parity: Copilot's evaluator and circuit-model's simulator agree, apart from the listed differences", () => {
  const found = {};
  for (const c of cases) if (JSON.stringify(c.old) !== JSON.stringify(c.sim)) found[c.name] = { old: c.old, sim: c.sim };
  const unexplained = Object.keys(found).filter((name) => !(name in KNOWN));
  const stale = Object.keys(KNOWN).filter((name) => !(name in found));
  if (unexplained.length || stale.length) console.log(JSON.stringify(found, null, 1));
  assertEquals({ unexplained: unexplained.map((n) => [n, found[n]]), stale }, { unexplained: [], stale: [] });
});
