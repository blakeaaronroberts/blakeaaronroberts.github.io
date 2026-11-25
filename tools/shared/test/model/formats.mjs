// Validators for the circuit, scenario and trace formats. Plain JavaScript, no
// dependencies, usable in the browser (no file access here) and under Node or Deno.
//
// Each validator has two layers:
//   1. structure: the JSON Schema in schema/ (via jsonschema.mjs);
//   2. meaning: checks a schema cannot express (ports exist, steps are
//      contiguous, the list of changes replays to the step values).
// Python does the same in validate/formats.py; both read the same files and
// tests/run_fixtures.* runs both over the same fixtures.
//
// Every function returns a list of problem strings. An empty list means valid.
// The strings carry raw input (names and values from the file): escape them
// before putting them into HTML, or show them with textContent.

import { validate } from "./jsonschema.mjs";

/**
 * Element types that store state, the only ones a scenario's `initial` may
 * name. Must equal the simulator's sequential models (tests/sim.test.mjs checks).
 */
export const STATEFUL_TYPES = ["sr_latch", "d_latch", "d_flipflop", "d_flipflop_sr", "jk_flipflop", "t_flipflop"];

function structural(schema, data) {
  return validate(schema, data).map((e) => `${e.path || "(top level)"} ${e.message}`);
}

/** The pin names of a block, from every side. */
const blockPins = (e) => Object.values(e.params?.pins ?? {}).flat().map((p) => (typeof p === "string" ? p : p.name));

/**
 * Check a circuit. Beyond the schema: in circuit/0.3 and later, a wire's
 * `route` has one entry per leg (from the start through every waypoint to the
 * end). In circuit/0.4, a block with params.module names an entry of `modules`
 * and has exactly its ports as pins, and no module contains itself; `modules`
 * and params.module need circuit/0.4.
 */
export function checkCircuit(circuitSchema, circuit) {
  const problems = structural(circuitSchema, circuit);
  if (problems.length) return problems;
  const v04 = circuit.schema === "circuit/0.4";
  const modules = circuit.modules ?? {};
  if (!v04 && circuit.modules !== undefined) problems.push(`/modules needs circuit/0.4, not ${circuit.schema}`);
  const bodies = [["", circuit], ...Object.entries(modules).map(([name, m]) => [`/modules/${name}`, m])];
  const uses = new Map(Object.keys(modules).map((name) => [name, new Set()]));
  for (const [at, body] of bodies) {
    (body.wires ?? []).forEach((w, i) => {
      const legs = (w.via ?? []).length + 1;
      if (w.route !== undefined && w.route.length !== legs) {
        problems.push(`${at}/wires/${i}/route has ${w.route.length} entries but the wire has ${legs} leg(s)`);
      }
    });
    (body.elements ?? []).forEach((e, i) => {
      const name = e.type === "block" ? e.params?.module : undefined;
      if (name === undefined) return;
      if (!v04) { problems.push(`${at}/elements/${i}/params/module needs circuit/0.4, not ${circuit.schema}`); return; }
      const m = modules[name];
      if (!m) { problems.push(`${at}/elements/${i}/params/module "${name}" is not in modules`); return; }
      if (at) uses.get(at.slice("/modules/".length)).add(name);
      const pins = blockPins(e);
      const ports = (m.ports ?? []).map((p) => p.id);
      const missing = ports.filter((p) => !pins.includes(p));
      const extra = pins.filter((p) => !ports.includes(p));
      if (missing.length) problems.push(`${at}/elements/${i} (${e.id}) has no pin for port ${missing.join(", ")} of module "${name}"`);
      if (extra.length) problems.push(`${at}/elements/${i} (${e.id}) has pin ${extra.join(", ")}, which module "${name}" does not have`);
    });
  }
  for (const name of uses.keys()) {
    const seen = new Set();
    const todo = [...uses.get(name)];
    while (todo.length) {
      const n = todo.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      todo.push(...(uses.get(n) ?? []));
    }
    if (seen.has(name)) problems.push(`/modules/${name} contains an instance of itself (directly or through other modules)`);
  }
  return problems;
}

/** net id -> the group it belongs to: nets joined by closed switches share one, as in the simulator. */
function switchGroups(circuit) {
  const parent = new Map(Object.keys(circuit.nets ?? {}).map((n) => [n, n]));
  const netOfRef = new Map();
  for (const n of parent.keys()) for (const ref of circuit.nets[n]) netOfRef.set(ref, n);
  const find = (n) => {
    let root = n;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(n) !== root) { const next = parent.get(n); parent.set(n, root); n = next; }
    return root;
  };
  for (const e of circuit.elements ?? []) {
    if (e.type !== "switch" || e.params?.closed !== true) continue;
    const [a, b] = [netOfRef.get(`${e.id}.1`), netOfRef.get(`${e.id}.2`)];
    if (a && b) parent.set(find(a), find(b));
  }
  return (net) => (parent.has(net) ? find(net) : net);
}

