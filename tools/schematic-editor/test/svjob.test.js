// F22.1b: the page side of SystemVerilog import (tools/shared/src/svjob.js): input rules, the Worker run with its 20 second
// limit, problem lines, candidate tops. The Worker is a fake here; the real one is checked in the browser. The importer itself
// (the pinned copy in tools/shared/src/sv/) is run for real, slang only, to check what it returns for the cases the panel handles.

import { COLD_CAP_MS, IDLE_MS, MAX_INPUT_BYTES, STALL_MS, TIME_LIMIT_MS, candidateTops, endWarmWorker, formatProblem, prepareFiles, runImport } from "../../shared/src/svjob.js";
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

// ---- F22.1c: the synthesis engine's download, Cancel, and the kept Worker ----------------------------------------------------------

/** Timers that record what is armed, cleared and fired; `live()` is what is still armed. */
const clock = () => {
  const t = { list: [], cleared: new Set() };
  t.set = (fn, ms) => { t.list.push({ fn, ms, fired: false }); return t.list.length; };
  t.clear = (id) => t.cleared.add(id);
  t.live = () => t.list.filter((x, i) => !x.fired && !t.cleared.has(i + 1)).map((x) => x.ms).sort((a, b) => a - b);
  t.fire = (ms) => { const i = t.list.findIndex((x, k) => x.ms === ms && !x.fired && !t.cleared.has(k + 1)); t.list[i].fired = true; t.list[i].fn(); };
  return t;
};
const copts = (t, extra = {}) => ({ createWorker: () => new FakeWorker(), setTimer: t.set, clearTimer: t.clear, ...extra });
const download = (doneAll) => ({ kind: "download", file: "yosys.core.wasm", done: doneAll, total: 100, doneAll, totalAll: 100 });
const ok = (id, extra = {}) => ({ id, ok: true, result: { circuit: { schema: "circuit/0.4" }, problems: [] }, ...extra });

Deno.test("the engine limits are the ones Blake chose: stall 20 s, cold download 3 minutes, kept Worker 5 minutes", () => {
  assertEquals([TIME_LIMIT_MS, STALL_MS, COLD_CAP_MS, IDLE_MS, MAX_INPUT_BYTES], [20000, 20000, 180000, 300000, 200 * 1024]);
});

Deno.test("a run without a download is as before: one 20 s timer, cleared when the Worker answers", async () => {
  endWarmWorker();
  const t = clock();
  FakeWorker.onSend = (w, m) => w.reply(ok(m.id));
  await runImport({ "a.sv": "x" }, {}, copts(t));
  assertEquals(t.list.map((x) => x.ms), [20000]);
  assertEquals(t.live(), []);
});

Deno.test("while the engine downloads the 20 s run limit is off; a stall and a 3 minute cap take over; ready restarts the 20 s", async () => {
  endWarmWorker();
  const t = clock();
  const seen = [];
  FakeWorker.onSend = null;
  const run = runImport({ "a.sv": "x" }, {}, copts(t, { onProgress: (e) => seen.push(e.kind) }));
  const w = FakeWorker.last, id = w.sent.id;
  assertEquals(t.live(), [20000], "the run limit is armed at the start");
  w.reply({ id, event: download(10) });
  assertEquals(t.live(), [20000, 180000], "the run limit is replaced by the stall limit (20 s) and the cap (3 minutes)");
  assertEquals(t.list.length, 3);
  w.reply({ id, event: download(20) });   // new bytes: the stall timer starts again
  assertEquals(t.list.length, 4);
  w.reply({ id, event: download(20) });   // no new bytes: it does not
  assertEquals(t.list.length, 4);
  w.reply({ id, event: { kind: "ready" } });
  assertEquals(t.live(), [20000, 180000], "ready: the stall is gone, the 20 s run limit is back, the cap stays");
  assertEquals(t.list.length, 5);
  w.reply(ok(id, { engine: true }));
  const r = await run;
  assertEquals(r.problems, []);
  assertEquals(seen, ["download", "download", "download", "ready"]);
  assertEquals(t.live(), [300000], "only the idle timer of the kept Worker is left");
  endWarmWorker();
});

