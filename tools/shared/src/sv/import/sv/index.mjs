// SystemVerilog import: source files in, `circuit` out (C11.1), and a
// testbench in, `circuit`, `scenario` and `trace` out (C11.2).
//
//   const { circuit, problems } = await importSystemVerilog({ "adder.sv": text }, { top: "adder" });
//   const { circuit, scenario, trace, problems, notes } =
//     await importTestbench({ "adder.sv": text, "adder_tb.sv": text }, { top: "adder_tb", circuitPath: "examples/adder.json" });
//
// slang elaborates the design (parameters, generate, hierarchy) and reports
// syntax and elaboration errors; map.mjs maps the result, sending behavioural
// modules through Yosys; stimulus.mjs runs the testbench's stimulus and the
// simulator does the rest. `problems` lists { file, line, column, construct,
// message }; when it is not empty, everything else is null.
//
// `engines` is { runSlang, runYosys? }: Node's (engines.mjs) unless given; in a
// browser pass createBrowserEngines() from engines-browser.mjs. Without
// runYosys, a module with always blocks is reported as a problem.

import { simulate } from "../../sim/simulate.mjs";
import { bodyOfInstance, mapDesign, where } from "./map.mjs";
import { findRaces } from "./races.mjs";
import { runStimulus } from "./stimulus.mjs";

/** Node's engines, loaded only when none are given, so a browser never asks for node: modules. */
const nodeEngines = () => import("./engines.mjs");

async function elaborate(files, top, engines) {
  const s = await engines.runSlang(files, top);
  if (s.ok) return { ast: s.ast, problems: [] };
  const errors = s.diagnostics.filter((d) => d.severity === "error");
  const problems = errors.length
    ? errors.map((d) => ({ file: d.file, line: d.line, column: d.column, construct: "compile error", message: d.message }))
    : [{ file: null, line: null, column: null, construct: "compile error",
      message: (s.output ?? "").split("\n").find((l) => l.startsWith("error:"))?.slice(7) ?? "slang could not elaborate the design" }];
  return { ast: null, problems };
}
const synthesizer = (files, engines) => (engines.runYosys ? (definition, params) => engines.runYosys(files, definition, params) : null);

/**
 * Import a design. `top` is the top module; without it, slang takes the module
 * nothing instantiates, and several of those are a problem that lists them.
 */
export async function importSystemVerilog(files, { top, engines } = {}) {
  engines ??= await nodeEngines();
  const { ast, problems } = await elaborate(files, top, engines);
  if (!ast) return { circuit: null, problems };
  const tops = (ast.design ?? ast).members.filter((m) => m.kind === "Instance");
  if (tops.length > 1) {
    return { circuit: null, problems: [{ ...where(tops[0]), construct: "top", message: `more than one module could be the top; name one of: ${tops.map((m) => m.name).join(", ")}` }] };
  }
  return mapDesign(ast, { synthesize: synthesizer(files, engines), files });
}

/**
 * Import a testbench: `top` is the testbench module, which holds one instance
 * of the circuit and its stimulus. `circuitPath` is written into the scenario
 * (where the circuit file will be); `id` names the scenario (default: `top`).
 * `notes` lists what was skipped or chosen (printing, checks, a clock that
 * starts high), with the same fields as `problems`.
 */
export async function importTestbench(files, { top, circuitPath, id = top, engines }) {
  engines ??= await nodeEngines();
  const none = (problems, notes = []) => ({ circuit: null, scenario: null, trace: null, problems: sorted(problems), notes: sorted(notes) });
  const { ast, problems: errors } = await elaborate(files, top, engines);
  if (!ast) return none(errors);
  const tb = (ast.design ?? ast).members.find((m) => m.kind === "Instance");
  const body = tb && bodyOfInstance(ast, tb);
  if (!body) return none([{ file: null, line: null, column: null, construct: "top", message: "no top module was elaborated" }]);
  const instances = (body.members ?? []).filter((m) => m.kind === "Instance");
  if (instances.length === 0) return none([{ ...where(body), construct: "no circuit", message: `${top} has no instance of the circuit to test` }]);
  if (instances.length > 1) return none([{ ...where(instances[1]), construct: "more than one circuit", message: `${top} has ${instances.length} instances; a testbench tests one circuit` }]);

  const stimulus = runStimulus(body, instances[0], files);
  const mapped = await mapDesign(ast, { synthesize: synthesizer(files, engines), instance: instances[0], files });
  const problems = [...mapped.problems, ...stimulus.problems];
  if (problems.length) return none(problems, stimulus.notes);

  const { circuit } = mapped;
  const order = circuit.ports.filter((p) => p.dir === "in").map((p) => p.id);
  const inOrder = (values) => Object.fromEntries(order.filter((i) => i in values).map((i) => [i, values[i]]));
  const scenario = {
    schema: "scenario/0.1", id, title: `${top} (stimulus from a SystemVerilog testbench)`,
    circuit: circuitPath, circuit_id: circuit.id, inputs: order,
    steps: stimulus.steps.map((s) => ({ duration: s.duration, values: inOrder(s.values) })),
  };
  let trace;
  try {
    trace = simulate(circuit, scenario);
  } catch (err) { // the simulator's limits (steps times nets, inputs)
    return none([{ ...where(body), construct: "too long", message: err.message }], stimulus.notes);
  }

  const { races, notes } = findRaces(circuit, scenario, trace);
  for (const r of races) {
    const at = where(stimulus.sources[r.step][r.data[0]]);
    if (problems.some((p) => p.line === at.line && p.column === at.column)) continue;
    problems.push({ ...at, construct: "race", message: `${r.data.join(", ")} and ${r.clock.join(", ")} change together at time ${r.time}, a clock edge of ${r.element}; SystemVerilog does not fix which comes first, so move one with a # delay` });
  }
  if (problems.length) return none(problems, stimulus.notes);
  for (const n of notes) {
    const source = stimulus.sources[n.step][n.inputs.find((i) => i in stimulus.sources[n.step])];
    const message = n.kind === "start"
      ? `${n.clock} is already 1 at time 0; the start of a run is not a clock edge, so ${n.element} does not load there`
      : `${n.clock} rises from X or Z at time ${n.time}: SystemVerilog counts a rising edge of ${n.element} there, which the simulator does not treat as a certain edge; set the clock to 0 or 1 at time 0`;
    const entry = { ...where(source), construct: n.kind === "start" ? "clock high at the start" : "edge from an unknown clock", message };
    if (!stimulus.notes.some((x) => x.line === entry.line && x.construct === entry.construct)) stimulus.notes.push(entry);
  }
  return { circuit, scenario, trace, problems: [], notes: sorted(stimulus.notes) };
}

const sorted = (list) => [...list].sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0));
