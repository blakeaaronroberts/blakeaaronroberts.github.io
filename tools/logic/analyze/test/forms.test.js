// L5.3 to L5.6: forms, export text, and checking an answer. Run: quarto run tools/logic/analyze/test/run.js
import { analyseText } from "../src/analyze.js";
import { formsOf } from "../src/forms.js";
import { circuitFile, csv, functionFile, latexEquations, latexTable, markdown, verilogAssign } from "../src/export.js";
import { checkAnswer, parseExpected } from "../src/check.js";
import { circuitToFunctions } from "../model/analyze/index.mjs";

const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const assertEquals = (a, b, m = "") => assert(JSON.stringify(a) === JSON.stringify(b), `${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const example = (name) => Deno.readTextFileSync(new URL(`../model/examples/${name}.json`, import.meta.url));
const forms = (text) => analyseText(text).groups.flatMap((g) => g.forms);

Deno.test("minterms and maxterms of a full adder's sum: Σm(1,2,4,7) and ΠM(0,3,5,6)", () => {
  const [s] = forms("S = A ^ B ^ C");
  assertEquals([s.ones, s.zeros], [[1, 2, 4, 7], [0, 3, 5, 6]]);
  assertEquals([s.sigma, s.pi], ["Σm(1, 2, 4, 7)", "ΠM(0, 3, 5, 6)"]);
  assertEquals([s.canonical.sop.terms, s.canonical.pos.terms], [4, 4]);
});

Deno.test("the smallest form is not the canonical one: AB + AB' reduces to A, one term and one literal", () => {
  const [f] = forms("Y = AB + AB'");
  assertEquals(f.canonical.sop.terms, 2);
  assertEquals(f.minimal.sop.map((x) => [x.text, x.terms, x.literals]), [["A", 1, 1]]);
  assertEquals(f.minimal.pos.map((x) => x.text), ["A"]);
});

Deno.test("when two forms are equally small, both are listed (A'B + BC + AC' and A'B + AC' + ... style cover)", () => {
  // The classic cyclic function: f = Σm(1,3,4,6)... use a known two-cover function of three variables.
  const [f] = forms("Y = A'B' + BC + AC'");
  assert(f.minimal.sop.length === 2, `two minimal SOP covers, got ${f.minimal.sop.map((x) => x.text)}`);
  const costs = new Set(f.minimal.sop.map((x) => `${x.terms}/${x.literals}`));
  assertEquals(costs.size, 1, "equal cost");
  assertEquals(f.problems, []);
});

Deno.test("every form shown agrees with the table, for every output of the BCD to 7-segment decoder", () => {
  const r = analyseText(example("bcd_to_7seg"));
  assert(r.verdict.combinational);
  const all = r.groups.flatMap((g) => g.forms);
  assertEquals(all.length, 7);
  for (const f of all) { assert(!f.error, f.error); assertEquals(f.problems, [], f.name); }
});

Deno.test("best pick: the cheaper of minimal SOP and POS; a tie says so", () => {
  assertEquals(forms("Y = AB + CD")[0].best, "sop");         // AND-OR: 6 gate inputs against 12 for the POS
  assert(["sop", "pos", "tie"].includes(forms("Y = A ^ B")[0].best));
  assertEquals(forms("Y = (A + B)(C + D)")[0].best, "pos");
  assertEquals(forms("Y = A + B")[0].best, "tie");           // one OR gate either way
});

Deno.test("constant outputs have forms: 0 and 1", () => {
  const [z] = forms("Y = AA'");
  assertEquals([z.canonical.sop.text, z.minimal.sop[0].text, z.minimal.pos[0].text], ["0", "0", "0"]);
  const [o] = forms("Y = A + A'");
  assertEquals(o.minimal.sop[0].text, "1");
});

Deno.test("LaTeX: a tabular with one column per bit, and aligned equations with the term counts", () => {
  const r = analyseText("S = A ^ B\nC = AB");
  const t = latexTable(r.groups[0], r);
  assert(t.startsWith("\\begin{tabular}{cc|cc}") && t.includes("$A$ & $B$ & $S$ & $C$ \\\\") && t.trimEnd().endsWith("\\end{tabular}"), t);
  const e = latexEquations(r.groups[0].forms);
  assert(e.includes("\\begin{aligned}") && e.includes("\\text{canonical SOP, 2 terms}") && e.includes("\\sum m(1, 2)"), e);
  const all = latexEquations(r.groups[0].forms, { all: true });
  assertEquals(all.split("\\begin{aligned}").length, 2, "one combined block");
});

Deno.test("Markdown, CSV and function files carry the table and the forms", () => {
  const r = analyseText("S = A ^ B\nC = AB");
  assertEquals(csv(r.groups[0]), "A,B,S,C\n0,0,0,0\n0,1,1,0\n1,0,1,0\n1,1,0,1\n");
  const md = markdown(r);
  assert(md.includes("| A | B | S | C |") && md.includes("Minimal SOP (2 terms, 4 literals)") && md.includes("Verdict:** combinational"), md);
  const fn = JSON.parse(functionFile(r.groups[0].functions[0]));
  assertEquals([fn.schema, fn.output, fn.table], ["function/0.1", "S", "0110"]);
});

Deno.test("Verilog assign for the minimal SOP and POS", () => {
  const r = analyseText("Y = A'B + C");
  const f = r.groups[0].forms[0], fn = r.groups[0].functions[0];
  assertEquals(verilogAssign(f, f.minimal.sop[0], fn, r), "assign Y = (~A & B) | C;");
  assertEquals(verilogAssign(f, f.minimal.pos[0], fn, r, "pos"), "assign Y = (~A | C) & (B | C);");
});

Deno.test("the minimal form's circuit gives the same table when analysed again", () => {
  const r = analyseText("Y = A'B + BC + AC'");
  const f = r.groups[0].forms[0], fn = r.groups[0].functions[0];
  const c = circuitFile(fn, f.minimal.sop[0]);
  assert(c.text, c.error);
  const again = circuitToFunctions(JSON.parse(c.text));
  assert(again.verdict.combinational, JSON.stringify(again.verdict));
  assertEquals(again.functions[0].table, fn.table);
});

Deno.test("check my answer: expressions and compact tables; first differing rows are listed", () => {
  const r = analyseText("Y = A ^ B");
  assert(checkAnswer(r, "Y = A'B + AB'").results[0].equal, "equal expressions");
  assert(checkAnswer(r, "Y(A,B) = 0110").results[0].equal, "equal compact table");
  const bad = checkAnswer(r, "Y(A,B) = 0111").results[0];
  assertEquals([bad.equal, bad.total, bad.rows[0].values, bad.rows[0].yours, bad.rows[0].expected], [false, 1, { A: "1", B: "1" }, "0", "1"]);
  assert(checkAnswer(r, "Q = A").results[0].problem.includes("no output called Q"));
  assert(/inputs need 4 table digits/.test(parseExpected("Y(A,B) = 011").error));
});

Deno.test("check my answer against a circuit (C17.5): a full adder and a wrong carry", () => {
  const r = analyseText(example("full_adder_gates"));
  const outs = r.groups[0].outputs.map((o) => o.shown);
  const sum = outs.find((n) => /^s/i.test(n)) ?? outs[0];
  const good = checkAnswer(r, `${sum} = A ^ B ^ C`);   // the inputs are A, B, C in expressions (C is Cin)
  assert(good.results[0].equal === true, JSON.stringify(good));
  const wrong = checkAnswer(r, `${sum} = A ^ B`);   // ignores the third input
  assert(wrong.results[0].equal === false && wrong.results[0].total === 4, JSON.stringify(wrong));
});
