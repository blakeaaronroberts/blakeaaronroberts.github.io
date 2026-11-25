// L1.2: K-map core. Run: quarto run tools/logic/kmap/test/run.js
import { MAX_VARS, mapOf, verifyCover, coverCount } from "../src/kmap.js";
import { fromExpressions, blank, setCell } from "../../truth-table/src/table.js";
import { parse, truthTable, cubeMinterms } from "../../analyze/model/logic/index.mjs";

const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const assertEquals = (a, b, m = "") => assert(JSON.stringify(a) === JSON.stringify(b), `${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const st = (text, variables) => fromExpressions(text, { variables }).state;

Deno.test("the map for 2 to 4 variables is in Gray-code order, rows then columns; 5 and 6 are out of scope and say why", () => {
  const m = mapOf(st("F = AB + CD"), 0, "sop", 0);
  assertEquals([m.rowVariables, m.colVariables, m.rowCodes, m.colCodes], [["A", "B"], ["C", "D"], ["00", "01", "11", "10"], ["00", "01", "11", "10"]]);
  assertEquals(m.cells[0][3], { minterm: 2, value: "0" });   // row 00, column 10 is ABCD = 0010
  assertEquals(m.cells[2][2].minterm, 15);
  assertEquals(MAX_VARS, 4);
  const big = mapOf(st("F = A + B + C + D + E"), 0, "sop", 0);
  assert(big.error && big.error.includes("4") && big.error.includes("circuit-model"), big.error);
});

Deno.test("majority of three: three groups of two, each a product of two literals, the 1s covered exactly", () => {
  const m = mapOf(st("M = AB + AC + BC"), 0, "sop", 0);
  assertEquals(m.groups.map((g) => g.size), [2, 2, 2]);
  assertEquals(m.groups.map((g) => g.number), [1, 2, 3]);
  assertEquals(m.expression, "AB + AC + BC");
  assertEquals([...new Set(m.groups.flatMap((g) => g.minterms))].sort(), [3, 5, 6, 7]);
});

Deno.test("the four corners of a 4-variable map are one group of four pieces, each open on two sides", () => {
  const m = mapOf(st("F = B'D'", ["A", "B", "C", "D"]), 0, "sop", 0);
  assertEquals(m.groups.length, 1);
  const g = m.groups[0];
  assertEquals(g.minterms, [0, 2, 8, 10]);
  assert(g.wraps && g.rects.length === 4);
  for (const r of g.rects) {
    const open = Object.values(r.open).filter(Boolean).length;
    assertEquals(open, 2, JSON.stringify(r));
  }
  const top = g.rects.find((r) => r.row === 0 && r.col === 0);
  assertEquals([top.open.top, top.open.bottom, top.open.left, top.open.right], [true, false, true, false]);
});
Deno.test("a group that wraps only left to right is open on those sides only; a group that does not wrap is closed", () => {
  const w = mapOf(st("F = B'C'", ["A", "B", "C"]), 0, "sop", 0).groups[0];   // 3 variables: A | BC; B'C' = columns 00 only... not a wrap
  assert(!w.wraps && Object.values(w.rects[0].open).every((x) => !x));
  const wrap = mapOf(st("F = C'", ["A", "B", "C"]), 0, "sop", 0).groups[0];   // C = 0: columns 00 and 10, which wrap round
  assert(wrap.wraps && wrap.rects.length === 2);
  assertEquals(wrap.rects.map((r) => [r.open.left, r.open.right, r.open.top, r.open.bottom]), [[true, false, false, false], [false, true, false, false]]);
});

Deno.test("POS groups the 0s: (A + B)(A' + C) has no 1 inside any group, and its expression is a product of sums", () => {
  const s = st("F = (A + B)(A' + C)");
  const m = mapOf(s, 0, "pos", 0);
  const ones = new Set([...s.outputs[0].table].flatMap((c, r) => (c === "1" ? [r] : [])));
  assert(m.groups.every((g) => g.minterms.every((r) => !ones.has(r))), "no 1 in a POS group");
  assert(m.expression.includes(")"), m.expression);
  assertEquals(m.kind, "pos");
});

Deno.test("don't cares: a group may use an X cell, the cell is listed, and the form agrees with every row that is not an X", () => {
  let s = blank(["A", "B", "C"], ["F"]);
  for (const [r, ch] of [[1, "1"], [3, "1"], [5, "-"], [7, "-"]]) s = setCell(s, 0, r, ch);   // F = Σm(1,3) + d(5,7)
  const m = mapOf(s, 0, "sop", 0);
  assertEquals(m.expression, "C");
  assertEquals(m.dontCaresUsed, [5, 7]);
  assertEquals(m.groups[0].dontCaresUsed, [5, 7]);
  assert(verifyCover(s.variables, s.outputs[0].table, m.expression, "sop").ok);
});

Deno.test("every cover of random 2 to 4 variable tables with X: SOP covers the 1s and never a 0, POS covers the 0s and never a 1, groups are rectangles of 1, 2, 4, 8 or 16", () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 80; i++) {
    const n = 2 + rnd(3), vars = ["A", "B", "C", "D"].slice(0, n);
    const table = [...Array(1 << n)].map(() => "01-"[rnd(3)]).join("");
    const s = { variables: vars, outputs: [{ name: "F", table }] };
    for (const kind of ["sop", "pos"]) {
      for (let c = 0; c < coverCount(s, 0, kind); c++) {
        const m = mapOf(s, 0, kind, c);
        assert(!m.error, `${table} ${kind}: ${m.error}`);
        const want = kind === "sop" ? "1" : "0", never = kind === "sop" ? "0" : "1";
        const covered = new Set(m.groups.flatMap((g) => g.minterms));
        for (let r = 0; r < table.length; r++) {
          if (table[r] === want) assert(covered.has(r), `${table} ${kind} misses row ${r}`);
          if (table[r] === never) assert(!covered.has(r), `${table} ${kind} covers a ${never} at row ${r}`);
        }
        for (const g of m.groups) assert([1, 2, 4, 8, 16].includes(g.size) && g.size === g.rects.reduce((k, r) => k + r.rows * r.cols, 0), `${table} group ${g.cube}`);
      }
    }
  }
});

Deno.test("two equally small covers are both offered; the count matches the library", () => {
  const s = { variables: ["A", "B", "C"], outputs: [{ name: "F", table: "11100111" }] };
  assertEquals(coverCount(s, 0, "sop"), 2);
  const a = mapOf(s, 0, "sop", 0), b = mapOf(s, 0, "sop", 1);
  assert(a.expression !== b.expression);
  assertEquals([a.covers, b.coverIndex], [2, 1]);
});

Deno.test("constants and one variable: all zeros has no group in SOP, all ones is one group of everything", () => {
  assertEquals(mapOf(st("F = AA'"), 0, "sop", 0).groups, []);
  const one = mapOf(st("F = A + A'", ["A", "B"]), 0, "sop", 0);
  assertEquals([one.groups.length, one.groups[0].size, one.expression], [1, 4, "1"]);
  assertEquals(mapOf(st("F = A'"), 0, "sop", 0).cells.flat().map((c) => c.value), ["1", "0"]);
});

Deno.test("verifyCover catches a form that disagrees with the table and ignores X rows", () => {
  assert(!verifyCover(["A", "B"], "0110", "A + B", "sop").ok);
  assertEquals(verifyCover(["A", "B"], "0110", "A + B", "sop").rows, [3]);
  assert(verifyCover(["A", "B"], "01-0", "A'B", "sop").ok);
  assert(verifyCover(["A", "B"], "0110", "AB' + A'B", "sop").ok);
});
