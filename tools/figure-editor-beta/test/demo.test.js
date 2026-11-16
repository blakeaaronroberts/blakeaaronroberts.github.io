// The starting full adder: levels computed from its gates match the truth table, for every frame and in the timing waves.

import { parse } from "../src/doc.js";
import { parseTruthTable, truthTable } from "../src/demo.js";
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

Deno.test("pasted full-adder table creates timing waves and checks every output case", () => {
  const table = [
    "A,B,Cin,S,Cout",
    "0,0,0,0,0", "0,0,1,1,0", "0,1,0,1,0", "0,1,1,0,1",
    "1,0,0,1,0", "1,0,1,0,1", "1,1,0,0,1", "1,1,1,1,1",
  ].join("\n");
  const result = parseTruthTable(table, fa, pack);
  assertEquals(result.frames.length, 8);
  assert(result.checks.every((item) => item.pass), "all eight rows match the circuit");
  assertEquals(result.timing.signal.filter((signal) => signal.name).map((signal) => signal.name), ["A", "B", "Cin", "S", "Cout"]);
  assertEquals(result.checks[0].outputs, [
    { name: "S", expected: "0", actual: "0", pass: true },
    { name: "Cout", expected: "0", actual: "0", pass: true },
  ]);
});

Deno.test("pasted truth tables report mismatches and reject incomplete or malformed cases", () => {
  const header = "A,B,Cin,S,Cout\n";
  const rows = [
    "0,0,0,1,0", "0,0,1,1,0", "0,1,0,1,0", "0,1,1,0,1",
    "1,0,0,1,0", "1,0,1,0,1", "1,1,0,0,1", "1,1,1,1,1",
  ];
  const result = parseTruthTable(header + rows.join("\n"), fa, pack);
  assert(!result.checks[0].pass, "a wrong expected output fails");
  assertEquals(result.checks[0].outputs[0], { name: "S", expected: "1", actual: "0", pass: false });
  let error;
  try { parseTruthTable(header + rows.slice(0, -1).join("\n"), fa, pack); } catch (e) { error = e; }
  assert(/Expected all 8 cases/.test(error?.message), "incomplete coverage is rejected");
  error = null;
  try { parseTruthTable(header + rows.slice(0, 7).concat("1,1,1,2,1").join("\n"), fa, pack); } catch (e) { error = e; }
  assert(/only 0 or 1/.test(error?.message), "non-binary table entries are rejected");
});
