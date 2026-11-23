// F24: hand-set levels on driven nets are scenario/0.2 `initial` and `force` (circuit-model C14), applied by the
// simulator; the trace's `forced` marks the frames.

import { addElement, addWire, newDoc, parse, serialize, setLevel } from "../src/doc.js";
import { calculateSteps, resolveLogic } from "../src/simlevels.js";
import { convertHandLevels, handLevelsFromFrames, scenarioOf, setHandLevel } from "../src/scenario.js";
import { framesOf, moveFrame, removeFrame } from "../src/levelframes.js";
import { assert, assertEquals, pack } from "./helpers.js";

const point = (at) => ({ kind: "point", at });
const pin = (ref) => ({ kind: "pin", ref });

function nandLatch() {
  let doc = addElement(newDoc(), pack, "nand_gate", [0, 0]).doc;
  doc = addElement(doc, pack, "nand_gate", [0, 16]).doc;
  const [q, qbar] = doc.elements;
  const ins = (el) => Object.keys(pack.defFor(el).pins).filter((name) => name !== "Y").sort();
  const s = addWire(doc, pack, point([-12, 0]), pin(`${q.id}.${ins(q)[0]}`));
  const r = addWire(s.doc, pack, point([-12, 16]), pin(`${qbar.id}.${ins(qbar)[0]}`));
  const qw = addWire(r.doc, pack, pin(`${q.id}.Y`), pin(`${qbar.id}.${ins(qbar)[1]}`));
  const qbw = addWire(qw.doc, pack, pin(`${qbar.id}.Y`), pin(`${q.id}.${ins(q)[1]}`));
  return { doc: qbw.doc, s: s.id, r: r.id, q: qw.id, qn: qbw.id };
}

/** An AND gate whose output feeds a NOT gate. */
function andThenNot() {
  let doc = addElement(newDoc(), pack, "and_gate", [0, 0]).doc;
  doc = addElement(doc, pack, "not_gate", [16, 0]).doc;
  const [and, not] = doc.elements;
  const a = addWire(doc, pack, point([-12, 0]), pin(`${and.id}.A`));
  const b = addWire(a.doc, pack, point([-12, 4]), pin(`${and.id}.B`));
  const y = addWire(b.doc, pack, pin(`${and.id}.Y`), pin(`${not.id}.A`));
  const out = addWire(y.doc, pack, pin(`${not.id}.Y`), point([32, 0]));
  return { doc: out.doc, a: a.id, b: b.id, y: y.id, out: out.id };
}

Deno.test("a gate-level latch with a hand-set Frame 0 Q is forced for step 0, then holds and resets", () => {
  const l = nandLatch();
  const doc = setHandLevel(l.doc, pack, [l.q], 0, "1");
  assertEquals(scenarioOf(doc), { initial: {}, force: [{ id: l.q, level: "1", from: 0, to: 0 }] });
  const at = (s, r) => ({ [l.s]: s, [l.r]: r });
  const { results, forced } = calculateSteps(doc, pack, [at("1", "1"), at("1", "1"), at("1", "0"), at("1", "1")]);
  assertEquals(results.map((x) => [x[l.q], x[l.qn]]), [["1", "0"], ["0", "1"], ["0", "1"]]);
  assert(forced[0].includes(l.q), "frame 0 is marked forced");
  assertEquals(forced.slice(1), [[], [], []]);
  // Without the record the start is unknown (the simulator has no other way to know it).
  assertEquals(calculateSteps(l.doc, pack, [at("1", "1"), at("1", "1")]).results[0][l.q], "X");
});

Deno.test("Frame 0 Q or Qn on a flip-flop is its initial state", () => {
  let doc = addElement(newDoc(), pack, "d_flipflop", [0, 0]).doc;
  const ff = doc.elements[0].id, w = {};
  for (const [i, name] of ["D", "CLK", "Q", "Qn"].entries()) { const added = addWire(doc, pack, pin(`${ff}.${name}`), point([20 + i * 4, 20])); doc = added.doc; w[name] = added.id; }
  assertEquals(scenarioOf(setHandLevel(doc, pack, [w.Q], 0, "1")).initial, { [ff]: "1" });
  doc = setHandLevel(doc, pack, [w.Qn], 0, "0");
  assertEquals(scenarioOf(doc), { initial: { [ff]: "1" }, force: [] });
  const at = (d, clk) => ({ [w.D]: d, [w.CLK]: clk });
  const { results, forced } = calculateSteps(doc, pack, [at("0", "1"), at("0", "1"), at("0", "0"), at("0", "1")]);
  assertEquals(results.map((x) => x[w.Q]), ["1", "1", "0"]);   // holds 1 until a rising edge loads D = 0
  assertEquals(forced.flat(), []);
  doc = setHandLevel(doc, pack, [w.Q], 0, null);
  assertEquals(doc.groups?.scenario, undefined);
});

