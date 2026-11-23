// K-map layout and groups as data, for a tool or the figure editor to draw.
//
// Layouts (rows x columns), in Gray-code order so neighbours differ in one bit:
//   1 variable   A            : 1 x 2
//   2 variables  A | B        : 2 x 2
//   3 variables  A | BC       : 2 x 4
//   4 variables  AB | CD      : 4 x 4
// A group is one cube of a cover. Because the map wraps around at its edges,
// a group can be split into up to four rectangles; `rects` lists them, each
// as { row, col, rows, cols } in cell units, and `wraps` says whether it was split.

import { minimize, cubeMinterms } from "./qm.mjs";
import { sopFromCubes, posFromCubes } from "./function.mjs";
import { toString } from "./expr.mjs";

const GRAY = { 0: [""], 1: ["0", "1"], 2: ["00", "01", "11", "10"] };

function layout(n) {
  if (n < 1 || n > 4) throw new Error("K-maps here are for 1 to 4 variables");
  const rowBits = n === 1 ? 0 : n <= 3 ? 1 : 2;
  return { rowBits, colBits: n - rowBits };
}

/** Indices (in map order) whose code matches the cube's part for these variables. */
function matching(codes, cubePart) {
  return codes.flatMap((code, i) => ([...code].every((ch, j) => cubePart[j] === "-" || cubePart[j] === ch) ? [i] : []));
}

/** Split indices into runs that are contiguous without wrapping. */
function runs(indices) {
  const out = [];
  for (const i of indices) {
    const last = out[out.length - 1];
    if (last && last.start + last.length === i) last.length++;
    else out.push({ start: i, length: 1 });
  }
  return out;
}

function group(cube, rowBits, rowCodes, colCodes, term, kind) {
  const rows = matching(rowCodes, cube.slice(0, rowBits));
  const cols = matching(colCodes, cube.slice(rowBits));
  const rects = [];
  for (const r of runs(rows)) for (const c of runs(cols)) rects.push({ row: r.start, col: c.start, rows: r.length, cols: c.length });
  return {
    term,
    kind,
    cube,
    minterms: cubeMinterms(cube),
    cells: rows.flatMap((r) => cols.map((c) => [r, c])),
    rects,
    wraps: rects.length > 1,
  };
}

/**
 * The K-map of a table, with the groups of every minimal SOP cover (groups
 * of 1s) and every minimal POS cover (groups of 0s).
 */
export function kmap(variables, table) {
  const n = variables.length;
  if (table.length !== 1 << n) throw new Error("table length does not match the variables");
  const { rowBits, colBits } = layout(n);
  const rowCodes = GRAY[rowBits];
  const colCodes = GRAY[colBits];
  const cells = rowCodes.map((rc) => colCodes.map((cc) => {
    const minterm = parseInt(rc + cc, 2);
    return { minterm, value: table[minterm] };
  }));
  const m = minimize(table);
  const cover = (covers, kind) => covers.map((cubes) => ({
    expression: toString((kind === "sop" ? sopFromCubes : posFromCubes)(cubes, variables)),
    groups: cubes.map((cube) => group(cube, rowBits, rowCodes, colCodes,
      toString((kind === "sop" ? sopFromCubes : posFromCubes)([cube], variables)), kind)),
  }));
  return {
    variables,
    rowVariables: variables.slice(0, rowBits),
    colVariables: variables.slice(rowBits),
    rowCodes,
    colCodes,
    cells,
    sop: cover(m.sop.covers, "sop"),
    pos: cover(m.pos.covers, "pos"),
  };
}
