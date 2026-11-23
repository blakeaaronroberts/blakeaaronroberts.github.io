// The `function/0.1` format: build one from a table or an expression, convert
// between cubes and SOP or POS expressions, and check one.

import { parse, toString, truthTable, variablesOf, v, c, not, and, or } from "./expr.mjs";
import { minimize, compareCubes, cubeMinterms } from "./qm.mjs";
import { validate } from "../validate/jsonschema.mjs";

const literalFor = (name, ch) => (ch === "1" ? v(name) : not(v(name)));

/** Sum of products from cubes (one product per cube). */
export function sopFromCubes(cubes, variables) {
  const products = cubes.map((cube) => {
    const lits = [...cube].flatMap((ch, i) => (ch === "-" ? [] : [literalFor(variables[i], ch)]));
    return lits.length === 0 ? c(1) : lits.length === 1 ? lits[0] : and(...lits);
  });
  return products.length === 0 ? c(0) : products.length === 1 ? products[0] : or(...products);
}

/** Product of sums from cubes of the zeros (one sum per cube, literals complemented). */
export function posFromCubes(cubes, variables) {
  const sums = cubes.map((cube) => {
    const lits = [...cube].flatMap((ch, i) => (ch === "-" ? [] : [literalFor(variables[i], ch === "1" ? "0" : "1")]));
    return lits.length === 0 ? c(0) : lits.length === 1 ? lits[0] : or(...lits);
  });
  return sums.length === 0 ? c(1) : sums.length === 1 ? sums[0] : and(...sums);
}

const isLiteral = (e) => e.t === "var" || (e.t === "not" && e.a.t === "var");

/** Cube of a product of literals, or null if it is not one (or uses an unknown variable). */
function cubeOfLiterals(lits, variables, positiveMeans) {
  const cube = Array(variables.length).fill("-");
  for (const l of lits) {
    if (!isLiteral(l)) return null;
    const name = l.t === "var" ? l.name : l.a.name;
    const i = variables.indexOf(name);
    if (i < 0) return null;
    const ch = l.t === "var" ? positiveMeans : positiveMeans === "1" ? "0" : "1";
    if (cube[i] !== "-" && cube[i] !== ch) return "contradiction";
    cube[i] = ch;
  }
  return cube.join("");
}

/**
 * The cubes of an expression in sum-of-products shape, or null if it is not
 * in that shape. A product containing X and X' gives "contradiction".
 */
export function cubesOfSop(e, variables) {
  if (e.t === "const") return e.v === 0 ? [] : ["-".repeat(variables.length)];
  const terms = e.t === "or" ? e.args : [e];
  const cubes = [];
  for (const t of terms) {
    if (t.t === "const" && t.v === 1) cubes.push("-".repeat(variables.length));
    else {
      const cube = cubeOfLiterals(t.t === "and" ? t.args : [t], variables, "1");
      if (cube === null) return null;
      cubes.push(cube);
    }
  }
  return cubes;
}

/** The cubes (of the zeros) of an expression in product-of-sums shape, or null. */
export function cubesOfPos(e, variables) {
  if (e.t === "const") return e.v === 1 ? [] : ["-".repeat(variables.length)];
  const factors = e.t === "and" ? e.args : [e];
  const cubes = [];
  for (const f of factors) {
    if (f.t === "const" && f.v === 0) cubes.push("-".repeat(variables.length));
    else {
      const cube = cubeOfLiterals(f.t === "or" ? f.args : [f], variables, "0");
      if (cube === null) return null;
      cubes.push(cube);
    }
  }
  return cubes;
}

const coverKey = (cubes) => [...cubes].sort(compareCubes).join(",");

/** "Σm(1, 3, 5) + d(2)" for a table. */
export function sigma(table) {
  const on = [];
  const dc = [];
  [...table].forEach((ch, r) => (ch === "1" ? on.push(r) : ch === "-" ? dc.push(r) : null));
  return `Σm(${on.join(", ")})${dc.length ? ` + d(${dc.join(", ")})` : ""}`;
}

/** "ΠM(0, 2) + d(...)" for a table. */
export function pi(table) {
  const off = [];
  const dc = [];
  [...table].forEach((ch, r) => (ch === "0" ? off.push(r) : ch === "-" ? dc.push(r) : null));
  return `ΠM(${off.join(", ")})${dc.length ? ` + d(${dc.join(", ")})` : ""}`;
}

