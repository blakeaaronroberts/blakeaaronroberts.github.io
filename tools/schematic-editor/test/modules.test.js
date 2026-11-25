// F22.1a: the editors read and write circuit/0.4 (circuit-model C11.1, model-v0.12.0). `modules` is kept untouched, a
// block may carry params.module, and calculated levels run through module instances. The fixture is circuit-model's
// SystemVerilog demo (examples/sv_demo.json), copied by tag into tools/shared/test/model/.

import { parse, serialize } from "../src/doc.js";
import { normalizeBlock } from "../src/block.js";
import { resolveLogic } from "../src/simlevels.js";
import { setLevel } from "../src/doc.js";
import { checkCircuit } from "../../shared/test/model/formats.mjs";
import { assert, assertEquals, assertThrows, pack } from "./helpers.js";

const demoText = await Deno.readTextFile(new URL("../../shared/test/model/sv_demo.json", import.meta.url));
const schema = JSON.parse(await Deno.readTextFile(new URL("../../shared/test/model/circuit.schema.json", import.meta.url)));
const valid = (text) => { const r = checkCircuit(schema, JSON.parse(text)); return Array.isArray(r) ? r : r?.errors ?? []; };

Deno.test("circuit-model's demo (circuit/0.4) opens; modules are kept exactly as the file had them", () => {
  const raw = JSON.parse(demoText);
  const { doc } = parse(demoText);
  assertEquals(doc.modules, raw.modules);
  assertEquals(doc.elements.map((e) => e.params?.module), ["adder", "load_register"]);
});

Deno.test("saving the demo writes circuit/0.4 with modules in their place, passes the pinned validator, and is stable", () => {
  const first = serialize(parse(demoText).doc, pack);
  const raw = JSON.parse(first);
  assertEquals(raw.schema, "circuit/0.4");
  assertEquals(raw.modules, JSON.parse(demoText).modules);
  assertEquals(Object.keys(raw).indexOf("modules") > Object.keys(raw).indexOf("elements"), true);
  assertEquals(valid(first), []);
  assertEquals(serialize(parse(first).doc, pack), first);
});

Deno.test("a file without modules is still written as 0.2 or 0.3, never 0.4", () => {
  const { doc } = parse(demoText);
  const flat = { ...doc, modules: undefined };
  delete flat.modules;
  flat.elements = flat.elements.filter((e) => e.type !== "block"); flat.wires = []; flat.junctions = [];
  assert(["circuit/0.2", "circuit/0.3"].includes(JSON.parse(serialize(flat, pack)).schema));
});

Deno.test("an unknown schema is still refused, and the message now names 0.4", () => {
  assertThrows(() => parse(demoText.replace("circuit/0.4", "circuit/0.5")), /circuit\/0\.4/);
});

Deno.test("a block's params.module is kept; another unknown block param is still refused", () => {
  const ok = normalizeBlock({ shape: "rect", w: 4, h: 5, module: "adder", pins: { left: ["a"], right: ["y"] } });
  assertEquals(ok.module, "adder");
  assertThrows(() => normalizeBlock({ shape: "rect", w: 4, h: 5, mystery: 1 }), /mystery/);
  assertThrows(() => normalizeBlock({ shape: "rect", w: 4, h: 5, module: 3 }), /module/);
});

// Levels through module instances: a = 1, b = 2, so the adder inside the instance drives sum = 3 into the register.
Deno.test("calculated levels run through the module instances of the demo", () => {
  let { doc } = parse(demoText);
  const level = { clk: "0", load: "1", a1: "0", a0: "1", b1: "1", b0: "0" };
  for (const [port, v] of Object.entries(level)) doc = setLevel(doc, doc.wires.filter((w) => w.from === port).map((w) => w.id), v, [], pack);
  const out = resolveLogic(doc, pack);
  const at = (pinRef) => out.wires.find((w) => w.from === pinRef)?.level;
  assertEquals([at("add.sum2"), at("add.sum1"), at("add.sum0")], ["0", "1", "1"]);
});

// The register inside the instance loads the sum on a rising clock edge (circuit-model's demo trace: total = 3).
Deno.test("timing runs through instances: the register inside loads on the rising edge", async () => {
  const { calculateSteps } = await import("../src/simlevels.js");
  const { doc } = parse(demoText);
  const frame = (level) => Object.fromEntries(Object.entries(level).flatMap(([port, v]) => doc.wires.filter((w) => w.from === port).map((w) => [w.id, v])));
  const base = { load: "1", a1: "0", a0: "1", b1: "1", b0: "0" };
  const { results } = calculateSteps(doc, pack, [frame({ ...base, clk: "0" }), frame({ ...base, clk: "0" }), frame({ ...base, clk: "1" })]);
  const q = (i, ref) => results[i][doc.wires.find((w) => w.from === ref)?.id];
  assertEquals(["r.q2", "r.q1", "r.q0"].map((r) => q(1, r)), ["0", "1", "1"]);
  assertEquals(["r.q2", "r.q1", "r.q0"].map((r) => q(0, r)), ["X", "X", "X"], "before the edge the register has not loaded");
});
