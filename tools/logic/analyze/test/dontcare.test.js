// A don't care is stored as "-" (function/0.1) and shown as X, in the table, Markdown, LaTeX and CSV.
import { latexTable, csv, markdown, shownCell } from "../src/export.js";

const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const g = { inputs: [{ id: "A", shown: "A" }], outputs: [{ id: "Y", shown: "Y" }], rows: [{ index: 0, inputs: [0], outputs: ["-"] }, { index: 1, inputs: [1], outputs: ["1"] }], dontCares: 1 };
const r = { title: "t", verdict: { combinational: true, reasons: [] }, groups: [{ ...g, forms: [] }] };

Deno.test("shownCell turns the stored - into X and leaves 0 and 1", () => {
  assert(shownCell("-") === "X" && shownCell("0") === "0" && shownCell("1") === "1");
});
Deno.test("LaTeX, CSV and Markdown show X for a don't care, never – or $-$", () => {
  assert(latexTable(g, r).includes("0 & X \\\\"), latexTable(g, r));
  assert(!latexTable(g, r).includes("$-$"));
  assert(csv(g).includes("0,X"), csv(g));
  const md = markdown(r);
  assert(md.includes("| 0 | X |") && !md.includes("–"), md);
  assert(md.includes("shown as X"), md);
});

import { checkAnswer } from "../src/check.js";
import { analyseText } from "../src/analyze.js";
Deno.test("an expected table may write a don't care as X or -, and either matches anything", () => {
  const last = analyseText("Y = A ^ B\n");
  for (const t of ["Y(A,B) = 0X10", "Y(A,B) = 0x10", "Y(A,B) = 0-10"]) {
    const c = checkAnswer(last, t);
    assert(!c.error && c.results[0].equal, `${t}: ${JSON.stringify(c).slice(0, 200)}`);
  }
});
