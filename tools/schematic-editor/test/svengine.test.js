// F22.1c: the vendored Yosys engine (tools/shared/src/sv/third_party/yowasp/), loaded through the fetch wrapper exactly as the
// import Worker does it, imports behavioural code. Deno stands in for the Worker; the page and the real Worker are checked in the
// browser (F22.1c-2). Slow: it unpacks and compiles the 75 MB engine once (about 3 seconds).
//
// Order matters, and is the point: a structural import fetches nothing of the engine; a failed download is a problem with its line
// and the next try works; then demo.sv (always_ff) imports to exactly circuit-model's own examples/sv_demo.json.

import { importSystemVerilog } from "../../shared/src/sv/import/sv/index.mjs";
import { createBrowserEngines } from "../../shared/src/sv/import/sv/engines-browser.mjs";
import { ENGINE_FILES, installYowaspFetch } from "../../shared/src/yowasp-fetch.js";
import { assert, assertEquals } from "./helpers.js";

const here = new URL("../../shared/", import.meta.url);
const read = (p) => Deno.readTextFile(new URL(p, here));
const demo = await read("test/model/demo.sv");
const expected = JSON.parse(await read("test/model/sv_demo.json"));
const manifest = JSON.parse(await read("src/sv/third_party/yowasp/MANIFEST.json"));
const sizes = Object.fromEntries(manifest.files.map((f) => [f.name, f.bytes]));

const HALF = "module half(input logic a, b, output logic s, c);\n  xor g1(s, a, b);\n  and g2(c, a, b);\nendmodule\n";
const MUX = "module sel(input logic [1:0] d, input logic s, output logic y);\n  always_comb begin\n    if (s) y = d[1]; else y = d[0];\n  end\nendmodule\n";
const ENABLE = "module reg1(input logic clk, en, d, output logic q);\n  always_ff @(posedge clk) if (en) q <= d;\nendmodule\n";

// bundle.js takes the Node branch of its own fetch when it sees `process` (Deno has one), which reads plain files; the Worker has none.
const savedProcess = Object.getOwnPropertyDescriptor(globalThis, "process");
delete globalThis.process;
const realFetch = globalThis.fetch;
const asked = [];
let busy = false;
const events = [];
let ready = 0;
installYowaspFetch({
  sizes,
  onProgress: (e) => events.push(e),
  onReady: () => ready++,
  fetchImpl: async (url, init) => {
    asked.push(String(url).split("/").pop());
    return busy && /yosys/.test(String(url)) ? new Response("busy", { status: 503 }) : realFetch(url, init);
  },
});
const engines = createBrowserEngines({
  slangModule: new URL("sv/third_party/slang/slang.mjs", new URL("src/", here)).href,
  slangWasm: new URL("sv/third_party/slang/slang.wasm.gz", new URL("src/", here)).href,
  yosysModule: new URL("sv/third_party/yowasp/bundle.js", new URL("src/", here)).href,
});
const engineRequests = () => asked.filter((n) => /yosys|bundle/.test(n));

Deno.test("a structural import fetches nothing of the synthesis engine", async () => {
  const r = await importSystemVerilog({ "half.sv": HALF }, { top: "half", engines });
  assert(r.circuit && r.problems.length === 0, JSON.stringify(r.problems));
  assertEquals(engineRequests(), []);
});

Deno.test("a failed engine download is a problem with its line, and the next try works", async () => {
  busy = true;
  const r = await importSystemVerilog({ "demo.sv": demo }, { top: "demo", engines });
  busy = false;
  assertEquals(r.circuit, null);
  assertEquals(r.problems.length, 1);
  assertEquals([r.problems[0].file, r.problems[0].line, r.problems[0].construct], ["demo.sv", 25, "synthesis"]);
  assert(/synthesis engine could not be downloaded.*503/.test(r.problems[0].message), r.problems[0].message);
  assertEquals(ready, 0);
});

Deno.test("demo.sv (always_ff) imports to exactly circuit-model's sv_demo.json; the five files come once, progress adds up", async () => {
  asked.length = 0;
  events.length = 0;
  const r = await importSystemVerilog({ "demo.sv": demo }, { top: "demo", engines });
  assertEquals(r.problems, []);
  assertEquals(JSON.stringify(r.circuit), JSON.stringify(expected));
  assertEquals(ready, 1);
  assertEquals(engineRequests().filter((n) => n.endsWith(".gz")).sort(), ENGINE_FILES.map((n) => `${n}.gz`).sort());
  const last = events.at(-1);
  const total = ENGINE_FILES.reduce((n, f) => n + sizes[`${f}.gz`], 0);
  assertEquals([last.doneAll, last.totalAll], [total, total]);
});

Deno.test("the engine is loaded once: a second behavioural import downloads nothing", async () => {
  asked.length = 0;
  const r = await importSystemVerilog({ "sel.sv": MUX }, { top: "sel", engines });
  assertEquals(r.problems, []);
  assertEquals(asked, []);
  assert(r.circuit.elements.length > 0 && r.circuit.elements.some((e) => e.type === "mux2"), "an if/else becomes a mux2: " + r.circuit.elements.map((e) => e.type));
});

Deno.test("an enable flip-flop becomes a D flip-flop with logic in front", async () => {
  const r = await importSystemVerilog({ "reg1.sv": ENABLE }, { top: "reg1", engines });
  assertEquals(r.problems, []);
  const types = r.circuit.elements.map((e) => e.type);
  assert(types.includes("d_flipflop") && types.includes("mux2"), types.join(","));
});

Deno.test("what the importer still refuses stays refused with its line, engine or not", async () => {
  const asyncReset = "module r(input logic clk, rst, d, output logic q);\n  always_ff @(posedge clk or posedge rst) if (rst) q <= 1'b0; else q <= d;\nendmodule\n";
  const r = await importSystemVerilog({ "r.sv": asyncReset }, { top: "r", engines });
  assertEquals(r.circuit, null);
  assert(r.problems.length > 0 && Number.isInteger(r.problems[0].line), JSON.stringify(r.problems));
});

Deno.test("(cleanup) put process back", () => {
  if (savedProcess) Object.defineProperty(globalThis, "process", savedProcess);
});
