// L5.2: the analyser's core. No DOM. Turns what was typed (a circuit, or Boolean expressions) into a verdict and
// truth tables, using the pinned circuit-model library (tools/logic/analyze/model, tag in model/MANIFEST.json):
// analyze/ (C17: verdict and one function per output bit) and logic/ (expressions, tables, minimal forms).
// This file only reshapes their output for display; it computes no logic of its own.

import { circuitToFunctions, MAX_INPUTS } from "../model/analyze/index.mjs";
import { parse, variablesOf, truthTable, fromTable } from "../model/logic/index.mjs";
import { compareNames } from "../model/logic/expr.mjs";

/** Most inputs a table holds. The pinned model's limit (the `function` format allows 8 variables); circuit-model raises it, not this tool. */
export const CAP = MAX_INPUTS;

/** What the text is: a circuit (JSON) or lines of `output = expression`. */
export const detect = (text) => (/^\s*[{[]/.test(text) ? "circuit" : "expressions");

const OUTPUT_NAME = /^[A-Za-z][A-Za-z0-9]*(\[\d+\])?$/;

/** One table per group of functions that share their variables. Rows list each input bit and each output value. */
function groupsOf(functions, names) {
  const groups = new Map();
  for (const fn of functions) {
    const key = fn.variables.join(" ");
    if (!groups.has(key)) groups.set(key, { inputs: fn.variables.map((v) => ({ id: v, shown: names?.[v] ?? v })), outputs: [], fns: [] });
    const g = groups.get(key);
    g.outputs.push({ id: fn.output ?? fn.id, shown: names?.[fn.output] ?? fn.output ?? fn.id });
    g.fns.push(fn);
  }
  return [...groups.values()].map((g) => {
    const n = g.inputs.length, rows = [];
    for (let r = 0; r < 1 << n; r++) {
      rows.push({ index: r, inputs: g.inputs.map((_, i) => (r >> (n - 1 - i)) & 1), outputs: g.fns.map((fn) => fn.table[r]) });
    }
    const dontCares = g.fns.reduce((sum, fn) => sum + [...fn.table].filter((c) => c === "-").length, 0);
    return { inputs: g.inputs, outputs: g.outputs, rows, dontCares, functions: g.fns };
  });
}

const reasonsText = (reasons) => reasons.map((r) => ({ kind: r.kind, message: r.message }));

function fromCircuit(text, cap) {
  let circuit;
  try { circuit = JSON.parse(text); } catch (e) { return { mode: "circuit", error: `This is not valid JSON: ${e.message}` }; }
  if (!circuit || typeof circuit !== "object" || !Array.isArray(circuit.elements)) return { mode: "circuit", error: "This is JSON, but not a circuit (it needs an \"elements\" list)." };
  let r;
  try { r = circuitToFunctions(circuit); } catch (e) { return { mode: "circuit", error: `The circuit could not be analysed: ${e.message}` }; }
  const reasons = reasonsText(r.verdict.reasons);
  const undecided = reasons.some((x) => x.kind === "not_simulated");
  const sequential = reasons.some((x) => x.kind === "sequential");
  const groups = r.functions ? groupsOf(r.functions, r.names) : [];
  return {
    mode: "circuit", title: circuit.title ?? circuit.id ?? "", cap,
    verdict: { combinational: r.verdict.combinational, undecided, sequential, reasons },
    groups, functions: r.functions ?? [], names: r.names,
  };
}

function fromExpressions(text, cap) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s*(\/\/|#).*$/, "").trim()).filter(Boolean);
  if (!lines.length) return { mode: "expressions", empty: true };
  const parsed = [];
  for (const [i, line] of lines.entries()) {
    const m = /^([^=]+?)\s*=\s*(.+)$/.exec(line);
    if (!m) return { mode: "expressions", error: `Line ${i + 1}: write each line as  name = expression  (for example  Y = A'B + C).` };
    const name = m[1].trim();
    if (!OUTPUT_NAME.test(name)) return { mode: "expressions", error: `Line ${i + 1}: "${name}" is not an output name (letters and digits, optionally with [n]).` };
    try { parsed.push({ name, text: m[2], expr: parse(m[2]) }); } catch (e) { return { mode: "expressions", error: `Line ${i + 1}: ${e.message}` }; }
  }
  const variables = [...new Set(parsed.flatMap((p) => variablesOf(p.expr)))].sort(compareNames);
  if (variables.length > cap) return { mode: "expressions", error: `These expressions use ${variables.length} inputs; this tool takes at most ${cap}.` };
  const functions = parsed.map((p) => fromTable({ id: p.name, output: p.name, variables, table: truthTable(p.expr, variables), expression: p.text }));
  return {
    mode: "expressions", title: "", cap,
    verdict: { combinational: true, undecided: false, sequential: false, reasons: [], from: "expressions" },
    groups: groupsOf(functions, null), functions, names: {},
  };
}

/** Analyse what was typed. Always returns an object; `error` is a message for the person typing, never a throw. */
export function analyseText(text, { cap = CAP } = {}) {
  if (!String(text).trim()) return { mode: detect(text), empty: true };
  return detect(text) === "circuit" ? fromCircuit(text, cap) : fromExpressions(text, cap);
}