Deno.test("no new bytes for 20 seconds stops the download as stalled; the Worker is ended, not kept", async () => {
  endWarmWorker();
  const t = clock();
  FakeWorker.onSend = null;
  const run = runImport({ "a.sv": "x" }, {}, copts(t));
  FakeWorker.last.reply({ id: FakeWorker.last.sent.id, event: download(5) });
  t.fire(20000);   // the stall timer (the run limit was cleared)
  const r = await run;
  assertEquals(FakeWorker.last.terminated, true);
  assertEquals(r.problems[0].construct, "engine");
  assert(/no data for 20 seconds/.test(r.problems[0].message), r.problems[0].message);
});

Deno.test("a download that keeps trickling is stopped at 3 minutes", async () => {
  endWarmWorker();
  const t = clock();
  FakeWorker.onSend = null;
  const run = runImport({ "a.sv": "x" }, {}, copts(t));
  FakeWorker.last.reply({ id: FakeWorker.last.sent.id, event: download(1) });
  t.fire(180000);
  const r = await run;
  assertEquals(FakeWorker.last.terminated, true);
  assert(/more than 3 minutes/.test(r.problems[0].message), r.problems[0].message);
});

Deno.test("after ready the 20 s run limit still ends a stuck run", async () => {
  endWarmWorker();
  const t = clock();
  FakeWorker.onSend = null;
  const run = runImport({ "a.sv": "x" }, {}, copts(t));
  const w = FakeWorker.last;
  w.reply({ id: w.sent.id, event: download(1) });
  w.reply({ id: w.sent.id, event: { kind: "ready" } });
  t.fire(20000);
  const r = await run;
  assertEquals(w.terminated, true);
  assertEquals(r.problems[0].construct, "time");
});

Deno.test("Cancel (an AbortSignal) ends the run at once, terminates the Worker, and answers a problem", async () => {
  endWarmWorker();
  const t = clock();
  FakeWorker.onSend = null;
  const abort = new AbortController();
  const run = runImport({ "a.sv": "x" }, {}, copts(t, { signal: abort.signal }));
  const w = FakeWorker.last;
  w.reply({ id: w.sent.id, event: download(1) });
  abort.abort();
  const r = await run;
  assertEquals([w.terminated, r.circuit, r.problems[0].construct], [true, null, "cancel"]);
  assertEquals(t.live(), [], "every timer is cleared");
  const again = await runImport({ "a.sv": "x" }, {}, copts(clock(), { signal: abort.signal }));   // already aborted
  assertEquals(again.problems[0].construct, "cancel");
});

Deno.test("Data Saver: the Worker is told to ask; the page answers; a yes arms the stall, a no is passed on", async () => {
  for (const answer of [false, true]) {
    endWarmWorker();
    const t = clock();
    FakeWorker.onSend = null;
    const asked = [];
    const run = runImport({ "a.sv": "x" }, {}, copts(t, { synthesis: true, onAsk: async (bytes) => { asked.push(bytes); return answer; } }));
    const w = FakeWorker.last, id = w.sent.id;
    assertEquals(w.sent.askFirst, true);
    w.reply({ id, event: { kind: "ask", bytes: 18000000 } });
    assertEquals(t.live(), [180000], "no 20 s limit while a person decides, and no stall timer yet");
    await new Promise((r) => setTimeout(r, 0));
    assertEquals(asked, [18000000]);
    assertEquals(w.sent, { id, consent: answer }, "the answer went to the Worker");
    assertEquals(t.live(), answer ? [20000, 180000] : [180000], "a yes starts the stall timer");
    w.reply(ok(id));
    await run;
  }
});

