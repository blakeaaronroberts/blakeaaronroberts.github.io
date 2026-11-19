import { sequentialStep } from "../src/sequential.js";

const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const unexpected = (reason) => { throw new Error(`unexpected prompt: ${reason}`); };
const step = (type, input, previous, clock = null, choose = unexpected) =>
  sequentialStep(type, input, previous, clock, choose);

Deno.test("cross-coupled NAND and NOR latch set, reset, hold, and invalid", () => {
  equal(step("nand_latch", { A: "0", B: "1" }, null), { q: "1", qn: "0" });
  equal(step("nand_latch", { A: "1", B: "0" }, null), { q: "0", qn: "1" });
  equal(step("nand_latch", { A: "1", B: "1" }, "1"), { q: "1", qn: "0" });
  equal(step("nor_latch", { A: "1", B: "0" }, null), { q: "0", qn: "1" });
  equal(step("nor_latch", { A: "0", B: "1" }, null), { q: "1", qn: "0" });
  equal(step("nor_latch", { A: "0", B: "0" }, "0"), { q: "0", qn: "1" });
  equal(step("nand_latch", { A: "0", B: "0" }, "0", null, () => "X"), { q: "X", qn: "X" });
  equal(step("nor_latch", { A: "1", B: "1" }, "0", null, () => null), null);
});

Deno.test("D latch responds while enabled and holds while disabled", () => {
  equal(step("d_latch", { D: "1", CLK: "1" }, "0"), { q: "1", qn: "0" });
  equal(step("d_latch", { D: "1", CLK: "0" }, "0"), { q: "0", qn: "1" });
  equal(step("d_latch", { D: "1", CLK: "0" }, null, null, () => "1"), { q: "1", qn: "0" });
  equal(step("d_latch", { D: "X", CLK: "1" }, "0", null, () => null), null);
});

Deno.test("flip-flops act only on a rising edge between timing steps", () => {
  equal(step("d_flipflop", { D: "1", CLK: "1" }, "0"), { q: "0", qn: "1" });
  equal(step("d_flipflop", { D: "1", CLK: "1" }, "0", "0"), { q: "1", qn: "0" });
  equal(step("d_flipflop", { D: "1", CLK: "0" }, "0", "1"), { q: "0", qn: "1" });
  equal(step("d_flipflop", { D: "1", CLK: "1" }, "0", "X", () => "X"), { q: "X", qn: "X" });
  equal(step("t_flipflop", { T: "1", CLK: "1" }, "0", "0"), { q: "1", qn: "0" });
  equal(step("t_flipflop", { T: "0", CLK: "1" }, "1", "0"), { q: "1", qn: "0" });
  equal(step("jk_flipflop", { J: "1", K: "1", CLK: "1" }, "1", "0"), { q: "0", qn: "1" });
  equal(step("jk_flipflop", { J: "1", K: "0", CLK: "1" }, null, "0"), { q: "1", qn: "0" });
  equal(step("jk_flipflop", { J: "0", K: "1", CLK: "1" }, null, "0"), { q: "0", qn: "1" });
  equal(step("jk_flipflop", { J: "0", K: "0", CLK: "1" }, null, "0", () => null), null);
});
