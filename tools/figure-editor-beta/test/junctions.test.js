// Four-way solder dots are selectable; T-junctions and crossings remain undotted.

import {
  addWire, allCorners, connectedWireIds, deleteSelection, deriveNets, extractFragment, junctionConnected,
  moveSelection, newDoc, parse, pasteFragment, serialize, setJunctionConnected, setLevel,
} from "../src/doc.js";
import { dots, joints, junctionCounts } from "../src/junctions.js";
import { framesFromSignals, framesOf } from "../src/levelframes.js";
import { onPolyline } from "../src/router.js";
import { buildFullAdder } from "../examples/full-adder.js";
import { assert, assertEquals, assertThrows, pack } from "./helpers.js";

const P = (at) => ({ kind: "point", at });

function cross() {
  // a horizontal wire from (-10, 0) to (10, 0)
  let { doc, id } = addWire(newDoc(), pack, P([-10, 0]), P([10, 0]));
  return { doc, h: id };
}

function fourWay() {
  let { doc, h } = cross();
  doc = addWire(doc, pack, P([0, 8]), { kind: "wire", id: h, at: [0, 0] }).doc;
  doc = addWire(doc, pack, { kind: "junction", id: "j1" }, P([0, -8])).doc;
  doc.ports.push(
    { id: "L", dir: "in", at: [-10, 0] }, { id: "R", dir: "in", at: [10, 0] },
    { id: "T", dir: "in", at: [0, 8] }, { id: "B", dir: "in", at: [0, -8] },
  );
  return doc;
}

Deno.test("T-junction: a wire ending on another wire makes a junction with 3 wires and no dot", () => {
  let { doc, h } = cross();
  doc = addWire(doc, pack, P([0, 8]), { kind: "wire", id: h, at: [0, 0] }).doc;
  assertEquals(doc.junctions, [{ id: "j1", on: h, at: [0, 0] }]);
  assertEquals(junctionCounts(doc).get("j1"), 3);
  assertEquals(dots(doc, pack), []);
});

Deno.test("four wires at a junction get a dot", () => {
  let { doc, h } = cross();
  doc = addWire(doc, pack, P([0, 8]), { kind: "wire", id: h, at: [0, 0] }).doc;
  doc = addWire(doc, pack, { kind: "junction", id: "j1" }, P([0, -8])).doc;
  assertEquals(junctionCounts(doc).get("j1"), 4);
  assertEquals(dots(doc, pack), [{ id: "j1", at: [0, 0], wires: 4 }]);
});

Deno.test("the solder-dot selector separates a four-way crossing in nets, levels and timing", () => {
  const connected = fourWay();
  const isolated = setJunctionConnected(connected, "j1", false);
  assertEquals(junctionConnected(connected, "j1"), true);
  assertEquals(junctionConnected(isolated, "j1"), false);
  assertEquals(dots(isolated, pack), []);
  assertEquals(joints(isolated, pack, allCorners(isolated, pack)), []);
  assertEquals(deriveNets(isolated, pack), { B: ["B", "T"], L: ["L", "R"] });
  assertEquals(connectedWireIds(isolated, pack, ["w1"]), ["w1"]);
  assertEquals(connectedWireIds(isolated, pack, ["w2"]), ["w2", "w3"]);

  const horizontal = setLevel(isolated, ["w1"], "1", [], pack);
  assertEquals(horizontal.wires.map((w) => w.level), ["1", undefined, undefined]);
  const timing = framesFromSignals(isolated, deriveNets(isolated, pack), [{ name: "L", levels: ["1"] }], pack);
  assertEquals(framesOf(timing.doc)[0].levels, { w1: "1" });

  assertEquals(deriveNets(connected, pack), { B: ["B", "L", "R", "T"] });
  assertEquals(connectedWireIds(connected, pack, ["w1"]), ["w1", "w2", "w3"]);
  assertEquals(dots(connected, pack).length, 1);
  const connectedTiming = framesFromSignals(connected, deriveNets(connected, pack), [{ name: "L", levels: ["1"] }], pack);
  assertEquals(Object.keys(framesOf(connectedTiming.doc)[0].levels).sort(), ["w1", "w2", "w3"]);
});

