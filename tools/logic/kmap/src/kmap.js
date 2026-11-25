// L1.2: K-map core. No DOM. The groups and the minimal covers are the library's (logic/kmap.mjs, logic/qm.mjs: Quine-McCluskey and
// Petrick); this file adds which sides of a wrapped group are open, which X cells a cover uses, and a check of every cover against the
// table before it is returned. No new minimiser.
//
// Scope: 2 to 4 variables (1 also works). The pinned library lays out maps for 1 to 4 variables; a 5 or 6 variable map (two or four
// 4x4 layers) needs circuit-model to add that layout, so it is out of scope here.

import { kmap, minimize, parse, truthTable, toLatex } from "../../analyze/model/logic/index.mjs";

export const MAX_VARS = 4;

const memo = new Map();
/** The library's map and covers for a table (cached: drawing asks for it many times). */
function libMap(variables, table) {
  const k = variables.join(",") + "|" + table;
  if (!memo.has(k)) { memo.set(k, kmap(variables, table)); if (memo.size > 200) memo.delete(memo.keys().next().value); }
  return memo.get(k);
}

/** How many equally small covers the table has in this form ("sop" groups the 1s, "pos" the 0s). */
export function coverCount(state, output, kind) {
  const m = libMap(state.variables, state.outputs[output].table);
  return m[kind].length;
}

/** Does `expression` (text) agree with the table on every row that is not an X? Returns { ok, rows: the rows where it does not }. */
export function verifyCover(variables, table, expression, kind) {
  let t;
  try { t = truthTable(parse(expression), variables); } catch (e) { return { ok: false, rows: [], error: e.message }; }
  const rows = [];
  for (let r = 0; r < table.length; r++) if (table[r] !== "-" && table[r] !== t[r]) rows.push(r);
  return { ok: rows.length === 0, rows };
}

/** Mark the sides of each piece of a wrapped group that run off the map's edge and come back on the other side. */
function openSides(rects, rowsTotal, colsTotal) {
  const same = (a, b, keys) => keys.every((k) => a[k] === b[k]);
  return rects.map((r) => ({
    ...r,
    open: {
      left: r.col === 0 && rects.some((o) => o !== r && o.col + o.cols === colsTotal && same(o, r, ["row", "rows"])),
      right: r.col + r.cols === colsTotal && rects.some((o) => o !== r && o.col === 0 && same(o, r, ["row", "rows"])),
      top: r.row === 0 && rects.some((o) => o !== r && o.row + o.rows === rowsTotal && same(o, r, ["col", "cols"])),
      bottom: r.row + r.rows === rowsTotal && rects.some((o) => o !== r && o.row === 0 && same(o, r, ["col", "cols"])),
    },
  }));
}

/**
 * The K-map of one output, with one cover drawn. `kind` is "sop" (groups of 1s) or "pos" (groups of 0s); `cover` picks among equally small
 * covers. Returns { variables, rowVariables, colVariables, rowCodes, colCodes, rows, cols, cells, kind, covers, coverIndex, expression,
 * groups: [{ number, term, termLatex, cube, minterms, size, rects (with open sides), wraps, dontCaresUsed }], dontCaresUsed }, or { error }.
 */
export function mapOf(state, output, kind = "sop", cover = 0) {
  const { variables } = state;
  if (variables.length > MAX_VARS) return { error: `A K-map here takes up to ${MAX_VARS} inputs; this function has ${variables.length}. Maps for 5 and 6 inputs are not built (circuit-model has no layout for them yet).` };
  const o = state.outputs[output];
  const m = libMap(variables, o.table);
  const covers = m[kind];
  const c = covers[Math.min(cover, covers.length - 1)];
  const check = verifyCover(variables, o.table, c.expression, kind);
  if (!check.ok) return { error: `The form ${c.expression} did not match the table (rows ${check.rows.join(", ")}), so it is not shown. This is a fault in the tool; please report the table.` };
  const rows = m.rowCodes.length, cols = m.colCodes.length;
  const groups = c.groups.map((g, i) => ({
    number: i + 1,
    term: g.term,
    termLatex: toLatex(parse(g.term)),
    cube: g.cube,
    minterms: g.minterms,
    size: g.minterms.length,
    rects: openSides(g.rects, rows, cols),
    wraps: g.wraps,
    dontCaresUsed: g.minterms.filter((r) => o.table[r] === "-"),
  }));
  return {
    variables, rowVariables: m.rowVariables, colVariables: m.colVariables, rowCodes: m.rowCodes, colCodes: m.colCodes, rows, cols,
    cells: m.cells, kind, covers: covers.length, coverIndex: Math.min(cover, covers.length - 1),
    expression: c.expression, expressionLatex: toLatex(parse(c.expression)),
    groups, dontCaresUsed: [...new Set(groups.flatMap((g) => g.dontCaresUsed))].sort((a, b) => a - b),
  };
}

export { minimize };