/**
 * Check a scenario. `circuit` is optional: when given, the scenario is also
 * checked against it (its id, that the named inputs are its input ports, and
 * that forces do not overlap on nets joined by a closed switch). Nets joined
 * only inside an instance (circuit/0.4) are seen when simulate() flattens it.
 */
export function checkScenario(scenarioSchema, scenario, circuit = null) {
  const problems = structural(scenarioSchema, scenario);
  if (problems.length > 0) return problems; // the checks below assume the shape

  const inputs = new Set(scenario.inputs);
  scenario.steps.forEach((step, i) => {
    for (const name of Object.keys(step.values)) {
      if (!inputs.has(name)) problems.push(`/steps/${i}/values sets "${name}", which is not listed in inputs`);
    }
  });
  for (const name of scenario.inputs) {
    if (!(name in scenario.steps[0].values)) {
      problems.push(`/steps/0/values must set every input, but "${name}" is missing`);
    }
  }
  const lastStep = scenario.steps.length - 1;
  (scenario.force ?? []).forEach((f, i) => {
    if (f.from > lastStep) problems.push(`/force/${i}/from is step ${f.from}, but the last step is ${lastStep}`);
    if (f.to !== undefined && f.to > lastStep) problems.push(`/force/${i}/to is step ${f.to}, but the last step is ${lastStep}`);
    if (f.to !== undefined && f.to < f.from) problems.push(`/force/${i}/to (${f.to}) is before from (${f.from})`);
  });
  const force = scenario.force ?? [];
  const groupOf = circuit && force.length ? switchGroups(circuit) : (net) => net;
  force.forEach((a, i) => force.slice(i + 1).forEach((b, k) => {
    const [aTo, bTo] = [a.to ?? lastStep, b.to ?? lastStep];
    if (groupOf(a.net) === groupOf(b.net) && a.from <= bTo && b.from <= aTo) {
      problems.push(`/force/${i} and /force/${i + k + 1} overlap on net "${a.net}"${a.net === b.net ? "" : `, which a closed switch joins to "${b.net}"`}`);
    }
  }));

  if (circuit) {
    if (scenario.circuit_id !== undefined && scenario.circuit_id !== circuit.id) {
      problems.push(`/circuit_id is "${scenario.circuit_id}" but the circuit's id is "${circuit.id}"`);
    }
    const ports = new Map((circuit.ports ?? []).map((p) => [p.id, p]));
    for (const name of scenario.inputs) {
      const port = ports.get(name);
      if (!port) problems.push(`/inputs "${name}" is not a port of the circuit`);
      else if (port.dir !== "in") problems.push(`/inputs "${name}" is an output port, not an input`);
    }
    const elements = new Map((circuit.elements ?? []).map((e) => [e.id, e]));
    for (const id of Object.keys(scenario.initial ?? {})) {
      const e = elements.get(id);
      if (!e) problems.push(`/initial "${id}" is not an element of the circuit`);
      else if (!STATEFUL_TYPES.includes(e.type)) problems.push(`/initial "${id}" is a ${e.type}, which has no stored state`);
    }
    (scenario.force ?? []).forEach((f, i) => {
      if (!Object.hasOwn(circuit.nets ?? {}, f.net)) problems.push(`/force/${i}/net "${f.net}" is not a net of the circuit`);
    });
  }
  return problems;
}

/**
 * Check a trace. `scenario` is optional: when given, the trace must match its
 * steps (same count, same durations, same labels).
 */