Deno.test("the engine is off unless the page opts in (F22.1c-2); without onAsk the Worker is told not to ask", async () => {
  endWarmWorker();
  FakeWorker.onSend = (w, m) => w.reply(ok(m.id));
  await runImport({ "a.sv": "x" }, {}, copts(clock()));
  assertEquals([FakeWorker.last.sent.synthesis, FakeWorker.last.sent.askFirst], [false, false]);
  await runImport({ "a.sv": "x" }, {}, copts(clock(), { onAsk: async () => true }));
  assertEquals([FakeWorker.last.sent.synthesis, FakeWorker.last.sent.askFirst], [false, false], "asking only makes sense with the engine on");
  await runImport({ "a.sv": "x" }, {}, copts(clock(), { synthesis: true }));
  assertEquals([FakeWorker.last.sent.synthesis, FakeWorker.last.sent.askFirst], [true, false]);
});

Deno.test("a Worker that loaded the engine is kept and reused; it is ended after 5 minutes idle", async () => {
  endWarmWorker();
  const t = clock();
  let made = 0;
  const create = () => { made++; return new FakeWorker(); };
  FakeWorker.onSend = (w, m) => w.reply(ok(m.id, { engine: true }));
  await runImport({ "a.sv": "x" }, {}, copts(t, { createWorker: create }));
  const first = FakeWorker.last;
  assertEquals([made, first.terminated, t.live()], [1, false, [300000]]);
  await runImport({ "b.sv": "y" }, {}, copts(t, { createWorker: create }));
  assertEquals(made, 1, "the kept Worker was reused");
  assertEquals(first.sent.files, { "b.sv": "y" });
  assertEquals(first.terminated, false);
  assertEquals(t.live(), [300000], "one idle timer: the first was cleared when the Worker was taken");
  t.fire(300000);
  assertEquals(first.terminated, true);
  FakeWorker.onSend = (w, m) => w.reply(ok(m.id));
  await runImport({ "c.sv": "z" }, {}, copts(t, { createWorker: create }));
  assertEquals(made, 2, "after the idle end, a new Worker");
});

Deno.test("a Worker is not kept after an error, a time limit, or a run that did not load the engine", async () => {
  for (const how of ["error", "slang only", "time"]) {
    endWarmWorker();
    const t = clock();
    FakeWorker.onSend = how === "time" ? null : (w, m) => w.reply(how === "error" ? { id: m.id, ok: false, error: "boom", engine: true } : ok(m.id, { engine: false }));
    const run = runImport({ "a.sv": "x" }, {}, copts(t));
    if (how === "time") t.fire(20000);
    await run;
    assertEquals(FakeWorker.last.terminated, true, how);
    assertEquals(t.live(), [], how);
    let made = 0;
    FakeWorker.onSend = (w, m) => w.reply(ok(m.id));
    await runImport({ "a.sv": "x" }, {}, copts(t, { createWorker: () => { made++; return new FakeWorker(); } }));
    assertEquals(made, 1, how + ": the next run makes a new Worker");
  }
});

Deno.test("a Worker error while a Worker is kept ends it quietly", async () => {
  endWarmWorker();
  const t = clock();
  FakeWorker.onSend = (w, m) => w.reply(ok(m.id, { engine: true }));
  await runImport({ "a.sv": "x" }, {}, copts(t));
  const kept = FakeWorker.last;
  kept.fail("out of memory");
  assertEquals(kept.terminated, true);
  assertEquals(t.live(), []);
});

Deno.test("an engine problem the Worker names becomes a problem of kind engine", async () => {
  endWarmWorker();
  FakeWorker.onSend = (w, m) => w.reply({ id: m.id, ok: false, error: "The synthesis engine could not be downloaded: the server answered 503.", engineProblem: true });
  const r = await runImport({ "a.sv": "x" }, {}, copts(clock()));
  assertEquals(r.problems[0].construct, "engine");
});
