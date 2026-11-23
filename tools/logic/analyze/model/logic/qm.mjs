// Quine-McCluskey minimisation, with a cover step that finds every minimal
// cover (Petrick's method), for sum of products and product of sums.
//
// A cube is a string with one character per variable, in variable order:
// "1" (the variable), "0" (its complement) or "-" (absent). "1-0" over A, B, C
// is the product AC' in SOP, and the sum A' + C in POS (a POS cube describes a
// zero of the function, so its literals are complemented).
//
// "Minimal" means the fewest terms, then the fewest literals. All covers with
// that cost are returned; `covers.length > 1` means the choice is not unique.

/** Order cubes: "1" before "0" before "-", position by position. */
export function compareCubes(a, b) {
  const rank = (s) => s.replace(/1/g, "a").replace(/0/g, "b").replace(/-/g, "c");
  const ra = rank(a);
  const rb = rank(b);
  return ra < rb ? -1 : ra > rb ? 1 : 0;
}

export const literalCount = (cube) => cube.replace(/-/g, "").length;

/** Rows (minterm numbers) a cube covers, ascending. */
export function cubeMinterms(cube) {
  const n = cube.length;
  let rows = [0];
  for (let i = 0; i < n; i++) {
    const bit = 1 << (n - 1 - i);
    if (cube[i] === "1") rows = rows.map((r) => r | bit);
    else if (cube[i] === "-") rows = rows.flatMap((r) => [r, r | bit]);
  }
  return rows.sort((a, b) => a - b);
}

function toCube(bits, mask, n) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const b = 1 << (n - 1 - i);
    s += mask & b ? "-" : bits & b ? "1" : "0";
  }
  return s;
}

const popcount = (x) => { let k = 0; for (; x; x &= x - 1) k++; return k; };

/**
 * Minimise the function whose rows in `on` are 1 and in `dc` are don't-care,
 * over n variables. Returns the steps as data, for a tool to show:
 *   columns     the combining columns: [{ cube, minterms, used }]
 *   primes      every prime implicant (cubes, sorted)
 *   essentials  primes that are the only cover of some row
 *   chart       { row: [primes covering it] } for the rows that must be 1
 *   covers      every minimal cover (each a sorted list of cubes)
 */
export function quineMcCluskey(n, on, dc = []) {
  const careOn = [...new Set(on)].sort((a, b) => a - b);
  const all = [...new Set([...on, ...dc])].sort((a, b) => a - b);

  // Combining columns.
  let current = all.map((m) => ({ bits: m, mask: 0 }));
  const columns = [];
  const primes = new Map(); // cube -> { bits, mask }
  while (current.length > 0) {
    const used = new Set();
    const next = new Map();
    const byKey = (x) => `${x.mask}:${x.bits}`;
    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const a = current[i];
        const b = current[j];
        if (a.mask !== b.mask) continue;
        const diff = a.bits ^ b.bits;
        if (popcount(diff) !== 1) continue;
        used.add(byKey(a));
        used.add(byKey(b));
        const merged = { bits: a.bits & ~diff, mask: a.mask | diff };
        next.set(byKey(merged), merged);
      }
    }
    const column = current
      .map((x) => ({ cube: toCube(x.bits, x.mask, n), x, used: used.has(byKey(x)) }))
      .sort((p, q) => popcount(p.x.bits) - popcount(q.x.bits) || compareCubes(p.cube, q.cube));
    columns.push(column.map(({ cube, used: u }) => ({ cube, minterms: cubeMinterms(cube), used: u })));
    for (const { cube, x, used: u } of column) if (!u) primes.set(cube, x);
    current = [...next.values()];
  }

  const primeList = [...primes.keys()].sort(compareCubes);
  const covering = new Map(primeList.map((p) => [p, new Set(cubeMinterms(p))]));
  const chart = {};
  for (const m of careOn) chart[m] = primeList.filter((p) => covering.get(p).has(m));

  const essentials = primeList.filter((p) => careOn.some((m) => chart[m].length === 1 && chart[m][0] === p));
  const coveredByEssentials = new Set(essentials.flatMap((p) => [...covering.get(p)]));
  const remaining = careOn.filter((m) => !coveredByEssentials.has(m));

  // Petrick's method over the remaining rows: every irredundant choice of
  // primes, as bit sets, absorbing supersets as it goes.
  const index = new Map(primeList.map((p, i) => [p, BigInt(1) << BigInt(i)]));
  let sets = [BigInt(0)];
  for (const m of remaining) {
    const options = chart[m].map((p) => index.get(p));
    const grown = [];
    for (const s of sets) {
      if (options.some((o) => (s & o) !== BigInt(0))) grown.push(s);
      else for (const o of options) grown.push(s | o);
    }
    sets = absorb(grown);
    if (sets.length > 50000) throw new Error("too many covers to enumerate; the function is too large for this minimiser");
  }

  const cost = (cubes) => [cubes.length, cubes.reduce((k, q) => k + literalCount(q), 0)];
  let best = null;
  let covers = [];
  for (const s of sets) {
    const chosen = primeList.filter((p) => (s & index.get(p)) !== BigInt(0));
    const cover = [...new Set([...essentials, ...chosen])].sort(compareCubes);
    const [t, l] = cost(cover);
    if (!best || t < best[0] || (t === best[0] && l < best[1])) {
      best = [t, l];
      covers = [cover];
    } else if (t === best[0] && l === best[1]) covers.push(cover);
  }
  covers.sort((a, b) => compareCubes(a.join(","), b.join(",")));
  return { columns, primes: primeList, essentials, chart, covers };
}

function absorb(sets) {
  const unique = [...new Set(sets)].sort((a, b) => popcountBig(a) - popcountBig(b));
  const kept = [];
  for (const s of unique) if (!kept.some((k) => (s & k) === k)) kept.push(s);
  return kept;
}

function popcountBig(x) {
  let k = 0;
  for (; x; x &= x - BigInt(1)) k++;
  return k;
}

/** Rows of a table string ("0", "1", "-") by their value. */
export function rowsOf(table) {
  const on = [];
  const off = [];
  const dc = [];
  [...table].forEach((ch, r) => (ch === "1" ? on : ch === "0" ? off : dc).push(r));
  return { on, off, dc };
}

/** Minimal SOP and POS of a table. POS minimises the zeros the same way. */
export function minimize(table) {
  const n = Math.log2(table.length);
  if (!Number.isInteger(n)) throw new Error("table length must be a power of 2");
  const { on, off, dc } = rowsOf(table);
  return { sop: quineMcCluskey(n, on, dc), pos: quineMcCluskey(n, off, dc) };
}
