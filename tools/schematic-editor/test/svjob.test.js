// F22.1b: the page side of SystemVerilog import (tools/shared/src/svjob.js): input rules, the Worker run with its 20 second
// limit, problem lines, candidate tops. The Worker is a fake here; the real one is checked in the browser. The importer itself
// (the pinned copy in tools/shared/src/sv/) is run for real, slang only, to check what it returns for the cases the panel handles.

import { MAX_INPUT_BYTES, TIME_LIMIT_MS, candidateTops, formatProblem, prepareFiles, runImport } from "../../shared/src/svjob.js";
import { importSystemVerilog } from "../../shared/src/sv/import/sv/index.mjs";
import { createBrowserEngines } from "../../shared/src/sv/import/sv/engines-browser.mjs";
import { parse, serialize } from "../src/doc.js";
import { drawing } from "../src/export.js";
import { assert, assertEquals, pack } from "./helpers.js";

Deno.test("the limits are the ones Blake chose: 20 seconds, 200 KB", () => {
  assertEquals([TIME_LIMIT_MS, MAX_INPUT_BYTES], [20000, 200 * 1024]);
});

Deno.test("prepareFiles: names are made safe, empty and duplicate input is handled", () => {
  assertEquals(prepareFiles([{ name: "my design (1).sv", text: "module m; endmodule" }]).files, { "my_design__1_.sv": "module m; endmodule" });
  assertEquals(prepareFiles([{ name: "", text: "module m; endmodule" }]).files, { "pasted.sv": "module m; endmodule" });
  assert(/nothing to import/i.test(prepareFiles([]).error));
  assert(/nothing to import/i.test(prepareFiles([{ name: "a.sv", text: "  \n " }]).error));
  const same = prepareFiles([{ name: "a.sv", text: "x" }, { name: "a.sv", text: "y" }]);
  assertEquals(Object.keys(same.files).length, 2, "a second a.sv gets another name");
});

Deno.test("prepareFiles: the 200 KB cap counts bytes in all files together, with a readable message", () => {
  const ok = "a".repeat(MAX_INPUT_BYTES);
  assertEquals(prepareFiles([{ name: "a.sv", text: ok }]).error, undefined);
  const over = prepareFiles([{ name: "a.sv", text: ok }, { name: "b.sv", text: "b" }]);
  assert(/200 KB/.test(over.error) && /too large/i.test(over.error), over.error);
  assert(prepareFiles([{ name: "a.sv", text: "é".repeat(MAX_INPUT_BYTES / 2 + 1) }]).error, "two-byte characters count as two bytes");
});

Deno.test("formatProblem: file:line:column construct: message, leaving out what is not known", () => {
  assertEquals(formatProblem({ file: "a.sv", line: 3, column: 9, construct: "compile error", message: "bad" }), "a.sv:3:9 compile error: bad");
  assertEquals(formatProblem({ file: "a.sv", line: 3, column: null, construct: "inout", message: "no" }), "a.sv:3 inout: no");
  assertEquals(formatProblem({ file: null, line: null, column: null, construct: "time", message: "took too long" }), "time: took too long");
});

Deno.test("candidateTops reads the modules the importer lists when several could be the top", () => {
  const p = [{ construct: "top", message: "more than one module could be the top; name one of: alpha, beta_2, gamma" }];
  assertEquals(candidateTops(p), ["alpha", "beta_2", "gamma"]);
  assertEquals(candidateTops([{ construct: "compile error", message: "name one of: x" }]), []);
  assertEquals(candidateTops([]), []);
});

// ---- the Worker wrapper ----------------------------------------------------------------------------

class FakeWorker {
  constructor() { FakeWorker.last = this; this.terminated = false; this.sent = null; }
  postMessage(m) { this.sent = m; FakeWorker.onSend?.(this, m); }
  terminate() { this.terminated = true; }
  reply(data) { this.onmessage?.({ data }); }
  fail(message) { this.onerror?.({ message, preventDefault() {} }); }
}
const timers = () => {
  const t = { list: [], cleared: [] };
  t.set = (fn, ms) => { t.list.push({ fn, ms }); return t.list.length; };
  t.clear = (id) => t.cleared.push(id);
  return t;
};
const opts = (t) => ({ createWorker: () => new FakeWorker(), setTimer: t.set, clearTimer: t.clear });

Deno.test("runImport sends the files and the top to the Worker and returns what it answers; the Worker is stopped", async () => {
  const t = timers();
  FakeWorker.onSend = (w, m) => w.reply({ id: m.id, ok: true, result: { circuit: { schema: "circuit/0.4" }, problems: [] } });
  const r = await runImport({ "a.sv": "x" }, { top: "m" }, opts(t));
  assertEquals(r.circuit.schema, "circuit/0.4");
  assertEquals(FakeWorker.last.sent.files, { "a.sv": "x" });
  assertEquals(FakeWorker.last.sent.top, "m");
  assertEquals(FakeWorker.last.terminated, true);
  assertEquals(t.list[0].ms, 20000, "the limit is armed at 20 seconds");
  assertEquals(t.cleared.length, 1, "and cleared when the Worker answers");
});

