// Is a circuit fully combinational, and if so, what is its truth table?
//
// Two checks, and both must agree:
//   1. structure (analyze): no sequential element, no feedback loop, no
//      tri-state or bidirectional element, no floating input, no output
//      that nothing drives, no net with two drivers, and every element
//      simulated;
//   2. the simulator (circuitToFunctions): every input combination is driven,
//      the circuit settles, and every output is read. An output that is X or Z
//      on some row is reported, and that row becomes "-" (don't care) in the
//      table, never 0.
//
// The tables are `function/0.1` objects, one per output bit, sharing their
// variables. That format allows at most 8 variables; a circuit with more inputs
// gets, for each output, a table over only the inputs that reach it, and an
// output that still needs more than 8 is reported as too_many_inputs.
//
// JavaScript only: the simulator is JavaScript only (DECISIONS.md, 2026-11-23).

import { MODELS, CONNECTORS } from "../sim/logic.mjs";
import { simulate as realSimulate } from "../sim/simulate.mjs";
import { fromTable } from "../logic/function.mjs";
import { isVariableName } from "../logic/expr.mjs";

/** The function format's limit on variables. */
export const MAX_INPUTS = 8;

/** Element types that store state but have no simulation model (they are drawn only). */
export const STORAGE_TYPES = new Set(["register", "register_file", "counter", "shift_register", "sram"]);

/** Element types whose outputs can float (Z) or whose pins work both ways. */
export const TRISTATE_TYPES = new Set(["bus_transceiver", "open_drain_buffer"]);

/** Reasons that stop a table being made at all. */
const NO_TABLE = new Set(["sequential", "tristate", "not_simulated"]);

const inputPinsOf = (model, e) => (typeof model.inputs === "function" ? model.inputs(e) : model.inputs);

/** Nets, switch-joined groups, ports, drivers and readers: what both checks need. */
function connectivity(circuit) {
  const netIds = Object.keys(circuit.nets ?? {});
  const netOfRef = new Map();
  for (const net of netIds) for (const ref of circuit.nets[net]) netOfRef.set(ref, net);

  // Union-find over closed switches, iterative with path compression.
  const parent = new Map(netIds.map((n) => [n, n]));
  const find = (n) => {
    let root = n;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(n) !== root) { const next = parent.get(n); parent.set(n, root); n = next; }
    return root;
  };
  for (const e of circuit.elements ?? []) {
    if (e.type === "switch" && e.params?.closed === true) {
      const a = netOfRef.get(`${e.id}.1`);
      const b = netOfRef.get(`${e.id}.2`);
      if (a && b) parent.set(find(a), find(b));
    }
  }
  const groupOfRef = (ref) => { const net = netOfRef.get(ref); return net === undefined ? null : find(net); };
  const netsByGroup = new Map();
  for (const n of netIds) {
    const g = find(n);
    if (!netsByGroup.has(g)) netsByGroup.set(g, []);
    netsByGroup.get(g).push(n);
  }
  const netsOf = (group) => netsByGroup.get(group) ?? [];

  const ports = circuit.ports ?? [];
  const drivers = new Map(); // group -> [driver ref]
  const addDriver = (g, ref) => { if (g !== null) { if (!drivers.has(g)) drivers.set(g, []); drivers.get(g).push(ref); } };
  for (const p of ports) if (p.dir === "in") addDriver(groupOfRef(p.id), p.id);

  const opaque = new Set(); // groups touched by an element we cannot see inside
  const elements = []; // simulated elements: { e, model, inputs: {pin: group}, outputs: {pin: group} }
  for (const e of circuit.elements ?? []) {
    if (CONNECTORS.has(e.type)) continue;
    const model = MODELS[e.type];
    if (!model || model.tristate || TRISTATE_TYPES.has(e.type)) {
      for (const [ref, net] of netOfRef) if (ref.startsWith(`${e.id}.`)) opaque.add(find(net));
      continue;
    }
    model.check?.(e);
    const inputs = {};
    for (const pin of inputPinsOf(model, e)) inputs[pin] = groupOfRef(`${e.id}.${pin}`);
    const outputs = {};
    for (const pin of model.outputs) {
      outputs[pin] = groupOfRef(`${e.id}.${pin}`);
      addDriver(outputs[pin], `${e.id}.${pin}`);
    }
    elements.push({ e, model, inputs, outputs });
  }
  return { netOfRef, groupOfRef, netsOf, ports, drivers, opaque, elements };
}

