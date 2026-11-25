// L1.1: truth table generator, core. No DOM. Two ways in: expressions (one `name = expression` per line) or rows entered by hand.
// All logic comes from the pinned library in ../../analyze/model/ (no second pin, no new minimiser); this file reshapes it.
//
// State: { variables: ["A","B"], outputs: [{ name: "F", table: "0110", expression?: "A ^ B" }] }
// `table` has one character per row, "0", "1" or "-" (don't care); row r gives variables[0] the most significant bit.

import { parse, variablesOf, truthTable, fromTable, checkFunction, sigma, pi } from "../../analyze/model/logic/index.mjs";
import { compareNames, isVariableName } from "../../analyze/model/logic/expr.mjs";
import { MAX_INPUTS } from "../../analyze/model/analyze/index.mjs";
import { texName } from "../../analyze/src/forms.js";

/** Most inputs a table holds: the pinned model's limit. circuit-model raises it, not this tool. */
export const CAP = MAX_INPUTS;

const OUTPUT_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const rowsOf = (n) => 1 << n;

/** "A, B C" or "A B C" to ["A","B","C"]. Returns { variables } or { error }. */
export function parseVariableList(text) {
  const names = String(text).split(/[\s,;]+/).filter(Boolean);
  if (!names.length) return { error: "Name at least one input, for example  A B C." };
  for (const n of names) if (!isVariableName(n)) return { error: `"${n}" is not an input name: use a letter, then digits if you like (A, B, X1).` };
  if (new Set(names).size !== names.length) return { error: "Two inputs have the same name." };
  if (names.length > CAP) return { error: `${names.length} inputs is too many: this tool takes at most ${CAP}.` };
  return { variables: names };
}

/**
 * Expressions, one per line as  name = expression . A bare expression is named F (F1, F2 ... when there are several).
 * `variables` (optional) fixes the input order and lets an input appear that no expression uses.
 */