Deno.test("an undotted four-way junction survives save, load and copy/paste", () => {
  const doc = setJunctionConnected(fourWay(), "j1", false);
  const saved = serialize(doc, pack);
  const loaded = parse(saved).doc;
  assertEquals(junctionConnected(loaded, "j1"), false);
  assertEquals(serialize(loaded, pack), saved);

  const fragment = extractFragment(doc, pack, { wires: ["w1", "w2", "w3"] });
  const pasted = pasteFragment(newDoc(), pack, fragment, [30, 0]).doc;
  assertEquals(junctionConnected(pasted, "j1"), false);
  assertThrows(() => setJunctionConnected(doc, "missing", false), /no junction/);
});

Deno.test("ending a second wire on the same point of a wire reuses its junction", () => {
  let { doc, h } = cross();
  doc = addWire(doc, pack, P([0, 8]), { kind: "wire", id: h, at: [0, 0] }).doc;
  doc = addWire(doc, pack, P([0, -8]), { kind: "wire", id: h, at: [0, 0] }).doc;
  assertEquals(doc.junctions.length, 1);
  assertEquals(dots(doc, pack).length, 1);
});

Deno.test("a crossing does not connect and has no dot", () => {
  let { doc, h } = cross();
  const v = addWire(doc, pack, P([0, 8]), P([0, -8]));
  doc = v.doc;
  assertEquals(doc.junctions, []);
  assertEquals(dots(doc, pack), []);
  assertEquals(joints(doc, pack, allCorners(doc, pack)), []);
  // two separate wires: if they were connected, the nets would merge. Use ports to make them visible as nets.
  doc.ports.push({ id: "L", dir: "in", at: [-10, 0] }, { id: "T", dir: "in", at: [0, 8] });
  const nets = deriveNets(doc, pack);
  assertEquals(Object.keys(nets), ["L", "T"]);
  assertEquals(nets.L, ["L"]);
  assertEquals(nets.T, ["T"]);
  void h;
});

Deno.test("the sample full adder has two four-way dots, T-junctions without dots, and correct nets", () => {
  const doc = buildFullAdder(pack);
  const counts = [...junctionCounts(doc).values()].sort();
  assertEquals(counts, [3, 3, 4, 4]);
  assertEquals(dots(doc, pack).map((d) => d.at), [[-30, 13], [-22, -1]]);
  const nets = deriveNets(doc, pack);
  assertEquals(nets.A, ["A", "and1.A", "and3.A", "xor1.A"]);
  assertEquals(nets.B, ["B", "and1.B", "and2.A", "xor1.B"]);
  assertEquals(nets.Cin, ["Cin", "and2.B", "and3.B", "xor2.B"]);
  assertEquals(nets.S, ["S", "xor2.Y"]);
  assertEquals(nets.Cout, ["Cout", "or2.Y"]);
  assertEquals(Object.keys(nets).length, 5 + 5);   // plus X1 and the four gate-to-gate nets
});

Deno.test("a junction pushed off its wire by a reroute moves onto the new route", () => {
  let { doc, h } = cross();
  doc = addWire(doc, pack, P([0, 8]), { kind: "wire", id: h, at: [6, 0] }).doc;
  // move the tapped wire (and its free ends) as a whole: the junction goes with it
  const moved = moveSelection(doc, pack, { wires: [h] }, [0, 2]);
  assertEquals(moved.junctions[0].at, [6, 2]);
  const c = allCorners(moved, pack).get(h);
  assert(onPolyline(moved.junctions[0].at, c));
});

Deno.test("deleting a tapped wire turns the branch end into a free end and drops the junction", () => {
  let { doc, h } = cross();
  const b = addWire(doc, pack, P([0, 8]), { kind: "wire", id: h, at: [0, 0] });
  doc = deleteSelection(b.doc, pack, { wires: [h] });
  assertEquals(doc.junctions, []);
  assertEquals(doc.wires.find((w) => w.id === b.id).to, [0, 0]);
});

Deno.test("a wire continuing a pin's lead gets a straight seam patch; an L gets a full joint", () => {
  let doc = newDoc();
  doc = addWire(doc, pack, P([0, 0]), P([6, 0])).doc;
  doc = addWire(doc, pack, P([6, 0]), P([12, 0])).doc;     // straight on
  doc = addWire(doc, pack, P([0, 0]), P([0, 6])).doc;      // at a right angle
  const j = joints(doc, pack, allCorners(doc, pack)).map(({ at, straight }) => ({ at, straight }));
  assertEquals(j, [{ at: [0, 0], straight: false }, { at: [6, 0], straight: true }]);
});