export function checkTrace(traceSchema, trace, scenario = null) {
  const problems = structural(traceSchema, trace);
  if (problems.length > 0) return problems;

  const signals = new Set(trace.signals);

  // Steps are contiguous from time 0 and cover every signal.
  let expectedStart = 0;
  trace.steps.forEach((step, i) => {
    const at = `/steps/${i}`;
    if (step.index !== i) problems.push(`${at}/index is ${step.index}, expected ${i}`);
    if (step.start !== expectedStart) problems.push(`${at}/start is ${step.start}, expected ${expectedStart}`);
    if (step.end <= step.start) problems.push(`${at}/end must be after start`);
    expectedStart = step.end;
    for (const s of trace.signals) {
      if (!(s in step.values)) problems.push(`${at}/values is missing signal "${s}"`);
    }
    for (const s of Object.keys(step.values)) {
      if (!signals.has(s)) problems.push(`${at}/values has "${s}", which is not in signals`);
    }
  });
  const last = trace.steps[trace.steps.length - 1];
  if (trace.end !== last.end) problems.push(`/end is ${trace.end} but the last step ends at ${last.end}`);

  // Changes are sorted, name real signals, and really change the level.
  const state = Object.fromEntries(trace.signals.map((s) => [s, "X"]));
  let previousTime = 0;
  trace.changes.forEach((c, i) => {
    const at = `/changes/${i}`;
    if (c.t < previousTime) problems.push(`${at}/t is ${c.t}, earlier than the change before it`);
    previousTime = Math.max(previousTime, c.t);
    if (c.t >= trace.end) problems.push(`${at}/t is ${c.t}, not before the end (${trace.end})`);
    if (!signals.has(c.signal)) problems.push(`${at}/signal "${c.signal}" is not in signals`);
  });

  // Replaying the changes must give each step's recorded values.
  if (problems.length === 0) {
    let next = 0;
    for (const step of trace.steps) {
      while (next < trace.changes.length && trace.changes[next].t < step.end) {
        const c = trace.changes[next++];
        if (state[c.signal] === c.value) {
          problems.push(`/changes ${c.signal} is set to "${c.value}" at ${c.t} but already has that level`);
        }
        state[c.signal] = c.value;
      }
      for (const s of trace.signals) {
        if (state[s] !== step.values[s]) {
          problems.push(`/steps/${step.index}/values "${s}" is "${step.values[s]}" but changes replay to "${state[s]}"`);
        }
      }
    }
  }

  (trace.forced ?? []).forEach((f, i) => {
    if (!signals.has(f.net)) problems.push(`/forced/${i}/net "${f.net}" is not in signals`);
    if (f.to < f.from) problems.push(`/forced/${i}/to (${f.to}) is before from (${f.from})`);
    if (f.to >= trace.steps.length) problems.push(`/forced/${i}/to is step ${f.to}, which does not exist`);
  });

  if (trace.state) {
    const st = trace.state;
    for (const b of st.bits) if (!signals.has(b)) problems.push(`/state/bits "${b}" is not in signals`);
    for (const [name, code] of Object.entries(st.codes)) {
      if (code.length !== st.bits.length) problems.push(`/state/codes "${name}" has ${code.length} bits but there are ${st.bits.length} state bits`);
    }
    if (st.names.length !== trace.steps.length) problems.push(`/state/names has ${st.names.length} entries but there are ${trace.steps.length} steps`);
    else if (problems.length === 0) {
      const stateOf = new Map(Object.entries(st.codes).map(([n, c]) => [c, n]));
      trace.steps.forEach((step, i) => {
        const code = st.bits.map((b) => step.values[b]).join("");
        const want = stateOf.get(code) ?? null;
        if (st.names[i] !== want) problems.push(`/state/names/${i} is ${JSON.stringify(st.names[i])} but the bits hold ${code} (${JSON.stringify(want)})`);
      });
    }
  }

  for (const [i, w] of (trace.warnings ?? []).entries()) {
    if (w.step >= trace.steps.length) problems.push(`/warnings/${i}/step ${w.step} does not exist`);
    for (const s of w.signals) {
      if (!signals.has(s)) problems.push(`/warnings/${i}/signals "${s}" is not in signals`);
    }
  }

  if (scenario) {
    if (trace.scenario !== scenario.id) problems.push(`/scenario is "${trace.scenario}" but the scenario's id is "${scenario.id}"`);
    if (trace.steps.length !== scenario.steps.length) {
      problems.push(`has ${trace.steps.length} steps but the scenario has ${scenario.steps.length}`);
    } else {
      scenario.steps.forEach((s, i) => {
        const t = trace.steps[i];
        if (t.end - t.start !== s.duration) {
          problems.push(`/steps/${i} lasts ${t.end - t.start} but the scenario step lasts ${s.duration}`);
        }
        if (t.label !== s.label) problems.push(`/steps/${i}/label differs from the scenario step's label`);
      });
    }
    // forced must list the scenario's force entries, in order, with `to` resolved.
    const last = scenario.steps.length - 1;
    const want = (scenario.force ?? []).map((f) => `${f.net} ${f.from} ${f.to ?? last}`);
    const got = (trace.forced ?? []).map((f) => `${f.net} ${f.from} ${f.to}`);
    if (want.join("|") !== got.join("|")) problems.push(`/forced is [${got.join(", ")}] but the scenario forces [${want.join(", ")}]`);
  }
  return problems;
}
