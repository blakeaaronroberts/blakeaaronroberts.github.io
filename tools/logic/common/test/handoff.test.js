// L1.4: hand-off between the logic tools and into the Figure Editor. Run: quarto run tools/logic/common/test/run.js
import { circuitFor, expressionOfFunction, solverHref } from "../src/handoff.js";
import { analyseText } from "../../analyze/src/analyze.js";
import { fromExpression, parse, truthTable, variablesOf } from "../../analyze/model/logic/index.mjs";
import { fromExpressions, toFunctions } from "../../truth-table/src/table.js";
import { solve } from "../../solver/src/solver.js";

const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const assertEquals = (a, b, m = "") => assert(JSON.stringify(a) === JSON.stringify(b), `${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const schema = JSON.parse(Deno.readTextFileSync(new URL("../../analyze/model/schema/function.schema.json", import.meta.url)));

Deno.test("a function file stands for its own expression, else its smallest sum of products, else its canonical SOP", () => {
  const fn = fromExpression("AB + A'C + BC", { id: "F" });
  assertEquals(expressionOfFunction(fn), "AB + A'C + BC");
  const { expression, ...noExpr } = fn;
  assertEquals(expressionOfFunction(noExpr), fn.minimal.sop[0]);
  const { minimal, ...onlySop } = noExpr;
  assertEquals(expressionOfFunction(onlySop), fn.sop);
  assertEquals(expressionOfFunction({ schema: "function/0.1" }), null);
});

Deno.test("the circuit sent to the Figure Editor, analysed again, has the table of the function it came from", () => {
  for (const text of ["AB + A'C + BC", "A ^ B", "(A + B)(A' + C)", "A'"]) {
    const vars = variablesOf(parse(text));
    const c = circuitFor(text, { output: "Y", variables: vars });
    assert(c.text, c.error);
    const r = analyseText(c.text);
    assert(r.verdict.combinational, `${text} is combinational`);
    assertEquals(r.groups[0].functions[0].table, truthTable(parse(text), vars), text);
  }
});
Deno.test("an output named like an input is refused with a message, not a throw", () => {
  assert(circuitFor("AB", { output: "A", variables: ["A", "B"] }).error);
});

Deno.test("solver link: the expression is encoded and the goal is carried", () => {
  const href = solverHref("A'B + C", { goal: "pos" });
  const u = new URL(href, "https://x.test/tools/logic/truth-table/");
  assertEquals([u.pathname, u.searchParams.get("expr"), u.searchParams.get("goal")], ["/tools/logic/solver/", "A'B + C", "pos"]);
});

Deno.test("round trip across the tools: truth table -> function file -> solver result has the same table", () => {
  const { state } = fromExpressions("Y = (A + B)(A + C)");
  const fn = toFunctions(state, schema)[0];
  const r = solve(expressionOfFunction(fn), "sop");
  assertEquals(truthTable(parse(r.final), r.variables), fn.table);
  // ...and the solver's result written as a function file is valid and keeps the table.
  const back = fromExpression(r.final, { id: "Y", output: "Y", variables: r.variables });
  assertEquals(back.table, fn.table);
});

import { kmapHref } from "../src/handoff.js";
Deno.test("K-map link: carries the named expression and the kind; none for more than 4 inputs", () => {
  const u = new URL(kmapHref("A'B + C", { name: "Y", kind: "pos", variables: ["A", "B", "C"] }), "https://x.test/tools/logic/solver/");
  assertEquals([u.pathname, u.searchParams.get("expr"), u.searchParams.get("kind")], ["/tools/logic/kmap/", "Y = A'B + C", "pos"]);
  assertEquals(kmapHref("A + B + C + D + E", { variables: ["A", "B", "C", "D", "E"] }), null);
});
