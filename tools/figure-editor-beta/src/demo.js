// The starting figure: a full adder with a frame per input combination and a matching timing diagram. No DOM.
//
// The levels are computed, not drawn by hand: every gate of the circuit is evaluated from its inputs (two-input
// AND, OR, XOR, NAND, NOR, XNOR and NOT, BUF), net by net, until nothing changes. This stands in for the simulator
// (circuit-model C7) for combinational gate circuits only; anything else stays X.

import { deriveNets, wiresForRefs } from "./doc.js";

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
  const nets = deriveNets(doc, pack), netOf = new Map(), wireNet = new Map();
  for (const [name, refs] of Object.entries(nets)) {
    for (const ref of refs) netOf.set(ref, name);
    for (const id of wiresForRefs(doc, pack, refs)) wireNet.set(id, name);
  }
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
  return { level, netOf, wireNet };
}

/** Each wire's level ("0", "1" or "X") for an evaluation: a wire takes the level of the net its ends (or its junctions) are on. */
export function wireLevels(doc, { level, wireNet }) {
  const out = {};
  for (const w of doc.wires) {
    const v = level.get(wireNet.get(w.id));
    out[w.id] = v === null || v === undefined ? "X" : String(v);
  }
  return out;
}

function nodeNames(doc, pack) {
  const names = new Map(), nets = deriveNets(doc, pack);
  for (const [key, refs] of Object.entries(nets)) {
    names.set(key, key);
    for (const port of doc.ports) if (refs.includes(port.id)) {
      names.set(port.id, key);
      if (port.label) names.set(port.label, key);
    }
    for (const id of wiresForRefs(doc, pack, refs)) {
      const label = doc.groups?.wire_labels?.[id]?.trim();
      if (label) names.set(label, key);
    }
  }
  for (const label of Object.values(doc.groups?.wire_labels ?? {})) {
    if (typeof label === "string" && label.trim() && !names.has(label.trim())) names.set(label.trim(), null);
  }
  return names;
}

/** Named input ports, output ports and labelled wire nets, in schematic order. */
export function namedNetNames(doc) {
  return [...new Set([
    ...doc.ports.map((port) => port.id),
    ...Object.values(doc.groups?.wire_labels ?? {}).filter((label) => typeof label === "string").map((label) => label.trim()).filter(Boolean),
  ])];
}

function nodeValue(name, ev, names) {
  const key = names.has(name) ? names.get(name) : ev.netOf.get(name);
  return key === undefined || key === null ? null : ev.level.get(key) ?? null;
}

/**
 * Frames and a timing diagram that step the inputs through every combination (000, 001, ... 111 for three inputs).
 * Returns {frames: [{name, levels}], timing: WaveDrom-format source}. Outputs may be labelled wire nets.
 */
export function truthTable(doc, pack, inputs, outputs) {
  if (!inputs.length || !outputs.length) throw new Error("Choose at least one input and one output net.");
  if (inputs.length > 6) throw new Error("A timing diagram holds at most 64 cases; choose six or fewer inputs.");
  const names = nodeNames(doc, pack);
  const named = new Set(namedNetNames(doc));
  for (const name of outputs) if (!named.has(name)) throw new Error(`"${name}" is not a named net in this circuit.`);
  const n = 2 ** inputs.length, frames = [], waves = Object.fromEntries([...inputs, ...outputs].map((p) => [p, ""]));
  for (let k = 0; k < n; k++) {
    const vals = Object.fromEntries(inputs.map((p, i) => [p, (k >> (inputs.length - 1 - i)) & 1]));
    const ev = evaluate(doc, pack, vals);
    frames.push({ name: inputs.map((p) => `${p}=${vals[p]}`).join(" "), levels: wireLevels(doc, ev) });
    for (const p of [...inputs, ...outputs]) {
      const v = p in vals ? vals[p] : nodeValue(p, ev, names);
      const c = v === null || v === undefined ? "x" : String(v);
      waves[p] += waves[p].length && lastLevel(waves[p]) === c ? "." : c;
    }
  }
  return {
    frames,
    timing: { signal: [...inputs.map((p) => ({ name: p, wave: waves[p] })), {}, ...outputs.map((p) => ({ name: p, wave: waves[p] }))], head: { text: "Full adder", tock: 1 }, config: { steps: n } },
  };
}