export function fromExpressions(text, { variables } = {}) {
  const lines = String(text).split(/\r?\n/).map((l) => l.replace(/\s*(\/\/|#).*$/, "").trim()).filter(Boolean);
  if (!lines.length) return { empty: true };
  const parsed = [];
  for (const [i, line] of lines.entries()) {
    const m = /^([^=]+?)\s*=\s*(.+)$/.exec(line);
    const name = m ? m[1].trim() : null;
    const body = m ? m[2] : line;
    if (m && !OUTPUT_NAME.test(name)) return { error: `Line ${i + 1}: "${name}" is not an output name (letters, digits and _).` };
    try { parsed.push({ name, text: body, expr: parse(body) }); } catch (e) { return { error: `Line ${i + 1}: ${e.message}` }; }
  }
  let vars = [...new Set(parsed.flatMap((p) => variablesOf(p.expr)))].sort(compareNames);
  if (variables) {
    const missing = vars.filter((v) => !variables.includes(v));
    if (missing.length) return { error: `The expressions use ${missing.join(", ")}, which is not in the input list.` };
    vars = variables;
  }
  if (vars.length === 0) vars = ["A"];   // constants only: a one-input table, so there is a row to show
  if (vars.length > CAP) return { error: `These expressions use ${vars.length} inputs; this tool takes at most ${CAP}.` };
  const bare = parsed.filter((p) => !p.name).length;
  let k = 0;
  const outputs = parsed.map((p) => ({ name: p.name ?? (bare === 1 ? "F" : `F${++k}`), table: truthTable(p.expr, vars), expression: p.text }));
  const names = outputs.map((o) => o.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return { error: `Two lines are named ${dup}.` };
  return { state: { variables: vars, outputs } };
}

/** A blank table (every row 0) for hand entry. */
export function blank(variables, outputNames = ["F"]) {
  return { variables, outputs: outputNames.map((name) => ({ name, table: "0".repeat(rowsOf(variables.length)) })) };
}

/** Next value of a cell when clicked: 0, then 1, then a don't care, then 0 again. */
export const nextCell = (ch) => (ch === "0" ? "1" : ch === "1" ? "-" : "0");

/** The state with one cell changed. The expression the column came from no longer describes it, so it is dropped. */
export function setCell(state, output, row, ch) {
  const outputs = state.outputs.map((o, i) => (i === output ? { name: o.name, table: o.table.slice(0, row) + ch + o.table.slice(row + 1) } : o));
  return { ...state, outputs };
}

/** Change the inputs. The same count keeps every column (the inputs are only renamed); another count starts the columns over at 0. */
export function setVariables(state, variables) {
  if (variables.length === state.variables.length) return { ...state, variables };
  return blank(variables, state.outputs.map((o) => o.name));
}

/** Rename the outputs (a list of names, one per column; blank names get F, F1 ...). Returns { state } or { error }. */
export function setOutputNames(state, names) {
  if (names.length !== state.outputs.length) return { error: "Internal: wrong number of names." };
  for (const n of names) if (!OUTPUT_NAME.test(n)) return { error: `"${n}" is not an output name (letters, digits and _).` };
  if (new Set(names).size !== names.length) return { error: "Two outputs have the same name." };
  return { state: { ...state, outputs: state.outputs.map((o, i) => ({ ...o, name: names[i] })) } };
}

export function addOutput(state, name) {
  const used = new Set(state.outputs.map((o) => o.name));
  let n = state.outputs.length, pick = name;
  while (!pick || used.has(pick)) pick = `F${n++}`;
  return { ...state, outputs: [...state.outputs, { name: pick, table: "0".repeat(rowsOf(state.variables.length)) }] };
}
export const removeOutput = (state, i) => (state.outputs.length < 2 ? state : { ...state, outputs: state.outputs.filter((_, k) => k !== i) });

/** The rows of the table as the page and export.js use them. */
export function groupOf(state) {
  const n = state.variables.length, rows = [];
  for (let r = 0; r < rowsOf(n); r++) rows.push({ index: r, inputs: state.variables.map((_, i) => (r >> (n - 1 - i)) & 1), outputs: state.outputs.map((o) => o.table[r]) });
  return {
    inputs: state.variables.map((v) => ({ id: v, shown: v })),
    outputs: state.outputs.map((o) => ({ id: o.name, shown: o.name })),
    rows, dontCares: state.outputs.reduce((s, o) => s + [...o.table].filter((c) => c === "-").length, 0),
  };
}

/** The minterm and maxterm lists of each output, as text: "Σm(1, 2)", "ΠM(0, 3)". */
export const listsOf = (state) => state.outputs.map((o) => ({ name: o.name, sigma: sigma(o.table), pi: pi(o.table) }));

/** One `function/0.1` per output (the format every logic tool reads). Each is checked against the schema before it is returned. */
export function toFunctions(state, schema) {
  return state.outputs.map((o) => {
    const fn = fromTable({ id: o.name, output: o.name, variables: state.variables, table: o.table, expression: o.expression });
    if (schema) {
      const problems = checkFunction(schema, fn);
      if (problems.length) throw new Error(`${o.name}: ${problems.join("; ")}`);
    }
    return fn;
  });
}

/** Read function files (parsed JSON). All must share their inputs. Returns { state } or { error }. */
export function fromFunctions(list, schema) {
  if (!list.length) return { error: "No function file given." };
  const outputs = [];
  for (const [i, fn] of list.entries()) {
    const label = list.length > 1 ? `File ${i + 1}: ` : "";
    if (!fn || typeof fn !== "object") return { error: `${label}this is not a function file.` };
    const problems = checkFunction(schema, fn);
    if (problems.length) return { error: `${label}${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ""}` };
    if (i > 0 && fn.variables.join(" ") !== list[0].variables.join(" ")) return { error: `${label}the inputs (${fn.variables.join(", ")}) differ from the first file's (${list[0].variables.join(", ")}), so they cannot share one table.` };
    outputs.push({ name: fn.output ?? fn.id, table: fn.table, ...(fn.expression ? { expression: fn.expression } : {}) });
  }
  const names = outputs.map((o) => o.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return { error: `Two files are both named ${dup}.` };
  return { state: { variables: list[0].variables.slice(), outputs } };
}

/** A cell as people see it: a don't care is stored as "-" (the function format) and shown as X. */
export const shownCell = (c) => (c === "-" ? "X" : c);

/** The LaTeX tabular, one column per input and output; a don't care is X. */
export function latexTable(state) {
  const g = groupOf(state);
  const head = [...g.inputs, ...g.outputs].map((c) => `$${texName(c.shown)}$`).join(" & ");
  const rows = g.rows.map((r) => [...r.inputs, ...r.outputs.map(shownCell)].join(" & ") + " \\\\");
  return [`\\begin{tabular}{${"c".repeat(g.inputs.length)}|${"c".repeat(g.outputs.length)}}`, "\\hline", `${head} \\\\`, "\\hline", ...rows, "\\hline", "\\end{tabular}"].join("\n") + "\n";
}

/** CSV; a don't care is X. */
export function csvTable(state) {
  const g = groupOf(state);
  return [[...g.inputs, ...g.outputs].map((c) => c.shown).join(","), ...g.rows.map((r) => [...r.inputs, ...r.outputs.map(shownCell)].join(","))].join("\n") + "\n";
}

/** Markdown table, one column per input and per output. A don't care is shown as X. */
export function markdownTable(state) {
  const g = groupOf(state);
  const heads = [...g.inputs.map((c) => c.shown), ...g.outputs.map((c) => c.shown)];
  const cell = shownCell;
  return [`| ${heads.join(" | ")} |`, `|${heads.map(() => ":-:").join("|")}|`, ...g.rows.map((r) => `| ${[...r.inputs, ...r.outputs.map(cell)].join(" | ")} |`)].join("\n") + "\n";
}
