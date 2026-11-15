// The starting figure: a full adder with a frame per input combination and a matching timing diagram. No DOM.
//
// The levels are computed, not drawn by hand: every gate of the circuit is evaluated from its inputs (two-input
// AND, OR, XOR, NAND, NOR, XNOR and NOT, BUF), net by net, until nothing changes. This stands in for the simulator
// (circuit-model C7) for combinational gate circuits only; anything else stays X.

import { deriveNets } from "./doc.js";

const GATES = {
  and_gate: (v) => v.every((x) => x === 1) ? 1 : v.some((x) => x === 0) ? 0 : null,
  nand_gate: (v) => not(GATES.and_gate(v)),
  or_gate: (v) => v.some((x) => x === 1) ? 1 : v.every((x) => x === 0) ? 0 : null,
  nor_gate: (v) => not(GATES.or_gate(v)),
  xor_gate: (v) => v.some((x) => x === null) ? null : v.reduce((a, b) => a ^ b, 0),
  xnor_gate: (v) => not(GATES.xor_gate(v)),
  not_gate: (v) => not(v[0]),
  buf_gate: (v) => v[0] ?? null,
};
function not(x) { return x === null ? null : 1 - x; }

/** Every net's level for the given input port values ({portId: 0|1}): a Map net -> 0, 1 or null (unknown). */
export function evaluate(doc, pack, inputs) {
  const nets = deriveNets(doc, pack), netOf = new Map();
  for (const [name, refs] of Object.entries(nets)) for (const r of refs) netOf.set(r, name);
  const level = new Map(Object.keys(nets).map((n) => [n, null]));
  for (const [port, v] of Object.entries(inputs)) if (netOf.has(port)) level.set(netOf.get(port), v);
  for (let pass = 0; pass < 32; pass++) {
    let changed = false;
    for (const el of doc.elements) {
      const f = GATES[el.type];
      if (!f) continue;
      const pins = Object.keys(pack.defFor(el)?.pins ?? {});
      const out = pins.find((p) => p === "Y");
      if (!out) continue;
      const v = f(pins.filter((p) => p !== out).map((p) => level.get(netOf.get(`${el.id}.${p}`)) ?? null));
      const n = netOf.get(`${el.id}.${out}`);
      if (n !== undefined && level.get(n) !== v) { level.set(n, v); changed = true; }
    }
    if (!changed) break;
  }
  return { level, netOf };
}

/** Each wire's level ("0", "1" or "X") for an evaluation: a wire takes the level of the net its ends (or its junctions) are on. */
export function wireLevels(doc, { level, netOf }) {
  const out = {}, junctionWire = new Map(doc.junctions.map((j) => [j.id, j.on]));
  const netOfWire = new Map();
  for (let pass = 0; pass < 8; pass++) {
    for (const w of doc.wires) {
      if (netOfWire.has(w.id)) continue;
      for (const e of [w.from, w.to]) {
        if (typeof e !== "string") continue;
        const n = netOf.get(e) ?? netOfWire.get(junctionWire.get(e));
        if (n !== undefined) { netOfWire.set(w.id, n); break; }
      }
    }
  }
  for (const [id, n] of netOfWire) { const v = level.get(n); out[id] = v === null || v === undefined ? "X" : String(v); }
  return out;
}

/**
 * Frames and a timing diagram that step the inputs through every combination (000, 001, ... 111 for three inputs).
 * Returns {frames: [{name, levels}], timing: WaveDrom-format source}. Inputs and outputs are port ids.
 */
export function truthTable(doc, pack, inputs, outputs) {
  const n = 2 ** inputs.length, frames = [], waves = Object.fromEntries([...inputs, ...outputs].map((p) => [p, ""]));
  for (let k = 0; k < n; k++) {
    const vals = Object.fromEntries(inputs.map((p, i) => [p, (k >> (inputs.length - 1 - i)) & 1]));
    const ev = evaluate(doc, pack, vals);
    frames.push({ name: inputs.map((p) => `${p}=${vals[p]}`).join(" "), levels: wireLevels(doc, ev) });
    for (const p of [...inputs, ...outputs]) {
      const v = p in vals ? vals[p] : ev.level.get(ev.netOf.get(p));
      const c = v === null || v === undefined ? "x" : String(v);
      waves[p] += waves[p].length && lastLevel(waves[p]) === c ? "." : c;
    }
  }
  return {
    frames,
    timing: { signal: [...inputs.map((p) => ({ name: p, wave: waves[p] })), {}, ...outputs.map((p) => ({ name: p, wave: waves[p] }))], head: { text: "Full adder", tock: 1 }, config: { steps: n } },
  };
}
function lastLevel(wave) { for (let i = wave.length - 1; i >= 0; i--) if (wave[i] !== ".") return wave[i]; return null; }
