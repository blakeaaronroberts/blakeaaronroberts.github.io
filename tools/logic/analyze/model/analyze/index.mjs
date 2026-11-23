// analyze/: questions about a whole circuit, answered from its structure and
// the simulator. Depends on sim/ and logic/; nothing in either depends on it.

import { circuitToFunctions } from "./combinational.mjs";
import { compareFunctions } from "../logic/compare.mjs";

export { analyze, circuitToFunctions, MAX_INPUTS, STORAGE_TYPES, TRISTATE_TYPES } from "./combinational.mjs";

/**
 * Compare a circuit with an expected function (a student's circuit against the
 * table it should have). The function's output (default F) picks the circuit
 * output by port id or shown name; a circuit with one output needs no match.
 * Its variables are matched to the circuit's by variable name or shown name.
 * Returns { equal, rows, verdict }; rows is null when the circuit has no table
 * for that output (it is not combinational, or the output is not found).
 */
export function compareCircuit(circuit, fn) {
  const { verdict, functions, names } = circuitToFunctions(circuit);
  if (!functions) return { equal: false, rows: null, verdict };
  const wanted = fn.output ?? "F";
  const mine = functions.find((f) => f.output === wanted || names[f.output] === wanted)
    ?? (functions.length === 1 && (circuit.ports ?? []).filter((p) => p.dir === "out").length === 1 ? functions[0] : null);
  if (!mine) return { equal: false, rows: null, verdict };
  const byShown = new Map(mine.variables.map((v) => [names[v], v]));
  const variables = fn.variables.map((v) => (mine.variables.includes(v) ? v : byShown.get(v) ?? v));
  const result = compareFunctions(mine, { variables, table: fn.table });
  // Report the rows in the expected function's terms: a = the circuit, b = expected.
  return { ...result, verdict };
}