/** Parse a complete CSV or tab-separated table whose headers are input ports and named output nets. */
export function parseTruthTable(text, doc, pack) {
  const lines = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("Paste a header row and every truth-table case.");
  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : null;
  if (!delimiter) throw new Error("Separate truth-table columns with commas or tabs.");
  const split = (line) => {
    const cells = [];
    let cell = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === delimiter && !quoted) { cells.push(cell.trim()); cell = ""; }
      else cell += ch;
    }
    if (quoted) throw new Error("A quoted table value is missing its closing quote.");
    cells.push(cell.trim());
    return cells;
  };
  const headers = split(lines[0]);
  if (headers.some((name) => !name) || new Set(headers).size !== headers.length) throw new Error("Every truth-table column needs a unique net name.");
  const ports = new Map(doc.ports.map((port) => [port.id, port]));
  const named = new Set(namedNetNames(doc));
  const inputs = [], outputs = [];
  for (const name of headers) {
    const port = ports.get(name);
    if (!port) {
      if (named.has(name)) outputs.push(name);
      else throw new Error(`"${name}" is not a named net in this circuit.`);
      continue;
    }
    if (port.dir === "in") inputs.push(name);
    else if (port.dir === "out") outputs.push(name);
    else throw new Error(`Port "${name}" needs an input or output direction.`);
  }
  if (!inputs.length || !outputs.length) throw new Error("Include at least one input port and one output net.");
  if (inputs.length > 6) throw new Error("A timing diagram holds at most 64 cases; choose six or fewer inputs.");
  const rows = lines.slice(1).map((line, index) => {
    const cells = split(line);
    if (cells.length !== headers.length) throw new Error(`Row ${index + 2} has ${cells.length} values; expected ${headers.length}.`);
    const inputIndexes = inputs.map((name) => headers.indexOf(name));
    if (inputIndexes.some((i) => cells[i] !== "0" && cells[i] !== "1") ||
        cells.some((value, i) => !inputIndexes.includes(i) && !["0", "1", "X"].includes(value))) {
      throw new Error(`Row ${index + 2} must contain only 0 or 1 (or X for an unknown net).`);
    }
    return {
      inputs: Object.fromEntries(inputs.map((name) => [name, cells[headers.indexOf(name)]])),
      expected: Object.fromEntries(outputs.map((name) => [name, cells[headers.indexOf(name)]])),
    };
  });
  return truthTableRows(doc, pack, inputs, outputs, rows);
}

/** Check all table rows against the circuit; returned waves show expected and computed outputs side by side. */
export function truthTableRows(doc, pack, inputs, outputs, rows) {
  if (!inputs.length || !outputs.length) throw new Error("Choose at least one input and one output net.");
  if (inputs.length > 6) throw new Error("A timing diagram holds at most 64 cases; choose six or fewer inputs.");
  if (new Set([...inputs, ...outputs]).size !== inputs.length + outputs.length) throw new Error("Input and output net names must be different.");
  const names = nodeNames(doc, pack);
  const named = new Set(namedNetNames(doc));
  for (const name of outputs) if (!named.has(name)) throw new Error(`"${name}" is not a named net in this circuit.`);
  const n = 2 ** inputs.length;
  if (rows.length !== n) throw new Error(`Expected all ${n} cases; received ${rows.length}.`);
  const seen = new Set(), frames = [], checks = [];
  const waves = Object.fromEntries([...inputs, ...outputs].map((name) => [name, ""]));
  const append = (name, value) => {
    const wave = waves[name], last = wave.replace(/\./g, "").slice(-1);
    waves[name] += last === value ? "." : value;
  };
  for (const [i, row] of rows.entries()) {
    const key = inputs.map((name) => row.inputs[name]).join("");
    if ([...key].some((value) => value !== "0" && value !== "1")) throw new Error(`Case ${i + 1} needs a 0 or 1 for every input.`);
    if ([...Object.values(row.expected)].some((value) => !["0", "1", "X"].includes(value))) throw new Error(`Case ${i + 1} needs a 0, 1 or X for every output.`);
    if (seen.has(key)) throw new Error(`Input case ${key} appears more than once.`);
    seen.add(key);
    const inputValues = Object.fromEntries(inputs.map((name) => [name, Number(row.inputs[name])]));
    const ev = evaluate(doc, pack, inputValues);
    const results = outputs.map((name) => {
      const value = nodeValue(name, ev, names);
      const actual = value === null || value === undefined ? "X" : String(value);
      const unresolved = actual === "X";
      return { name, expected: row.expected[name], actual, unresolved, pass: !unresolved && actual === row.expected[name] };
    });
    const label = inputs.map((name) => `${name}=${row.inputs[name]}`).join(", ");
    frames.push({ name: label, levels: wireLevels(doc, ev) });
    checks.push({ case: i + 1, inputs: inputValues, outputs: results, pass: results.every((result) => result.pass) });
    for (const name of inputs) append(name, row.inputs[name]);
    for (const result of results) append(result.name, result.actual === "X" ? "x" : result.actual);
  }
  if (seen.size !== n) {
    const missing = Array.from({ length: n }, (_, k) => k.toString(2).padStart(inputs.length, "0")).filter((key) => !seen.has(key));
    throw new Error(`Missing input cases: ${missing.join(", ")}.`);
  }
  return {
    frames,
    checks,
    timing: {
      signal: [...inputs.map((name) => ({ name, wave: waves[name] })), {}, ...outputs.map((name) => ({ name, wave: waves[name] }))],
      head: { text: "Truth table check" },
      config: { steps: n },
    },
  };
}
function lastLevel(wave) { for (let i = wave.length - 1; i >= 0; i--) if (wave[i] !== ".") return wave[i]; return null; }
