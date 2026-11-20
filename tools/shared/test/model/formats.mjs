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

import { validate } from "./jsonschema.mjs";

function structural(schema, data) {
  return validate(schema, data).map((e) => `${e.path || "(top level)"} ${e.message}`);
}

/**
 * Check a circuit. Beyond the schema: in circuit/0.3, a wire's `route` has one
 * entry per leg (from the start through every waypoint to the end).
 */
export function checkCircuit(circuitSchema, circuit) {
  const problems = structural(circuitSchema, circuit);
  if (problems.length) return problems;
  (circuit.wires ?? []).forEach((w, i) => {
    const legs = (w.via ?? []).length + 1;
    if (w.route !== undefined && w.route.length !== legs) {
      problems.push(`/wires/${i}/route has ${w.route.length} entries but the wire has ${legs} leg(s)`);
    }
  });
  return problems;
}

/**
 * Check a scenario. `circuit` is optional: when given, the scenario is also
 * checked against it (its id, and that the named inputs are its input ports).
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
  }
  return problems;
}
