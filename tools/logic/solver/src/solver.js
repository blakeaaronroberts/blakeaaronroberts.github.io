// L1.3: Boolean step-by-step solver, core. No DOM.
//
// The library's simplify() (logic/rewrite.mjs) turns an expression into a minimal sum of products, one named law per line.
// This file adds the other goals (product of sums, NAND-only, NOR-only, prove two expressions equal) from those same lines
// plus a few explicit De Morgan and involution steps, finds the part of the expression each line changed, and CHECKS EVERY LINE
// AGAINST THE TRUTH TABLE of the original before returning it. A line whose table differs is never returned: solve() gives an
// error instead. No new minimiser: the minimal forms are the library's.

import { parse, toString, toLatex, truthTable, variablesOf, simplify, RULES, key, minimize, cubesOfSop, cubesOfPos, compareFunctions } from "../../analyze/model/logic/index.mjs";
import { compareNames, c, not, and, or } from "../../analyze/model/logic/expr.mjs";
import { MAX_INPUTS } from "../../analyze/model/analyze/index.mjs";

export const CAP = MAX_INPUTS;
export const GOALS = {
  sop: "Minimal sum of products (SOP)",
  pos: "Minimal product of sums (POS)",
  nand: "NAND-only form",
  nor: "NOR-only form",
};
/** The laws a student can choose from (everything but the starting line). */
export const LAWS = Object.keys(RULES).filter((k) => k !== "given");

const mk = (tree, rule, extra = {}) => ({ rule, law: RULES[rule] ?? "", tree, expression: toString(tree), latex: toLatex(tree), part: null, ...extra });
const isLit = (e) => e.t === "var" || (e.t === "not" && e.a.t === "var");
const mkAnd = (a) => (a.length === 1 ? a[0] : and(...a));
const mkOr = (a) => (a.length === 1 ? a[0] : or(...a));

// ---- the part of the line that changed ----

/** Arguments of `a` not in `b` (by key, each match used once). */
function without(a, b) {
  const left = b.map(key);
  return a.filter((x) => { const i = left.indexOf(key(x)); if (i >= 0) { left.splice(i, 1); return false; } return true; });
}

/**
 * What changed between two trees, as { before, after } trees (after is null when something was only removed). Goes down while exactly one
 * argument differs; a change in the number of terms reports the terms removed and added. null when the line only reorders (the caller
 * then names the whole line).
 */
export function changedPart(a, b) {
  if (key(a) === key(b)) return null;
  if (a.t === b.t && a.t === "not") return changedPart(a.a, b.a) ?? { before: a, after: b };
  if (a.t === b.t && a.args && a.args.length === b.args.length && (a.t === "and" || a.t === "or" || a.t === "xor")) {
    const diff = a.args.map((x, i) => i).filter((i) => key(a.args[i]) !== key(b.args[i]));
    if (diff.length === 1) return changedPart(a.args[diff[0]], b.args[diff[0]]);
  } else if ((a.t === "and" || a.t === "or") && (b.t === a.t || b.t !== "not")) {
    // A different number of terms: report the terms removed and added. The result may have shrunk to one term (b is not an and/or).
    const bArgs = b.t === a.t ? b.args : [b];
    const gone = without(a.args, bArgs), came = without(bArgs, a.args);
    if (gone.length && !came.length) return { before: mkOpLike(a.t, gone), after: null };
    if (gone.length && came.length && a.args.length !== bArgs.length) return { before: mkOpLike(a.t, gone), after: mkOpLike(a.t, came) };
  }
  return { before: a, after: b };
}
const mkOpLike = (t, args) => (t === "and" ? mkAnd(args) : mkOr(args));

function describePart(prev, next) {
  const p = changedPart(prev, next);
  if (!p) return { whole: true, before: toString(next), beforeLatex: toLatex(next), after: null, afterLatex: null };
  return { whole: false, before: toString(p.before), beforeLatex: toLatex(p.before), after: p.after ? toString(p.after) : null, afterLatex: p.after ? toLatex(p.after) : null };
}

/** Fill in `part` on each line from the line before it. */
function withParts(lines) {
  return lines.map((l, i) => (i === 0 ? l : { ...l, part: describePart(lines[i - 1].tree, l.tree) }));
}

// ---- the check ----

/** Lines whose truth table differs from `table` (over `vars`): [{ index, rows: [first differing rows] }]. Empty means every line is right. */
export function checkLines(lines, table, vars) {
  const bad = [];
  lines.forEach((l, index) => {
    let t;
    try { t = truthTable(l.tree, vars); } catch { t = null; }
    if (t === table) return;
    const rows = [];
    for (let r = 0; r < table.length && t && rows.length < 3; r++) if (t[r] !== table[r]) rows.push(r);
    bad.push({ index, rows });
  });
  return bad;
}

function finish(lines, goal, table, vars, extra = {}) {
  const bad = checkLines(lines, table, vars);
  if (bad.length) return { error: `A step failed its check against the truth table (line ${bad[0].index + 1}), so no steps are shown. This is a fault in the tool, not in your expression; please report the expression.` };
  const parts = withParts(lines);
  return { goal, variables: vars, table, rows: table.length, lines: parts, final: parts.at(-1).expression, finalLatex: parts.at(-1).latex, finalTree: parts.at(-1).tree, checked: true, ...extra };
}

