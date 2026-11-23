// L5.4: copy and export text. No DOM. Everything here formats what analyse.js and forms.js already hold.

import { toCircuit } from "../model/logic/index.mjs";
import { texName } from "./forms.js";

const latexIn = (shown) => texName(shown);   // an input as shown (A[3], Cin) in LaTeX
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const cell = (c) => (c === "-" ? "–" : c);

/** Name of an input variable as shown (A3 is shown A[3]). */
const shownOf = (r, v) => r.names?.[v] ?? v;

/** The truth table as a LaTeX tabular, one column per input bit and per output bit. */
export function latexTable(g, r) {
  const head = [...g.inputs.map((c) => `$${latexIn(c.shown)}$`), ...g.outputs.map((c) => `$${texName(c.shown)}$`)].join(" & ");
  const rows = g.rows.map((row) => [...row.inputs, ...row.outputs.map((o) => (o === "-" ? "$-$" : o))].join(" & ") + " \\\\");
  return [`\\begin{tabular}{${"c".repeat(g.inputs.length)}|${"c".repeat(g.outputs.length)}}`, "\\hline", `${head} \\\\`, "\\hline", ...rows, "\\hline", "\\end{tabular}"].join("\n");
}

const row = (name, latex, note) => `${texName(name)} &= ${latex} & \\text{${note}}`;

/** The lines of one output's equations: minterms, maxterms, canonical and minimal SOP and POS. */
function equationLines(f) {
  const cost = (x) => `${plural(x.terms, "term")}, ${plural(x.literals, "literal")}`;
  return [
    row(f.name, f.sigmaLatex, "minterms"),
    row(f.name, f.piLatex, "maxterms"),
    row(f.name, f.canonical.sop.latex, `canonical SOP, ${plural(f.canonical.sop.terms, "term")}`),
    row(f.name, f.canonical.pos.latex, `canonical POS, ${plural(f.canonical.pos.terms, "term")}`),
    ...f.minimal.sop.map((x) => row(f.name, x.latex, `minimal SOP, ${cost(x)}`)),
    ...f.minimal.pos.map((x) => row(f.name, x.latex, `minimal POS, ${cost(x)}`)),
  ];
}

/** One `aligned` block per output (all = false) or one block for every output (all = true). */
export function latexEquations(forms, { all = false } = {}) {
  const ok = forms.filter((f) => !f.error);
  const block = (lines) => ["\\[", "\\begin{aligned}", lines.join(" \\\\\n"), "\\end{aligned}", "\\]"].join("\n");
  if (all) return block(ok.flatMap((f) => equationLines(f)));
  return ok.map((f) => block(equationLines(f))).join("\n\n");
}

export function csv(g) {
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [[...g.inputs.map((c) => c.shown), ...g.outputs.map((c) => c.shown)].map(q).join(","), ...g.rows.map((row) => [...row.inputs, ...row.outputs].join(","))].join("\n") + "\n";
}

const mdEscape = (s) => String(s).replace(/\|/g, "\\|");

export function markdown(r) {
  const out = [`# ${r.title || "Circuit analysis"}`, ""];
  const v = r.verdict;
  out.push(`**Verdict:** ${v.undecided ? "cannot decide" : v.combinational ? "combinational" : "not combinational"}.`, "");
  for (const x of v.reasons) out.push(`- \`${x.kind}\`: ${mdEscape(x.message)}`);
  if (v.reasons.length) out.push("");
  for (const g of r.groups) {
    out.push("## Truth table", "");
    const heads = [...g.inputs.map((c) => c.shown), ...g.outputs.map((c) => c.shown)];
    out.push(`| ${heads.map(mdEscape).join(" | ")} |`, `|${heads.map(() => ":-:").join("|")}|`);
    for (const row of g.rows) out.push(`| ${[...row.inputs, ...row.outputs.map(cell)].join(" | ")} |`);
    out.push("");
    if (g.dontCares) out.push(`Cells shown as – are X or Z in the simulation: don't cares.`, "");
    for (const f of g.forms) {
      if (f.error) { out.push(`## ${f.name}`, "", f.error, ""); continue; }
      out.push(`## ${f.name}`, "", `- Minterms: ${f.sigma}`, `- Maxterms: ${f.pi}`);
      out.push(`- Canonical SOP (${plural(f.canonical.sop.terms, "term")}): \`${f.canonical.sop.text}\``, `- Canonical POS (${plural(f.canonical.pos.terms, "term")}): \`${f.canonical.pos.text}\``);
      for (const x of f.minimal.sop) out.push(`- Minimal SOP (${plural(x.terms, "term")}, ${plural(x.literals, "literal")}): \`${x.text}\``);
      for (const x of f.minimal.pos) out.push(`- Minimal POS (${plural(x.terms, "term")}, ${plural(x.literals, "literal")}): \`${x.text}\``);
      if (f.minimal.sop.length > 1 || f.minimal.pos.length > 1) out.push("- More than one form is equally small; all are listed.");
      out.push(`- Cheapest: ${bestText(f)}`, "");
    }
  }
  return out.join("\n");
}

export function bestText(f) {
  if (!f.best) return "n/a";
  const pick = (covers) => covers.reduce((a, x) => (!a || x.gateInputs < a.gateInputs ? x : a), null);
  const s = pick(f.minimal.sop), p = pick(f.minimal.pos);
  const show = (x, kind) => `minimal ${kind}, ${plural(x.gateInputs, "gate input")} (${plural(x.terms, "term")}, ${plural(x.literals, "literal")})`;
  return f.best === "tie" ? `minimal SOP and minimal POS cost the same, ${plural(s.gateInputs, "gate input")}` : f.best === "sop" ? show(s, "SOP") : show(p, "POS");
}

/** A Verilog identifier for a shown name: A[3] stays, anything else odd becomes an underscore. */
const verilogName = (shown) => shown.replace(/[^A-Za-z0-9_\[\]]/g, "_");

/** `assign Y = (A & ~B) | C;` for a form's cubes (SOP) or its sums (POS). */
export function verilogAssign(f, form, fn, r, kind = "sop") {
  const names = fn.variables.map((v) => verilogName(shownOf(r, v)));
  const lit = (name, ch, flip) => (ch === (flip ? "0" : "1") ? name : `~${name}`);
  const parts = form.cubes.map((cube) => {
    const lits = [...cube].flatMap((ch, i) => (ch === "-" ? [] : [lit(names[i], ch, kind === "pos")]));
    return lits.length === 0 ? (kind === "sop" ? "1'b1" : "1'b0") : lits.length === 1 ? lits[0] : `(${lits.join(kind === "sop" ? " & " : " | ")})`;
  });
  const empty = kind === "sop" ? "1'b0" : "1'b1";
  return `assign ${verilogName(f.name)} = ${parts.length ? parts.join(kind === "sop" ? " | " : " & ") : empty};`;
}

/** The `function/0.1` file for an output, as text. */
export const functionFile = (fn) => JSON.stringify(fn, null, 2) + "\n";

/** A circuit/0.2 for a form (a starting point for the Figure Editor), or null with a reason. */
export function circuitFile(fn, form) {
  try {
    return { text: JSON.stringify(toCircuit(form.text, { id: `${fn.id}_minimal`, title: `${fn.output ?? fn.id}, minimal form`, output: fn.output ?? "F", variables: fn.variables }), null, 2) + "\n" };
  } catch (e) { return { error: e.message }; }
}