Deno.test("runImport: no answer in time terminates the Worker and reports it took too long", async () => {
  const t = timers();
  FakeWorker.onSend = null;
  const run = runImport({ "a.sv": "x" }, {}, opts(t));
  assertEquals(FakeWorker.last.terminated, false);
  t.list[0].fn();   // the 20 seconds pass
  const r = await run;
  assertEquals(FakeWorker.last.terminated, true);
  assertEquals(r.circuit, null);
  assert(/took too long/i.test(r.problems[0].message) && /20 seconds/.test(r.problems[0].message), r.problems[0].message);
});

Deno.test("runImport: a Worker error or a failed engine becomes a problem, never an exception", async () => {
  const t = timers();
  FakeWorker.onSend = (w, m) => w.reply({ id: m.id, ok: false, error: "slang could not be downloaded: the server answered 404" });
  const a = await runImport({ "a.sv": "x" }, {}, opts(t));
  assert(/could not be downloaded/.test(a.problems[0].message) && a.circuit === null);
  FakeWorker.onSend = (w) => w.fail("Failed to load worker script");
  const b = await runImport({ "a.sv": "x" }, {}, opts(t));
  assert(/Failed to load worker script/.test(b.problems[0].message) && b.circuit === null);
  const c = await runImport({ "a.sv": "x" }, {}, { createWorker: () => { throw new Error("Workers are not available"); }, setTimer: t.set, clearTimer: t.clear });
  assert(/Workers are not available/.test(c.problems[0].message));
});

Deno.test("runImport: answers meant for another run are ignored", async () => {
  const t = timers();
  FakeWorker.onSend = (w, m) => { w.reply({ id: m.id + 100, ok: true, result: { circuit: { x: 1 }, problems: [] } }); w.reply({ id: m.id, ok: true, result: { circuit: { x: 2 }, problems: [] } }); };
  assertEquals((await runImport({ "a.sv": "x" }, {}, opts(t))).circuit.x, 2);
});

// ---- the importer behind it, run for real (slang only) -------------------------------------------------

const engines = createBrowserEngines({
  slangModule: new URL("../../shared/src/sv/third_party/slang/slang.mjs", import.meta.url).href,
  slangWasm: new URL("../../shared/src/sv/third_party/slang/slang.wasm.gz", import.meta.url).href,
});
const HALF = `module half_adder(input logic a, b, output logic s, c);
  xor g1(s, a, b);
  and g2(c, a, b);
endmodule
`;

Deno.test("a structural module imports, and the circuit opens in the editor and draws", async () => {
  const r = await importSystemVerilog({ "half.sv": HALF }, { engines });
  assertEquals(r.problems, []);
  const text = JSON.stringify(r.circuit);
  const { doc } = parse(text);
  assert(doc.elements.length >= 2 && doc.ports.length >= 4);
  const d = drawing(doc, pack, { typeset: new Map() });
  assert(d.elements.length >= 2, "the figure draws");
  assertEquals(JSON.parse(serialize(doc, pack)).id, JSON.parse(text).id);
});

Deno.test("an error comes back with its line; behavioural code is a refusal with a line, not a crash", async () => {
  const bad = await importSystemVerilog({ "bad.sv": "module m(input a, output y);\n  assign y = a &;\nendmodule\n" }, { engines });
  assertEquals(bad.circuit, null);
  assert(bad.problems.length > 0 && bad.problems[0].file === "bad.sv" && bad.problems[0].line === 2, JSON.stringify(bad.problems[0]));
  const beh = await importSystemVerilog({ "ff.sv": "module ff(input logic clk, d, output logic q);\n  always_ff @(posedge clk) q <= d;\nendmodule\n" }, { engines });
  assertEquals(beh.circuit, null);
  assert(beh.problems.length > 0 && Number.isInteger(beh.problems[0].line), JSON.stringify(beh.problems[0]));
});

Deno.test("two modules nothing instantiates list the candidate tops; naming one imports it", async () => {
  const two = HALF + "module other(input logic x, output logic y);\n  not n1(y, x);\nendmodule\n";
  const r = await importSystemVerilog({ "two.sv": two }, { engines });
  assertEquals(r.circuit, null);
  assertEquals(candidateTops(r.problems).sort(), ["half_adder", "other"]);
  const named = await importSystemVerilog({ "two.sv": two }, { top: "other", engines });
  assertEquals(named.problems, []);
});