/**
 * Port ids in table order: buses (circuit.groups, in order, most significant
 * bit first), then the remaining ports in the order they are listed.
 */
function ordered(circuit, dir) {
  const ports = (circuit.ports ?? []).filter((p) => p.dir === dir);
  const ids = new Set(ports.map((p) => p.id));
  const out = [];
  const display = {};
  for (const [bus, members] of Object.entries(circuit.groups ?? {})) {
    members.forEach((id, i) => {
      if (ids.has(id) && !(id in display)) { out.push(id); display[id] = `${bus}[${members.length - 1 - i}]`; }
    });
  }
  for (const p of ports) if (!(p.id in display)) { out.push(p.id); display[p.id] = p.id; }
  return { ids: out, display };
}

/**
 * Iterative Tarjan: the strongly connected components of a graph given as
 * adjacency lists over 0..n-1 that contain a cycle (more than one node, or a
 * node with an edge to itself).
 */
function cycles(n, next) {
  const index = new Array(n).fill(-1), low = new Array(n).fill(0), onStack = new Array(n).fill(false);
  const stack = [], found = [];
  let counter = 0;
  for (let root = 0; root < n; root++) {
    if (index[root] !== -1) continue;
    const work = [[root, 0]];
    index[root] = low[root] = counter++;
    stack.push(root); onStack[root] = true;
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, i] = frame;
      if (i < next[v].length) {
        frame[1]++;
        const w = next[v][i];
        if (index[w] === -1) {
          index[w] = low[w] = counter++;
          stack.push(w); onStack[w] = true;
          work.push([w, 0]);
        } else if (onStack[w]) low[v] = Math.min(low[v], index[w]);
        continue;
      }
      work.pop();
      if (work.length) { const u = work[work.length - 1][0]; low[u] = Math.min(low[u], low[v]); }
      if (low[v] === index[v]) {
        const component = [];
        let w;
        do { w = stack.pop(); onStack[w] = false; component.push(w); } while (w !== v);
        if (component.length > 1 || next[v].includes(v)) found.push(component.sort((a, b) => a - b));
      }
    }
  }
  return found.sort((a, b) => a[0] - b[0]);
}

/**
 * The structural check. Returns { combinational, reasons }, where each reason
 * is { kind, message, ... } naming the element, pin, port or nets concerned.
 */
export function analyze(circuit) {
  return structure(circuit, connectivity(circuit));
}

