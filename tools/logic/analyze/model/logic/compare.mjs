// Row-by-row comparison of two Boolean functions (truth tables).

/** The most variables compared at once (2^16 rows). */
const MAX_VARIABLES = 16;

/**
 * Compare two functions, each { variables, table } (a `function/0.1` object
 * will do). Variables are matched by name, in any order; a variable only one
 * side has is one the other side ignores. A don't care ("-") on either side
 * matches anything. Returns { equal, rows }, rows listing every row that
 * differs: { row, values: { variable: "0" | "1" }, a, b }, where row numbers the
 * combined variables (a's first, then b's others), the first most significant.
 */
export function compareFunctions(a, b) {
  for (const [side, f] of [["a", a], ["b", b]]) {
    if (f.table.length !== 1 << f.variables.length) {
      throw new Error(`${side}: table has ${f.table.length} rows; ${f.variables.length} variables need ${1 << f.variables.length}`);
    }
  }
  const all = [...a.variables, ...b.variables.filter((v) => !a.variables.includes(v))];
  if (all.length > MAX_VARIABLES) throw new Error(`${all.length} variables in all; at most ${MAX_VARIABLES} can be compared`);
  const n = all.length;
  const rowIn = (f, bits) => f.variables.reduce((r, v) => (r << 1) | bits[all.indexOf(v)], 0);
  const rows = [];
  for (let row = 0; row < 1 << n; row++) {
    const bits = all.map((_, i) => (row >> (n - 1 - i)) & 1);
    const x = a.table[rowIn(a, bits)];
    const y = b.table[rowIn(b, bits)];
    if (x === "-" || y === "-" || x === y) continue;
    rows.push({ row, values: Object.fromEntries(all.map((v, i) => [v, String(bits[i])])), a: x, b: y });
  }
  return { equal: rows.length === 0, rows };
}
