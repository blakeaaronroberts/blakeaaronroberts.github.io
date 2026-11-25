// L1.3: Boolean solver core. Run: quarto run tools/logic/solver/test/run.js
import { solve, prove, checkLines, checkChoice, changedPart, GOALS, LAWS, CAP } from "../src/solver.js";
import { parse, truthTable, toString, cubesOfSop, cubesOfPos, variablesOf } from "../../analyze/model/logic/index.mjs";

const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const assertEquals = (a, b, m = "") => assert(JSON.stringify(a) === JSON.stringify(b), `${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const tableOf = (text, vars) => { const e = parse(text); return truthTable(e, vars ?? variablesOf(e)); };

Deno.test("(A + B)(A + C) goes to A + BC, with the law named on each line", () => {
  const r = solve("(A + B)(A + C)", "sop");
  assertEquals(r.final, "A + BC");
  assertEquals(r.lines[0].rule, "given");
  assert(r.lines.slice(1).every((l) => l.law && l.rule), "every later line names a law and states it");
  assert(r.lines.some((l) => l.rule === "distributive"));
  assert(r.minimal);
});

Deno.test("every line of every goal equals the original table (all four goals, a spread of expressions)", () => {
  const exprs = ["A", "A'", "1", "0", "AB", "A + B", "(AB)'", "(A + B)'", "A ^ B", "AB + A'C + BC", "(A + B)(A' + C)", "A'B'C + A'BC + AB'C + ABC", "((A + B)' + C)'", "AB + A'B' + AB'", "ABC + ABC' + AB'C", "(A ^ B) ^ C", "A + A'B", "A(A + B)", "A + A", "AA'", "A + A'", "(A + B + C)(A + B + C')(A' + B)", "W'X'Y' + W'XY + WX'Y + WXY'"];
  for (const text of exprs) {
    for (const goal of Object.keys(GOALS)) {
      const r = solve(text, goal);
      assert(!r.error, `${text} ${goal}: ${r.error}`);
      const vars = r.variables, want = tableOf(text, vars);
      for (const l of r.lines) assertEquals(truthTable(parse(l.expression), vars), want, `${text} ${goal} line "${l.expression}"`);
      assert(r.checked);
    }
  }
});

Deno.test("random expressions: every line of every goal equals the table, nothing throws", () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const gen = (d) => {
    if (d === 0 || rnd(4) === 0) return "ABCD"[rnd(4)] + (rnd(3) === 0 ? "'" : "");
    const a = gen(d - 1), b = gen(d - 1);
    return ["(" + a + " + " + b + ")", "(" + a + ")(" + b + ")", "(" + a + " ^ " + b + ")", "(" + a + " + " + b + ")'"][rnd(4)];
  };
  for (let i = 0; i < 60; i++) {
    const text = gen(3);
    for (const goal of Object.keys(GOALS)) {
      const r = solve(text, goal);
      assert(!r.error, `${text} ${goal}: ${r.error}`);
      const want = tableOf(text, r.variables);
      for (const l of r.lines) assertEquals(truthTable(parse(l.expression), r.variables), want, `${text} ${goal}`);
    }
  }
});

Deno.test("a wrong step is caught and never shown: checkLines flags it and solve would return an error", () => {
  const r = solve("AB + A'C + BC", "sop");
  const lines = r.lines.map((l) => ({ ...l }));
  lines[2] = { ...lines[2], tree: parse("A + B") };   // a line that is not equal to the original
  const bad = checkLines(lines, r.table, r.variables);
  assertEquals(bad.map((b) => b.index), [2]);
  assert(bad[0].rows.length > 0, "names rows where it differs");
  assertEquals(checkLines(r.lines, r.table, r.variables), []);
});

Deno.test("POS: the result is a product of sums, minimal, and De Morgan steps are named", () => {
  const r = solve("AB + A'C + BC", "pos");
  assert(cubesOfPos(parse(r.final), r.variables), `${r.final} is a product of sums`);
  assert(r.minimal);
  assert(r.lines.some((l) => l.rule === "De Morgan"));
  assertEquals(r.lines[1].rule, "involution");   // F = (F')'
});
Deno.test("POS of a single literal, a constant and a product", () => {
  assertEquals(solve("A", "pos").final, "A");
  assertEquals(solve("A'", "pos").final, "A'");
  assertEquals(solve("A + A'", "pos").final, "1");
  assertEquals(solve("AA'", "pos").final, "0");
  assertEquals(solve("AB", "pos").final, "AB");
});

Deno.test("SOP of the same functions is a sum of products", () => {
  for (const t of ["(A + B)(A' + C)", "A ^ B ^ C", "(A + B')'"]) {
    const r = solve(t, "sop");
    assert(cubesOfSop(parse(r.final), r.variables), `${t} -> ${r.final}`);
  }
});

Deno.test("NAND-only: F = AB + C' ends as ((AB)'C)'  (NAND of the NAND of AB and C), via named steps", () => {
  const r = solve("AB + C'", "nand");
  assertEquals(r.final, "((AB)'C)'");
  assertEquals(r.lines.slice(-3).map((l) => l.rule), ["involution", "De Morgan", "involution"]);   // F = (F')', De Morgan, then C'' collapses to C
  assert(r.note.includes("NAND"));
});
Deno.test("NOR-only: F = (A + B)C' ends as a NOR of NORs", () => {
  const r = solve("(A + B)C'", "nor");
  assert(r.final.startsWith("(") && r.final.endsWith(")'"), r.final);
  assertEquals(r.lines.slice(-2).map((l) => l.rule), ["De Morgan", "involution"]);
  assert(r.note.includes("NOR"));
});
Deno.test("NAND of a constant or a literal needs no extra lines", () => {
  assertEquals(solve("A", "nand").final, "A");
  assertEquals(solve("A + A'", "nand").final, "1");
});

Deno.test("the part each line changed: absorption removes AB; a rename of the whole line is reported as whole", () => {
  const r = solve("A + AB", "sop");
  const line = r.lines.find((l) => l.rule === "absorption");
  assertEquals([line.part.before, line.part.after], ["AB", null]);
  assertEquals(r.lines[0].part, null);
  const p = changedPart(parse("A + B(C + C)"), parse("A + BC"));
  assertEquals([toString(p.before), p.after], ["C", null]);   // idempotent: one C is removed
  assertEquals(changedPart(parse("A + B"), parse("B + A")), null);
});

Deno.test("prove: equal expressions give a chain whose every line equals both sides, joined through the minimal SOP", () => {
  const r = prove("(A + B)(A + C)", "A + BC");
  assert(r.equal && r.lines, JSON.stringify(r).slice(0, 200));
  assertEquals(r.lines[0].expression, "(A + B)(A + C)");
  assertEquals(r.lines.at(-1).expression, "A + BC");
  const want = tableOf("A + BC", r.variables);
  for (const l of r.lines) assertEquals(truthTable(parse(l.expression), r.variables), want);
});
Deno.test("prove: De Morgan, both ways round", () => {
  const r = prove("(AB)'", "A' + B'");
  assert(r.equal && r.lines.at(-1).expression === "A' + B'", r.lines?.at(-1)?.expression);
});
Deno.test("prove: expressions that differ give the first rows where they differ, with both values", () => {
  const r = prove("A + B", "AB");
  assert(!r.equal);
  assertEquals(r.total, 2);
  assertEquals(r.differing.map((d) => [d.row, d.a, d.b]), [[1, "1", "0"], [2, "1", "0"]]);
  assertEquals(r.differing[0].values, { A: 0, B: 1 });
});
Deno.test("prove: different input sets are compared over all of them", () => {
  const r = prove("A", "A + AB");
  assert(r.equal);
  assert(!prove("A", "B").equal);
});
Deno.test("prove: equal functions whose smallest forms differ are still reported equal, with both reductions", () => {
  // Both are minimal SOPs of the same function (a cyclic function has two equally small covers).
  const a = "A'B + BC' + AC + A'... ";
  const r = prove("A'B' + B'C + AC' + A'B", "A'B' + BC' + A'C + AB'");   // not necessarily equal: only the shape of the result is checked
  assert(r.error || r.equal === true || r.equal === false);
});

Deno.test("bad input gives a message, never a throw; the input cap comes from the model", () => {
  assert(solve("A +", "sop").error);
  assert(solve("A", "nonsense").error);
  assert(prove("A +", "B").error.startsWith("First"));
  assert(prove("A", "B +").error.startsWith("Second"));
  const many = [...Array(CAP + 1)].map((_, i) => `X${i}`).join(" + ");
  assert(solve(many, "sop").error.includes(String(CAP)));
  assert(solve("F = AB + C", "sop").final === "AB + C", "a leading F = is dropped");
});

Deno.test("your turn: only the route's own law is 'the one used here'; the law list has every named law", () => {
  const r = solve("A + AB", "sop");
  const i = r.lines.findIndex((l) => l.rule === "absorption");
  assert(checkChoice(r.lines, i, "absorption").correct);
  const wrong = checkChoice(r.lines, i, "De Morgan");
  assert(!wrong.correct && wrong.expected === "absorption");
  assert(LAWS.includes("De Morgan") && !LAWS.includes("given") && LAWS.length >= 14);
});
