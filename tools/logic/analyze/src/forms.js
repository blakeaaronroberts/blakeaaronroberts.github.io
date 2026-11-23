// L5.3: the forms of one output: minterms and maxterms, canonical and minimal SOP and POS. No DOM.
// Nothing is minimised here: logic/qm.mjs (Quine-McCluskey, then Petrick's method) finds every smallest cover. A cover is
// smallest when no other cover has fewer terms, then fewer literals, so a form whose terms could still be combined into
// fewer variables is never offered. Every form shown is checked against the table before it is returned.

import { minimize, rowsOf, literalCount, sopFromCubes, posFromCubes, toString, toLatex, truthTable } from "../model/logic/index.mjs";

/** "Y[0]" -> "Y_{0}"; one letter stays; a longer name is set upright. For LaTeX. */
export const texName = (name) => {
  const m = /^([A-Za-z][A-Za-z0-9]*?)(?:\[(\d+)\])?$/.exec(name) ?? [];
  const base = m[1] ?? name, bit = m[2];
  const upright = base.length === 1 ? base : `\\mathrm{${base}}`;
  return bit === undefined ? upright : `${upright}_{${bit}}`;
};

/** Gate inputs: each term of two or more literals is one gate (its literals), and two or more terms need a gate joining them. */
const gateInputs = (cubes) => cubes.reduce((k, c) => k + (literalCount(c) >= 2 ? literalCount(c) : 0), 0) + (cubes.length >= 2 ? cubes.length : 0);

/** Does expression `e` give the table's value on every row that is not a don't care? */
function agrees(e, variables, table) {
  const t = truthTable(e, variables);
  return [...table].every((ch, r) => ch === "-" || ch === t[r]);
}

/**
 * The forms of a `function/0.1` object. `name` is the output as shown (Y[0]).
 * Returns { name, ones, zeros, dontCares, sigma, pi, canonical: {sop, pos}, minimal: {sop: [forms], pos: [forms]}, best, problems }
 * where a form is { cubes, text, latex, terms, literals }. `error` replaces all of it if minimising could not finish.
 */
export function formsOf(fn, name = fn.output ?? fn.id) {
  const vars = fn.variables, n = vars.length, { on, off, dc } = rowsOf(fn.table);
  const cubeOf = (r) => [...Array(n)].map((_, i) => String((r >> (n - 1 - i)) & 1)).join("");
  const form = (cubes, build) => {
    const e = build(cubes, vars);
    return { cubes, text: toString(e), latex: toLatex(e), terms: cubes.length, literals: cubes.reduce((k, c) => k + literalCount(c), 0), gateInputs: gateInputs(cubes), expr: e };
  };
  let m;
  try { m = minimize(fn.table); } catch (e) { return { name, error: `Could not find the smallest forms: ${e.message}` }; }
  const canonical = { sop: form(on.map(cubeOf), sopFromCubes), pos: form(off.map(cubeOf), posFromCubes) };
  const minimal = { sop: m.sop.covers.map((c) => form(c, sopFromCubes)), pos: m.pos.covers.map((c) => form(c, posFromCubes)) };
  const problems = [];
  for (const [kind, f] of [["canonical SOP", canonical.sop], ["canonical POS", canonical.pos], ...minimal.sop.map((x) => ["minimal SOP", x]), ...minimal.pos.map((x) => ["minimal POS", x])]) {
    if (!agrees(f.expr, vars, fn.table)) problems.push(`${kind} ${f.text} does not match the table`);
  }
  // Cheapest by gate inputs over every smallest cover (the covers share terms and literals, so they can differ here).
  const cheapest = (covers) => covers.reduce((a, x) => (!a || x.gateInputs < a.gateInputs ? x : a), null);
  const s = cheapest(minimal.sop), p = cheapest(minimal.pos);
  const best = !s || !p ? null : s.gateInputs < p.gateInputs ? "sop" : p.gateInputs < s.gateInputs ? "pos" : "tie";
  const list = (rows) => rows.join(", ");
  const dcLatex = dc.length ? ` + d(${list(dc)})` : "";
  return {
    name, ones: on, zeros: off, dontCares: dc, canonical, minimal, best, problems,
    sigma: `Σm(${list(on)})${dc.length ? ` + d(${list(dc)})` : ""}`, pi: `ΠM(${list(off)})${dc.length ? ` + d(${list(dc)})` : ""}`,
    sigmaLatex: `\\sum m(${list(on)})${dcLatex}`, piLatex: `\\prod M(${list(off)})${dcLatex}`,
  };
}