function structure(circuit, k) {
  const reasons = [];
  const { drivers, opaque, elements, netsOf, groupOfRef } = k;

  for (const e of circuit.elements ?? []) {
    if (CONNECTORS.has(e.type)) continue;
    const model = MODELS[e.type];
    if (model?.sequential || (!model && STORAGE_TYPES.has(e.type))) {
      reasons.push({ kind: "sequential", element: e.id, message: `${e.id} is a ${e.type}, which stores state` });
    } else if (model?.tristate || TRISTATE_TYPES.has(e.type)) {
      reasons.push({ kind: "tristate", element: e.id, message: `${e.id} is a ${e.type}, whose output can float (Z)` });
    } else if (!model) {
      reasons.push({ kind: "not_simulated", element: e.id, message: `${e.id} is a ${e.type}, which the simulator does not model, so the answer cannot be decided` });
    }
  }

  // Feedback: a cycle among the combinational elements.
  const combinational = elements.filter((x) => !x.model.sequential);
  const readersOf = new Map();
  combinational.forEach((x, i) => {
    for (const g of Object.values(x.inputs)) if (g !== null) {
      if (!readersOf.has(g)) readersOf.set(g, new Set());
      readersOf.get(g).add(i);
    }
  });
  const next = combinational.map((x) => [...new Set(Object.values(x.outputs).flatMap((g) => (g === null ? [] : [...(readersOf.get(g) ?? [])])))]);
  for (const component of cycles(combinational.length, next)) {
    const members = new Set(component);
    const ids = component.map((i) => combinational[i].e.id);
    const groups = new Set(component.flatMap((i) => Object.values(combinational[i].outputs)
      .filter((g) => g !== null && [...(readersOf.get(g) ?? [])].some((r) => members.has(r)))));
    const nets = [...groups].flatMap(netsOf).sort();
    reasons.push({ kind: "loop", elements: ids, nets, message: `feedback loop through ${ids.join(", ")} (nets ${nets.join(", ")})` });
  }

  for (const [g, refs] of drivers) {
    if (refs.length > 1) {
      const nets = netsOf(g).sort();
      reasons.push({ kind: "multiple_drivers", nets, drivers: [...refs], message: `net ${nets.join(", ")} is driven by ${refs.join(" and ")}` });
    }
  }

  for (const x of elements) {
    const optional = x.model.optional ?? {};
    for (const [pin, g] of Object.entries(x.inputs)) {
      if (g === null) {
        if (!(pin in optional)) reasons.push({ kind: "floating_input", element: x.e.id, pin, nets: [], message: `${x.e.id}.${pin} is not connected` });
      } else if (!drivers.has(g) && !opaque.has(g)) {
        const nets = netsOf(g).sort();
        reasons.push({ kind: "floating_input", element: x.e.id, pin, nets, message: `${x.e.id}.${pin} is on net ${nets.join(", ")}, which nothing drives` });
      }
    }
  }

  for (const p of k.ports) {
    if (p.dir !== "out") continue;
    const g = groupOfRef(p.id);
    if (g === null || (!drivers.has(g) && !opaque.has(g))) {
      reasons.push({ kind: "undriven_output", port: p.id, message: `output ${p.id} is not driven by anything` });
    }
  }

  return { combinational: reasons.length === 0, reasons };
}

/** Variable names for the input ports: their ids if all are variable names, else A, B, C, ... */
function variableNames(inputs, outputs) {
  if (inputs.every(isVariableName)) return inputs;
  const taken = new Set(outputs);
  const names = [];
  for (let round = 0; names.length < inputs.length; round++) {
    for (let c = 0; c < 26 && names.length < inputs.length; c++) {
      const name = String.fromCharCode(65 + c) + (round ? String(round) : "");
      if (!taken.has(name)) names.push(name);
    }
  }
  return names;
}

/** The input ports each output can see, through combinational and sequential elements alike. */
function coneOf(port, k, inputSet) {
  const byOutputGroup = new Map();
  for (const x of k.elements) for (const g of Object.values(x.outputs)) if (g !== null) {
    if (!byOutputGroup.has(g)) byOutputGroup.set(g, []);
    byOutputGroup.get(g).push(x);
  }
  const groupOfInput = new Map([...inputSet].map((id) => [k.groupOfRef(id), id]).filter(([g]) => g !== null));
  const seen = new Set();
  const found = new Set();
  const todo = [k.groupOfRef(port)];
  while (todo.length) {
    const g = todo.pop();
    if (g === null || seen.has(g)) continue;
    seen.add(g);
    if (groupOfInput.has(g)) found.add(groupOfInput.get(g));
    for (const x of byOutputGroup.get(g) ?? []) for (const ig of Object.values(x.inputs)) todo.push(ig);
  }
  return found;
}

/**
 * The verdict and, when it can be made, the truth table of every output bit.
 * Returns { verdict, functions, names }:
 *   verdict    { combinational, reasons } (the structural reasons, plus
 *              unknown_output, disagreement and too_many_inputs);
 *   functions  `function/0.1` objects in output order, or null when the
 *              circuit has a sequential, tri-state or unsimulated element;
 *   names      variable or output port id -> the name to show ("A[3]", "Cin").
 * options.simulate replaces the simulator (tests only).
 */
