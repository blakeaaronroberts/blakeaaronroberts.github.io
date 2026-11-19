// The sample figure with labels and levels: the full adder from gates (examples/full-adder.js),
// with its ports named, one signal name, and every wire drawn at the logic level it carries
// for the inputs A = 1, B = 0, Cin = 1.
//
// The levels are computed, not drawn by hand: the figure's nets (deriveNets) are propagated
// through its gates, and each wire takes the value of the net it is on.

import { addLabel, deriveNets, isPoint, setLevel } from "../src/doc.js";
import { buildFullAdder } from "./full-adder.js";

export const INPUTS = { A: 1, B: 0, Cin: 1 };
const GATES = { and_gate: (a, b) => a & b, or_gate: (a, b) => a | b, xor_gate: (a, b) => a ^ b };

/** Net values by propagating the inputs through the two-input gates. */
export function propagate(doc, nets, inputs) {
  const netOf = new Map();
  for (const [id, refs] of Object.entries(nets)) for (const r of refs) netOf.set(r, id);
  const value = new Map();
  for (const [port, v] of Object.entries(inputs)) value.set(netOf.get(port), v);
  for (let pass = 0; pass < doc.elements.length; pass++) {
    for (const el of doc.elements) {
      const f = GATES[el.type];
      const a = value.get(netOf.get(`${el.id}.A`)), b = value.get(netOf.get(`${el.id}.B`));
      if (f && a !== undefined && b !== undefined) value.set(netOf.get(`${el.id}.Y`), f(a, b));
    }
  }
  return { value, netOf };
}

/** The pins and ports a wire ends on, following a junction back to the wire it taps. */
function anchors(doc, wire, seen = new Set()) {
  if (seen.has(wire.id)) return [];
  seen.add(wire.id);
  return [wire.from, wire.to].flatMap((end) => {
    if (isPoint(end)) return [];
    const j = doc.junctions.find((x) => x.id === end);
    return j ? anchors(doc, doc.wires.find((w) => w.id === j.on), seen) : [end];
  });
}

export function buildFullAdderLevels(pack) {
  let doc = buildFullAdder(pack);
  doc.id = "full_adder_levels";
  doc.title = "Full adder from gates, with labels and levels (sample)";
  const text = { A: "$A$", B: "$B$", Cin: "$C_{\\mathrm{in}}$", S: "$S$", Cout: "$C_{\\mathrm{out}}$" };
  for (const p of doc.ports) { p.label = text[p.id]; p.side = p.dir === "in" ? "left" : "right"; }
  doc = addLabel(doc, [8, 24], "$A \\oplus B$", "up").doc;      // the signal between the two XOR gates

  const { value, netOf } = propagate(doc, deriveNets(doc, pack), INPUTS);
  for (const w of doc.wires) {
    const net = anchors(doc, w).map((r) => netOf.get(r)).find((n) => n !== undefined);
    const v = value.get(net);
    if (v !== undefined) doc = setLevel(doc, [w.id], String(v));
  }
  return doc;
}
