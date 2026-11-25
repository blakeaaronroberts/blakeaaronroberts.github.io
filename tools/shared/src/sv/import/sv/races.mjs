// Stimulus races at clock edges (C11.2). When a testbench changes data at the
// instant a flip-flop's clock rises (or a latch's enable falls), SystemVerilog
// does not say which happens first, so the trace would be a guess. Found after
// the run, from the trace: the circuit's structure says which inputs reach each
// clock and data pin, and the trace says when the clock had an edge.

import { flatten } from "../../sim/flatten.mjs";
import { MODELS } from "../../sim/logic.mjs";

/**
 * Returns { races, notes }: each race { step, time, element, clock, data } with
 * the input bits involved; each note { step, time, element, clock, inputs, kind }, kind
 * "start" (the clock is already 1 at time 0) or "unknown" (it rises from X).
 */
export function findRaces(circuit, scenario, trace) {
  const flat = flatten(circuit);
  const netOf = new Map();
  for (const [n, refs] of Object.entries(flat.nets)) for (const r of refs) netOf.set(r, n);
  const drivers = new Map(); // net -> [{ port } or { element, model }]
  const drive = (net, d) => { if (net !== undefined) (drivers.get(net) ?? drivers.set(net, []).get(net)).push(d); };
  for (const id of scenario.inputs) drive(netOf.get(id), { port: id });
  for (const e of flat.elements) for (const pin of MODELS[e.type]?.outputs ?? []) drive(netOf.get(`${e.id}.${pin}`), { element: e });

  const pinsOf = (e) => (typeof MODELS[e.type].inputs === "function" ? MODELS[e.type].inputs(e) : MODELS[e.type].inputs);
  /** The scenario inputs that can change a net at once: through gates and transparent latches, and through a flip-flop's clock. */
  function reach(nets) {
    const found = new Set();
    const seen = new Set();
    const todo = [...nets];
    while (todo.length) {
      const n = todo.pop();
      if (n === undefined || seen.has(n)) continue;
      seen.add(n);
      for (const d of drivers.get(n) ?? []) {
        if (d.port) { found.add(d.port); continue; }
        const edgeTriggered = MODELS[d.element.type].sequential && !/latch/.test(d.element.type);
        for (const pin of edgeTriggered ? ["CLK"] : pinsOf(d.element)) todo.push(netOf.get(`${d.element.id}.${pin}`));
      }
    }
    return found;
  }

  const races = [];
  const notes = [];
  for (const e of flat.elements) {
    if (!MODELS[e.type]?.sequential || !pinsOf(e).includes("CLK")) continue;
    const clock = netOf.get(`${e.id}.CLK`);
    if (clock === undefined) continue;
    const latch = /latch/.test(e.type);
    const falling = latch || e.params?.edge === "falling";
    const [off, on] = falling ? ["1", "0"] : ["0", "1"]; // the edge that samples: off to on
    const clockInputs = reach([clock]);
    const dataInputs = reach(pinsOf(e).filter((p) => p !== "CLK").map((p) => netOf.get(`${e.id}.${p}`)));
    if (!latch && trace.steps[0].values[clock] === on) notes.push({ step: 0, time: 0, element: e.id, clock, inputs: [...clockInputs], kind: "start" });
    for (let k = 1; k < trace.steps.length; k++) {
      const was = trace.steps[k - 1].values[clock];
      const is = trace.steps[k].values[clock];
      const changed = Object.keys(scenario.steps[k].values);
      const onClock = changed.filter((id) => clockInputs.has(id));
      if (onClock.length === 0) continue;
      const edge = was !== is && was !== on && is !== off;
      const time = trace.steps[k].start;
      if (edge && !latch && !["0", "1"].includes(was) && is === on) notes.push({ step: k, time, element: e.id, clock, inputs: onClock, kind: "unknown" });
      const data = changed.filter((id) => dataInputs.has(id) && !clockInputs.has(id));
      if (edge && data.length) races.push({ step: k, time, element: e.id, clock: onClock, data });
      // Two inputs of a gated clock changing together may or may not give an edge on the way.
      else if (onClock.length > 1) races.push({ step: k, time, element: e.id, clock: onClock.slice(0, 1), data: onClock.slice(1) });
    }
  }
  return { races, notes };
}
