// L5.2: verdict and truth tables from a typed circuit or expressions. Run: quarto run tools/logic/analyze/test/run.js
import { analyseText, CAP, detect } from "../src/analyze.js";

const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const assertEquals = (a, b, m = "") => assert(JSON.stringify(a) === JSON.stringify(b), `${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const example = (name) => Deno.readTextFileSync(new URL(`../model/examples/${name}.json`, import.meta.url));

Deno.test("the cap is the pinned model's limit", () => { assertEquals(CAP, 8); });
Deno.test("text that starts with { is a circuit, anything else is expressions", () => {
  assertEquals([detect(' {"a":1}'), detect("Y = A"), detect("")], ["circuit", "expressions", "expressions"]);
});

Deno.test("a full adder drawn from gates is combinational and has a table of 8 rows for Sum and Cout", () => {
  const r = analyseText(example("full_adder_gates"));
  assert(r.verdict.combinational, "combinational");
  assertEquals(r.groups.length, 1);
  const g = r.groups[0];
  assertEquals(g.rows.length, 8);
  assert(g.outputs.length === 2 && g.inputs.length === 3, "3 inputs, 2 outputs");
  // 1 + 1 + 0 = 10 in binary: the carry is 1 and the sum is 0 on that row, whatever the pins are called.
  const row = g.rows.find((x) => x.inputs.join("") === "110");
  assertEquals(row.outputs.slice().sort(), ["0", "1"]);
  assertEquals(g.dontCares, 0);
});
Deno.test("a bus keeps its bit names: the 2-bit comparator shows bit numbers in brackets", () => {
  const r = analyseText(example("comparator_2bit"));
  assert(r.verdict.combinational);
  const shown = r.groups[0].inputs.map((i) => i.shown);
  assert(shown.some((s) => /\[\d\]/.test(s)), `bit names in ${shown}`);
});
Deno.test("a NAND SR latch is not combinational: the reason names a loop", () => {
  const r = analyseText(example("nand_sr_latch"));
  assert(!r.verdict.combinational);
  assert(r.verdict.reasons.some((x) => x.kind === "loop"), JSON.stringify(r.verdict.reasons));
});
Deno.test("a flip-flop is sequential, gets no table, and the verdict says so", () => {
  const r = analyseText(example("d_flipflop"));
  assert(!r.verdict.combinational && r.verdict.sequential);
  assertEquals(r.groups, []);
});
Deno.test("expressions: one line per output, shared inputs, table in order", () => {
  const r = analyseText("S = A ^ B\nC = AB");
  assert(r.verdict.combinational);
  const g = r.groups[0];
  assertEquals(g.inputs.map((i) => i.id), ["A", "B"]);
  assertEquals(g.outputs.map((o) => o.id), ["S", "C"]);
  assertEquals(g.rows.map((x) => x.outputs.join("")), ["00", "10", "10", "01"]);
});
Deno.test("expressions: mistakes give a message naming the line, never a throw", () => {
  assert(/Line 2/.test(analyseText("Y = A\nB + C").error));
  assert(/Line 1/.test(analyseText("Y = A +").error));
  assert(/not valid JSON/.test(analyseText("{ nope").error));
  assert(/at most 8/.test(analyseText("Y = " + "ABCDEFGHI".split("").join("+")).error));
});
Deno.test("an empty editor is not an error", () => { assert(analyseText("   ").empty); });