// ---- goals ----

function sopLines(tree, vars) {
  const r = simplify(tree, { variables: vars });
  return { lines: r.steps.map((s, i) => mk(i === 0 ? tree : parse(s.expression), s.rule)), minimal: r.minimal };
}

/** The structure of a sum of products as terms, each a list of literals; null when it is not one. */
const termsOf = (t) => {
  const terms = t.t === "or" ? t.args : [t];
  const out = terms.map((x) => (x.t === "and" ? x.args : [x]));
  return out.every((lits) => lits.every(isLit)) ? out : null;
};
const negate = (l) => not(l);
const collapse = (t) => {
  if (t.t === "not") return t.a.t === "not" ? collapse(t.a.a) : not(collapse(t.a));
  return t.args ? { ...t, args: t.args.map(collapse) } : t;
};
const hasDoubleNot = (t) => (t.t === "not" ? t.a.t === "not" || hasDoubleNot(t.a) : t.args ? t.args.some(hasDoubleNot) : false);

/** Lines that start from a minimal SOP of F' wrapped in a complement and end at a product of sums. */
function posLines(tree, vars) {
  const inner = simplify(not(tree), { variables: vars });
  const lines = [mk(tree, "given"), mk(not(not(tree)), "involution")];
  const steps = inner.steps.map((s, i) => (i === 0 ? not(tree) : parse(s.expression)));
  for (let i = 1; i < steps.length; i++) lines.push(mk(not(steps[i]), inner.steps[i].rule));
  const s = steps.at(-1);
  // Push the outer complement through the sum of products: De Morgan on the sum, then on each product, then involution.
  if (s.t === "const") { lines.push(mk(c(1 - s.v), "complement of a constant")); return { lines, minimal: inner.minimal }; }
  if (isLit(s)) {   // F' is one literal: F is its complement. A complemented variable needs the involution law; a plain variable is already a literal.
    if (s.t === "not") lines.push(mk(s.a, "involution"));
    return { lines, minimal: inner.minimal };
  }
  const terms = termsOf(s);
  if (!terms) return { error: "The simplifier did not end in a sum of products." };
  let cur;
  if (terms.length === 1) {
    cur = mkOr(terms[0].map(negate));
    lines.push(mk(cur, "De Morgan"));
  } else {
    let args = terms.map((lits) => not(mkAnd(lits)));
    cur = and(...args);
    lines.push(mk(cur, "De Morgan"));
    terms.forEach((lits, i) => {
      if (lits.length < 2) return;
      args = args.slice(); args[i] = mkOr(lits.map(negate));
      cur = and(...args);
      lines.push(mk(cur, "De Morgan"));
    });
  }
  if (hasDoubleNot(cur)) lines.push(mk(collapse(cur), "involution"));
  return { lines, minimal: inner.minimal };
}

/** Does `tree` have the cost of the library's smallest cover in the given form? */
function isMinimalForm(tree, table, vars, form) {
  const best = minimize(table)[form].covers[0];
  const cubes = (form === "sop" ? cubesOfSop : cubesOfPos)(tree, vars);
  if (!cubes || cubes.includes("contradiction")) return false;
  const lit = (q) => q.replace(/-/g, "").length;
  return cubes.length === best.length && cubes.reduce((k, q) => k + lit(q), 0) === best.reduce((k, q) => k + lit(q), 0);
}

/** Two-level NAND (from the minimal SOP) or NOR (from the minimal POS): F = (F')', then De Morgan on the inner F'. */
function twoLevel(base, kind) {
  const last = base.at(-1).tree;
  const lines = base.slice();
  const outer = kind === "nand" ? "or" : "and";   // the top operator of the form being rewritten
  if (last.t === "const" || isLit(last)) return { lines, trivial: true };
  lines.push(mk(not(not(last)), "involution"));
  if (last.t === outer && last.args.length >= 2) {
    // not(a1 + a2 + ...) = a1' a2' ...   (NAND form),   not(a1 a2 ...) = a1' + a2' + ...   (NOR form)
    const inner = kind === "nand" ? and(...last.args.map(negate)) : or(...last.args.map(negate));
    lines.push(mk(not(inner), "De Morgan"));
    if (hasDoubleNot(inner)) lines.push(mk(collapse(not(inner)), "involution"));   // a complemented literal's complement is the literal
  }
  return { lines };
}

/** Is this expression text one expression (a leading `F =` is allowed and dropped)? */
function readExpression(text) {
  const t = String(text).replace(/^\s*[A-Za-z][A-Za-z0-9_]*\s*=(?!=)\s*/, "");
  return parse(t);
}

/**
 * Solve one expression toward a goal ("sop", "pos", "nand", "nor"). Returns
 * { goal, variables, lines: [{ rule, law, expression, latex, part, tree }], final, finalLatex, checked, minimal, note? }
 * or { error } (for a bad expression, too many inputs, or a failed check).
 */