/**
 * Build a complete `function/0.1` object from a table: canonical SOP and POS
 * (don't-care rows left out) and every minimal SOP and POS.
 */
export function fromTable({ id, variables, table, title, output, expression }) {
  const n = variables.length;
  if (table.length !== 1 << n) throw new Error(`table has ${table.length} rows; ${n} variables need ${1 << n}`);
  const rowCube = (r) => [...Array(n)].map((_, i) => String((r >> (n - 1 - i)) & 1)).join("");
  const ones = [...table].flatMap((ch, r) => (ch === "1" ? [rowCube(r)] : []));
  const zeros = [...table].flatMap((ch, r) => (ch === "0" ? [rowCube(r)] : []));
  const m = minimize(table);
  const fn = { schema: "function/0.1", id };
  if (title) fn.title = title;
  fn.variables = variables;
  if (output) fn.output = output;
  fn.table = table;
  if (expression) fn.expression = expression;
  fn.sop = toString(sopFromCubes(ones, variables));
  fn.pos = toString(posFromCubes(zeros, variables));
  fn.minimal = {
    sop: m.sop.covers.map((cover) => toString(sopFromCubes(cover, variables))),
    pos: m.pos.covers.map((cover) => toString(posFromCubes(cover, variables))),
  };
  return fn;
}

/** Build a `function/0.1` object from an expression string. */
export function fromExpression(text, { id, variables, title, output } = {}) {
  const e = parse(text);
  const vars = variables ?? variablesOf(e);
  return fromTable({ id: id ?? "f", variables: vars, table: truthTable(e, vars), title, output, expression: text });
}

/** Does `e` agree with `table` on every row that is not a don't care? */
function agrees(e, variables, table) {
  const t = truthTable(e, variables);
  return [...table].every((ch, r) => ch === "-" || ch === t[r]);
}

/** Check a function object. Returns a list of problems; empty means valid. */
export function checkFunction(schema, fn) {
  const problems = validate(schema, fn).map((e) => `${e.path || "(top level)"} ${e.message}`);
  if (problems.length) return problems;
  const vars = fn.variables;
  if (fn.table.length !== 1 << vars.length) {
    return [`/table has ${fn.table.length} rows; ${vars.length} variables need ${1 << vars.length}`];
  }

  const parsed = (field, text) => {
    try {
      const e = parse(text);
      const extra = variablesOf(e).filter((n) => !vars.includes(n));
      if (extra.length) { problems.push(`${field} uses ${extra.join(", ")}, not in variables`); return null; }
      return e;
    } catch (err) {
      problems.push(`${field} does not parse: ${err.message}`);
      return null;
    }
  };
  for (const field of ["expression", "sop", "pos"]) {
    if (fn[field] === undefined) continue;
    const e = parsed(`/${field}`, fn[field]);
    if (!e) continue;
    if (!agrees(e, vars, fn.table)) problems.push(`/${field} does not match the table`);
    if (field === "sop" && cubesOfSop(e, vars) === null) problems.push("/sop is not a sum of products");
    if (field === "pos" && cubesOfPos(e, vars) === null) problems.push("/pos is not a product of sums");
  }

  if (fn.minimal) {
    const m = minimize(fn.table);
    for (const [form, cubesOf] of [["sop", cubesOfSop], ["pos", cubesOfPos]]) {
      const listed = fn.minimal[form];
      if (!listed) continue;
      const keys = [];
      listed.forEach((text, i) => {
        const e = parsed(`/minimal/${form}/${i}`, text);
        if (!e) return;
        const cubes = cubesOf(e, vars);
        if (cubes === null || cubes.includes("contradiction")) problems.push(`/minimal/${form}/${i} is not a ${form === "sop" ? "sum of products" : "product of sums"}`);
        else keys.push(coverKey(cubes));
      });
      const expected = new Set(m[form].covers.map(coverKey));
      const got = new Set(keys);
      if (got.size !== keys.length) problems.push(`/minimal/${form} lists the same cover twice`);
      for (const k of got) if (!expected.has(k)) problems.push(`/minimal/${form} lists a form that is not minimal: ${k}`);
      for (const k of expected) if (!got.has(k)) problems.push(`/minimal/${form} is missing a minimal form: ${k}`);
    }
  }
  return problems;
}

export { cubeMinterms };
