// L5.6: check my answer. The person types what the circuit should do, as expressions (`Y = A'B + C`) or as a compact
// table (`Y(A,B,C) = 01101001`, first variable the most significant bit, - for a don't care); the first rows where the
// analysed circuit differs are listed. A circuit is compared with circuit-model's compareCircuit (C17.5); typed
// expressions with logic/compare.mjs. A don't care on either side matches anything. No DOM.

import { compareCircuit } from "../model/analyze/index.mjs";
import { compareFunctions } from "../model/logic/compare.mjs";
import { parse, variablesOf, truthTable } from "../model/logic/index.mjs";

const NAME = /^[A-Za-z][A-Za-z0-9]*(\[\d+\])?$/;

/** Read the expected answer: [{ output, variables, table }] or { error }. `output` is null for a bare expression. */
export function parseExpected(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.replace(/\s*(\/\/|#).*$/, "").trim()).filter(Boolean);
  if (!lines.length) return { empty: true };
  const expected = [];
  for (const [i, line] of lines.entries()) {
    const at = `Line ${i + 1}: `;
    const compact = /^([A-Za-z][A-Za-z0-9]*(?:\[\d+\])?)\s*\(([^)]*)\)\s*=\s*([01\-\s_]+)$/.exec(line);
    if (compact) {
      const variables = compact[2].split(/[\s,]+/).filter(Boolean), table = compact[3].replace(/[\s_]/g, "");
      if (!variables.length || !variables.every((v) => NAME.test(v))) return { error: `${at}list the inputs in brackets, for example Y(A,B) = 0110.` };
      if (variables.length > 8) return { error: `${at}at most 8 inputs.` };
      if (table.length !== 1 << variables.length) return { error: `${at}${variables.length} inputs need ${1 << variables.length} table digits; there are ${table.length}.` };
      expected.push({ output: compact[1], variables, table });
      continue;
    }
    const m = /^([A-Za-z][A-Za-z0-9]*(?:\[\d+\])?)\s*=\s*(.+)$/.exec(line);
    const body = m ? m[2] : line;
    try {
      const e = parse(body), variables = variablesOf(e);
      if (variables.length > 8) return { error: `${at}at most 8 inputs.` };
      expected.push({ output: m ? m[1] : null, variables, table: truthTable(e, variables) });
    } catch (err) { return { error: `${at}${err.message}` }; }
  }
  return { expected };
}

const MAX_SHOWN = 8;

/** Compare each expected output with the analysed result `r`. Returns [{ output, equal, rows, total, problem }]. */
export function checkAnswer(r, expectedText) {
  const parsed = parseExpected(expectedText);
  if (parsed.empty || parsed.error) return parsed;
  if (!r || r.error || r.empty) return { error: "Enter a circuit or expressions above first." };
  if (!r.verdict?.combinational && !r.groups?.length) return { error: "There is no table to compare: the circuit above is not combinational." };
  const mine = r.groups.flatMap((g) => g.functions);
  const results = parsed.expected.map((x) => {
    const name = x.output;
    const fn = { id: name ?? "F", output: name ?? undefined, variables: x.variables, table: x.table };
    let res;
    try {
      if (r.mode === "circuit" && r.circuit) res = compareCircuit(r.circuit, { ...fn, output: name ?? undefined });
      else {
        const m = mine.find((f) => f.output === name || r.names?.[f.output] === name) ?? (name === null && mine.length === 1 ? mine[0] : null);
        res = m ? compareFunctions(m, fn) : { equal: false, rows: null };
      }
    } catch (e) { return { output: name, problem: e.message }; }
    if (!res.rows) return { output: name, problem: name === null ? "Name the output (for example Y = ...), because the circuit has more than one." : `The circuit has no output called ${name}, or no table for it.` };
    return { output: name, equal: res.equal, total: res.rows.length, rows: res.rows.slice(0, MAX_SHOWN).map((row) => ({ values: row.values, yours: row.a, expected: row.b })) };
  });
  return { results };
}