export function solve(text, goal = "sop") {
  if (!(goal in GOALS)) return { error: `Unknown goal "${goal}".` };
  let tree;
  try { tree = readExpression(text); } catch (e) { return { error: e.message }; }
  const vars = variablesOf(tree);
  if (vars.length > CAP) return { error: `This expression uses ${vars.length} inputs; the tool takes at most ${CAP}.` };
  const table = truthTable(tree, vars.length ? vars : ["A"]);
  const v = vars.length ? vars : ["A"];
  try {
    if (goal === "sop") { const r = sopLines(tree, v); return finish(r.lines, goal, table, v, { minimal: r.minimal && isMinimalForm(r.lines.at(-1).tree, table, v, "sop") }); }
    if (goal === "pos") {
      const r = posLines(tree, v);
      if (r.error) return r;
      return finish(r.lines, goal, table, v, { minimal: isMinimalForm(r.lines.at(-1).tree, table, v, "pos") });
    }
    if (goal === "nand") {
      const r = sopLines(tree, v), t = twoLevel(r.lines, "nand");
      return finish(t.lines, goal, table, v, { note: noteFor("nand", t.trivial) });
    }
    const p = posLines(tree, v);
    if (p.error) return p;
    const t = twoLevel(p.lines, "nor");
    return finish(t.lines, goal, table, v, { note: noteFor("nor", t.trivial) });
  } catch (e) { return { error: e.message }; }
}

const noteFor = (kind, trivial) => trivial
  ? "This function is a constant or a single literal, so it needs no gates beyond an inverter at most."
  : kind === "nand"
    ? "Two levels of NAND gates: the first level has one NAND for each product term of the minimal SOP, and the second NANDs their outputs. A complemented input needs an inverter, which is a NAND with its inputs tied together."
    : "Two levels of NOR gates: the first level has one NOR for each sum of the minimal POS, and the second NORs their outputs. A complemented input needs an inverter, which is a NOR with its inputs tied together.";

// ---- prove two expressions equal ----

/**
 * Compare two expressions. Returns { equal, variables, differing: [{ values, a, b }] (the first rows that differ) } and, when they
 * are equal, { lines } : a chain from the first to the second through their minimal sum of products, each line checked, when both reach the
 * same minimal SOP; otherwise { lines: null, reductions: [chainA, chainB] } with each reduction shown separately.
 */
export function prove(textA, textB) {
  let a, b;
  try { a = readExpression(textA); } catch (e) { return { error: `First expression: ${e.message}` }; }
  try { b = readExpression(textB); } catch (e) { return { error: `Second expression: ${e.message}` }; }
  const vars = [...new Set([...variablesOf(a), ...variablesOf(b)])].sort(compareNames);
  if (vars.length > CAP) return { error: `These expressions use ${vars.length} inputs; the tool takes at most ${CAP}.` };
  const v = vars.length ? vars : ["A"];
  const ta = truthTable(a, v), tb = truthTable(b, v);
  const n = v.length;
  const differing = [];
  for (let r = 0; r < ta.length && differing.length < 8; r++) {
    if (ta[r] !== tb[r]) differing.push({ row: r, values: Object.fromEntries(v.map((name, i) => [name, (r >> (n - 1 - i)) & 1])), a: ta[r], b: tb[r] });
  }
  const total = [...ta].filter((ch, r) => ch !== tb[r]).length;
  if (total) return { equal: false, variables: v, differing, total, rows: ta.length };
  const ra = sopLines(a, v), rb = sopLines(b, v);
  const la = ra.lines, lb = rb.lines;
  if (key(la.at(-1).tree) === key(lb.at(-1).tree)) {
    const chain = [...la];
    for (let j = lb.length - 2; j >= 0; j--) chain.push(mk(lb[j].tree, lb[j + 1].rule, { reversed: true }));
    const done = finish(chain, "prove", ta, v);
    if (done.error) return done;
    return { equal: true, variables: v, rows: ta.length, lines: done.lines, checked: true, joinsAt: la.length - 1 };
  }
  const x = finish(la, "prove", ta, v), y = finish(lb, "prove", tb, v);
  if (x.error || y.error) return { error: (x.error ?? y.error) };
  return { equal: true, variables: v, rows: ta.length, lines: null, reductions: [x.lines, y.lines], checked: true,
    note: "The truth tables match, so the expressions are equal. Their reductions end in two different sums of products of the same size, so one chain of laws does not join them; each reduction is shown." };
}

// ---- "your turn" ----

/** Check a student's choice of law for line `index` (the line to produce). Only the route this tool takes is known, so a different law is "not the one used here", never "wrong". */
export function checkChoice(lines, index, choice) {
  const want = lines[index]?.rule;
  return { correct: want === choice, expected: want };
}

/** Compare two expression texts as functions (library compareFunctions), for tests. */
export { compareFunctions };

/** The output name written in front of an expression (`Y = A + B`), or "F". */
export const outputNameOf = (text) => /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=(?!=)/.exec(String(text))?.[1] ?? "F";
