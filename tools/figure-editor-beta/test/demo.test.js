// The starting full adder: levels computed from its gates match the truth table, for every frame and in the timing waves.

import { parse } from "../src/doc.js";
import { truthTable } from "../src/demo.js";
import { assert, assertEquals, pack } from "./helpers.js";

const fa = parse(await Deno.readTextFile(new URL("../examples/full-adder.json", import.meta.url))).doc;

Deno.test("full adder: S and Cout follow the truth table in all eight steps; every wire has a level in every frame", () => {
  const { frames, timing } = truthTable(fa, pack, ["A", "B", "Cin"], ["S", "Cout"]);
  assertEquals(frames.length, 8);
  const expand = (w) => { let p = ""; return [...w].map((c) => (c === "." ? p : (p = c))).join(""); };
  const wave = (n) => expand(timing.signal.find((s) => s.name === n).wave);
  for (let k = 0; k < 8; k++) {
    const a = (k >> 2) & 1, b = (k >> 1) & 1, c = k & 1;
    assertEquals(wave("S")[k], String(a ^ b ^ c), `S at ${k}`);
    assertEquals(wave("Cout")[k], String((a & b) | (a & c) | (b & c)), `Cout at ${k}`);
  }
  assertEquals(wave("A"), "00001111");
  for (const f of frames) assertEquals(Object.keys(f.levels).length, fa.wires.length, f.name);
  assert(frames.every((f) => !Object.values(f.levels).includes("X")), "no unknowns");
});