Deno.test("a forced node feeds the gates downstream, and release returns it to its driven value", () => {
  const g = andThenNot();
  let doc = setHandLevel(g.doc, pack, [g.y], 1, "0");
  doc = setHandLevel(doc, pack, [g.y], 2, "0");
  assertEquals(scenarioOf(doc).force, [{ id: g.y, level: "0", from: 1, to: 2 }]);   // neighbouring frames join
  const ones = { [g.a]: "1", [g.b]: "1" };
  const { results, forced } = calculateSteps(doc, pack, [ones, ones, ones, ones]);
  assertEquals(results.map((x) => [x[g.y], x[g.out]]), [["0", "1"], ["0", "1"], ["1", "0"]]);
  assertEquals(forced.map((ids) => ids.includes(g.y)), [false, true, true, false]);
  // Clearing the middle frame splits the force.
  assertEquals(scenarioOf(setHandLevel(doc, pack, [g.y], 1, null)).force, [{ id: g.y, level: "0", from: 2, to: 2 }]);
});

Deno.test("forces follow their frames when frames are moved or removed", () => {
  const g = andThenNot();
  let doc = { ...g.doc, groups: { frames: [{ name: "Frame 0", levels: {} }, { name: "A", levels: {} }, { name: "B", levels: {} }, { name: "C", levels: {} }] } };
  doc = setHandLevel(doc, pack, [g.y], 2, "0");
  assertEquals(scenarioOf(moveFrame(doc, 2, 1)).force, [{ id: g.y, level: "0", from: 3, to: 3 }]);
  assertEquals(scenarioOf(removeFrame(doc, 1)).force, [{ id: g.y, level: "0", from: 1, to: 1 }]);
  assertEquals(scenarioOf(removeFrame(doc, 2)).force, []);
});

Deno.test("a file saved before F24 is converted: hand-set levels in its frames become the scenario record, nothing lost", () => {
  const l = nandLatch(), g = andThenNot();
  // The old editor kept a hand-set Frame 0 Q and a hand-set later level only as frame levels.
  const old = { ...l.doc, groups: { frames: [
    { name: "Frame 0", levels: { [l.s]: "1", [l.r]: "1", [l.q]: "1" } },
    { name: "Step 1", levels: { [l.s]: "1", [l.r]: "1", [l.qn]: "0" } },                                  // hand-set
    { name: "Step 2", levels: { [l.s]: "1", [l.r]: "0", [l.q]: "0" }, calculated: { [l.q]: "0" } },      // calculated
  ] } };
  const reopened = parse(serialize(old, pack)).doc;
  const converted = convertHandLevels(reopened, pack);
  assertEquals(scenarioOf(converted), { initial: {}, force: [{ id: l.q, level: "1", from: 0, to: 0 }, { id: l.qn, level: "0", from: 1, to: 1 }] });
  assertEquals(framesOf(converted), framesOf(reopened));
  // The record is saved as editor data and read back; a second conversion changes nothing.
  const saved = JSON.parse(serialize(converted, pack));
  assertEquals(saved.annotations["schematic-editor"].scenario.force.length, 2);
  const again = parse(JSON.stringify(saved)).doc;
  assertEquals(convertHandLevels(again, pack), again);
  // Static-view levels the editor calculated (logic_generated_levels) are not taken for hand-set ones.
  const gen = { ...g.doc, groups: { logic_generated_levels: { [g.y]: "1" }, frames: [{ name: "Frame 0", levels: { [g.a]: "1", [g.b]: "1", [g.y]: "1" } }] } };
  assertEquals(convertHandLevels(gen, pack).groups.scenario, undefined);
});

Deno.test("timing cells set by hand on a driven signal are recorded from the frames; Frame 0 entries are kept", () => {
  const g = andThenNot();
  let doc = { ...g.doc, groups: { frames: [
    { name: "Frame 0", levels: {} },
    { name: "Step 1", levels: { [g.y]: "0" } },
    { name: "Step 2", levels: { [g.y]: "1" }, calculated: { [g.y]: "1" } },
  ] } };
  doc = setHandLevel(doc, pack, [g.y], 0, "1");
  const rebuilt = handLevelsFromFrames(doc, pack, 1);
  assertEquals(scenarioOf(rebuilt).force.map((x) => [x.level, x.from, x.to]), [["1", 0, 0], ["0", 1, 1]]);
});

Deno.test("the static view starts from Frame 0's record: a forced latch start holds once released", () => {
  const l = nandLatch();
  let doc = setLevel(setLevel(l.doc, [l.s], "1", [], pack), [l.r], "1", [], pack);
  doc = setHandLevel(doc, pack, [l.q], 0, "1");
  const level = (d, id) => d.wires.find((w) => w.id === id)?.level;
  const resolved = resolveLogic(doc, pack);
  assertEquals([level(resolved, l.q), level(resolved, l.qn)], ["1", "0"]);
});
