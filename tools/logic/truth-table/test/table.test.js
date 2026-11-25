// L1.1: truth table generator core. Run: quarto run tools/logic/truth-table/test/run.js
import { CAP, parseVariableList, fromExpressions, blank, nextCell, setCell, setVariables, setOutputNames, addOutput, removeOutput, groupOf, listsOf, toFunctions, fromFunctions, markdownTable, latexTable, csvTable, shownCell } from "../src/table.js";
import { evaluate, parse } from "../../analyze/model/logic/index.mjs";

const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const assertEquals = (a, b, m = "") => assert(JSON.stringify(a) === JSON.stringify(b), `${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const schema = JSON.parse(Deno.readTextFileSync(new URL("../../analyze/model/schema/function.schema.json", import.meta.url)));

Deno.test("XOR has the table 0110 and a bare expression is called F", () => {
  const r = fromExpressions("A ^ B");
  assertEquals(r.state.variables, ["A", "B"]);
  assertEquals(r.state.outputs.map((o) => [o.name, o.table]), [["F", "0110"]]);
});
Deno.test("every row of every table agrees with evaluating the expression directly", () => {
  for (const text of ["M = AB + AC + BC", "Y = (A + B')(C ^ D)", "Z = A1 + A0'B", "T = ((A'))"]) {
    const { state } = fromExpressions(text);
    const e = parse(text.split("=").pop());
    const n = state.variables.length;
    for (let r = 0; r < 1 << n; r++) {
      const env = Object.fromEntries(state.variables.map((v, i) => [v, (r >> (n - 1 - i)) & 1]));
      assertEquals(state.outputs[0].table[r], String(evaluate(e, env)), `${text} row ${r}`);
    }
  }
});
Deno.test("several outputs share one set of inputs, in letter-then-number order", () => {
  const r = fromExpressions("S = A ^ B\nC = AB\nD = A0 + B\n");
  assertEquals(r.state.variables, ["A", "A0", "B"]);
  assertEquals(r.state.outputs.map((o) => o.name), ["S", "C", "D"]);
  assertEquals(r.state.outputs.map((o) => o.table.length), [8, 8, 8]);
});
Deno.test("an input list fixes the order and may name an input no expression uses", () => {
  const r = fromExpressions("F = A", { variables: ["B", "A"] });
  assertEquals(r.state.outputs[0].table, "0101");   // B is the most significant bit, so F = A alternates
  assert(fromExpressions("F = AC", { variables: ["A", "B"] }).error.includes("C"));
});
Deno.test("bad lines give a message with the line number, never a throw", () => {
  assert(fromExpressions("F = A +").error.startsWith("Line 1:"));
  assert(fromExpressions("F = A\nG? = B").error.startsWith("Line 2:"));
  assert(fromExpressions("F = A\nF = B").error.includes("Two lines"));
  assert(fromExpressions("   \n").empty);
});
Deno.test("a constant has a table with one input so there is a row to show", () => {
  const r = fromExpressions("F = 1");
  assertEquals(r.state.outputs[0].table, "11");
});
Deno.test("more than the model's cap of inputs is refused with a message", () => {
  const names = [...Array(CAP + 1)].map((_, i) => `X${i}`);
  assert(fromExpressions(`F = ${names.join(" + ")}`).error.includes(String(CAP)));
  assert(parseVariableList(names.join(" ")).error.includes("too many"));
});
Deno.test("variable lists are validated", () => {
  assertEquals(parseVariableList("A, B  C1").variables, ["A", "B", "C1"]);
  assert(parseVariableList("A A").error.includes("same"));
  assert(parseVariableList("AB").error.includes("not an input name"));
  assert(parseVariableList("  ").error);
});

Deno.test("hand entry: cells step 0, 1, don't care, 0, and only the changed cell moves", () => {
  assertEquals(["0", "1", "-"].map(nextCell), ["1", "-", "0"]);
  const s = setCell(blank(["A", "B"], ["F", "G"]), 1, 2, "1");
  assertEquals(s.outputs.map((o) => o.table), ["0000", "0010"]);
});
Deno.test("changing the inputs: a rename keeps the columns, a new count starts them over", () => {
  const s = setCell(blank(["A", "B"]), 0, 3, "1");
  assertEquals(setVariables(s, ["X", "Y"]).outputs[0].table, "0001");
  assertEquals(setVariables(s, ["X", "Y", "Z"]).outputs[0].table, "00000000");
});
Deno.test("outputs can be added, renamed and removed, and the last one stays", () => {
  let s = addOutput(blank(["A"], ["F"]), "");
  assertEquals(s.outputs.map((o) => o.name), ["F", "F1"]);
  assert(setOutputNames(s, ["Y", "Y"]).error);
  assert(setOutputNames(s, ["Y", "9"]).error);
  s = setOutputNames(s, ["Y", "Z"]).state;
  assertEquals(removeOutput(removeOutput(s, 1), 0).outputs.map((o) => o.name), ["Y"]);
});

Deno.test("the group has one column per input and output, with don't cares counted", () => {
  const s = setCell(fromExpressions("F = A ^ B").state, 0, 0, "-");
  const g = groupOf(s);
  assertEquals(g.rows.map((r) => r.outputs[0]), ["-", "1", "1", "0"]);
  assertEquals(g.rows[2].inputs, [1, 0]);
  assertEquals(g.dontCares, 1);
});
Deno.test("minterm and maxterm lists come from the library", () => {
  assertEquals(listsOf(fromExpressions("F = A ^ B").state), [{ name: "F", sigma: "Σm(1, 2)", pi: "ΠM(0, 3)" }]);
  assertEquals(listsOf(setCell(fromExpressions("F = A ^ B").state, 0, 0, "-"))[0].sigma, "Σm(1, 2) + d(0)");
});

Deno.test("function files: one per output, valid against the schema, and they read back to the same table", () => {
  const state = setCell(fromExpressions("S = A ^ B\nC = AB").state, 1, 0, "-");
  const fns = toFunctions(state, schema);
  assertEquals(fns.map((f) => [f.schema, f.id, f.output, f.table]), [["function/0.1", "S", "S", "0110"], ["function/0.1", "C", "C", "-001"]]);
  const back = fromFunctions(JSON.parse(JSON.stringify(fns)), schema);
  assertEquals(back.state.variables, ["A", "B"]);
  assertEquals(back.state.outputs.map((o) => [o.name, o.table]), [["S", "0110"], ["C", "-001"]]);
});
Deno.test("a function file with a wrong expression, or inputs that differ, is refused with a reason", () => {
  const good = toFunctions(fromExpressions("F = AB").state, schema)[0];
  assert(fromFunctions([{ ...good, sop: "A'" }], schema).error.includes("sop"));
  const other = toFunctions(fromExpressions("G = BC").state, schema)[0];
  assert(fromFunctions([good, other], schema).error.includes("differ"));
  assert(fromFunctions([{ nonsense: true }], schema).error);
  assert(fromFunctions([], schema).error);
});

Deno.test("copy formats: Markdown, LaTeX tabular and CSV carry every row and column", () => {
  const s = fromExpressions("S = A ^ B\nC = AB").state;
  const md = markdownTable(s).trim().split("\n");
  assertEquals(md[0], "| A | B | S | C |");
  assertEquals(md.length, 2 + 4);
  assertEquals(md[5], "| 1 | 1 | 0 | 1 |");
  const tex = latexTable(s);
  assert(tex.includes("\\begin{tabular}{cc|cc}") && tex.includes("1 & 1 & 0 & 1 \\\\"), tex);
  assertEquals(csvTable(s).trim().split("\n")[0], "A,B,S,C");
});

Deno.test("a don't care is stored as - (the function format) and shown as X everywhere", () => {
  const s = setCell(fromExpressions("F = A ^ B").state, 0, 0, "-");
  assertEquals(shownCell("-"), "X");
  assert(markdownTable(s).includes("| 0 | 0 | X |"));
  assert(latexTable(s).includes("0 & 0 & X \\\\"), latexTable(s));
  assert(csvTable(s).includes("0,0,X"));
  assertEquals(toFunctions(s, schema)[0].table, "-110");
});