export function circuitToFunctions(circuit, options = {}) {
  const sim = options.simulate ?? realSimulate;
  const k = connectivity(circuit);
  const verdict = structure(circuit, k);
  const reasons = verdict.reasons;
  const structural = reasons.length === 0;

  const inputs = ordered(circuit, "in");
  const outputs = ordered(circuit, "out");
  const vars = variableNames(inputs.ids, outputs.ids);
  const varOf = Object.fromEntries(inputs.ids.map((id, i) => [id, vars[i]]));
  const names = {};
  inputs.ids.forEach((id, i) => { names[vars[i]] = inputs.display[id]; });
  for (const id of outputs.ids) names[id] = outputs.display[id];
  const renamed = inputs.ids.some((id) => varOf[id] !== id);

  if (reasons.some((r) => NO_TABLE.has(r.kind))) return { verdict, functions: null, names };

  // Jobs: one table over all the inputs, or (above the cap) one per output cone.
  const jobs = [];
  if (inputs.ids.length <= MAX_INPUTS) jobs.push({ inputs: inputs.ids, outputs: outputs.ids });
  else {
    const inputSet = new Set(inputs.ids);
    const byKey = new Map();
    for (const out of outputs.ids) {
      const cone = coneOf(out, k, inputSet);
      const used = inputs.ids.filter((id) => cone.has(id));
      if (used.length > MAX_INPUTS) {
        reasons.push({ kind: "too_many_inputs", port: out, inputs: used.length,
          message: `output ${out} depends on ${used.length} inputs; a table holds at most ${MAX_INPUTS}` });
        continue;
      }
      const key = used.join(" ");
      if (!byKey.has(key)) { byKey.set(key, { inputs: used, outputs: [] }); jobs.push(byKey.get(key)); }
      byKey.get(key).outputs.push(out);
    }
  }

  const tables = new Map();
  for (const job of jobs) {
    const n = job.inputs.length;
    const rows = 1 << n;
    const steps = [];
    for (let r = 0; r < rows; r++) {
      const values = {};
      for (const id of inputs.ids) values[id] = "0"; // inputs outside this cone are held at 0
      job.inputs.forEach((id, i) => { values[id] = String((r >> (n - 1 - i)) & 1); });
      steps.push({ duration: 1, values });
    }
    const scenario = { schema: "scenario/0.1", id: "every_row", circuit: circuit.id, inputs: inputs.ids, steps };
    const trace = sim(circuit, scenario);
    for (const out of job.outputs) {
      const net = k.netOfRef.get(out);
      const unknown = [];
      let table = "";
      trace.steps.forEach((s, r) => {
        const v = net === undefined ? "Z" : s.values[net];
        if (v === "0" || v === "1") table += v;
        else { table += "-"; unknown.push(r); }
      });
      if (unknown.length) {
        reasons.push({ kind: "unknown_output", port: out, rows: unknown,
          message: `output ${out} is X or Z on ${unknown.length} of ${rows} rows; those rows are don't cares` });
      }
      tables.set(out, { inputs: job.inputs, table });
    }
  }
  if (structural && reasons.some((r) => r.kind === "unknown_output")) {
    reasons.unshift({ kind: "disagreement",
      message: "the structure looks combinational but the simulation does not settle to 0 or 1 on every row" });
  }

  const functions = outputs.ids.filter((o) => tables.has(o)).map((out) => {
    const { inputs: used, table } = tables.get(out);
    const variables = used.map((id) => varOf[id]);
    const legend = renamed ? ` (${used.map((id) => `${varOf[id]} = ${inputs.display[id]}`).join(", ")})` : "";
    return fromTable({ id: `${circuit.id}_${out}`, title: `${circuit.id}, output ${outputs.display[out]}${legend}`, variables, table, output: out });
  });
  verdict.combinational = reasons.every((r) => r.kind === "too_many_inputs");
  return { verdict, functions, names };
}
