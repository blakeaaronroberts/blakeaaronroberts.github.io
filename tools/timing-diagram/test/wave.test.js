// Run with: quarto run tools/timing-diagram/test/run.js
const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const assertEquals = (a, b) => assert(JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
import { parseSource, signalNames, tidy } from "../src/wave.js";
import { nodesOf, starterLines, unknownNames } from "../src/nodes.js";

Deno.test("relaxed WaveDrom source is read as data", () => {
  const r = parseSource("{signal: [{name: 'clk', wave: 'p..'},]}");
  assert(r.ok); assertEquals(signalNames(r.value), ["clk"]);
});
Deno.test("bad source gives a message, not a throw", () => {
  assert(!parseSource("{signal: ").ok); assert(!parseSource("[]").ok); assert(!parseSource("{}").ok);
  assert(!parseSource("{signal: [alert(1)]}").ok);
});
Deno.test("tidy keeps the data and puts one signal per line", () => {
  const v = parseSource('{"signal":[{"name":"a","wave":"01"},["g",{"name":"b","wave":"10"}]],"head":{"text":"t"}}').value;
  const t = tidy(v);
  assertEquals(parseSource(t).value, v);
  assert(t.split("\n").length > 5);
});
Deno.test("nodes come from ports and net names; junk is dropped", () => {
  const n = nodesOf(JSON.stringify({ schema: "circuit/0.2", ports: [{ id: "A", dir: "in" }, { id: "S", dir: "out" }, { id: "<b>x</b>" }], nets: { n1: [], Cout: [] } }));
  assertEquals(n.nodes.map((x) => x.name), ["A", "S", "n1", "Cout"]);
  assert(!nodesOf("not json").ok); assert(!nodesOf('{"schema":"other"}').ok);
});
Deno.test("starter lines and unknown names", () => {
  const n = nodesOf(JSON.stringify({ schema: "circuit/0.2", ports: [{ id: "A", dir: "in" }, { id: "clk", dir: "in" }] })).nodes;
  assertEquals(starterLines(n).map((l) => l.wave), ["0.1.0...", "p......."]);
  assertEquals(unknownNames(["A", "Z"], n), ["Z"]);
});
Deno.test("a step's column is 40 px wide at hscale 1 and follows hscale", async () => {
  const { stepColumn } = await import("../src/wave.js");
  assertEquals(stepColumn(2, 40), { x: 120, width: 40 });
  assertEquals(stepColumn(1, 40, 2), { x: 120, width: 80 });
});
Deno.test("frame names come from the circuit's groups, capped and trimmed", async () => {
  const { framesIn } = await import("../src/nodes.js");
  assertEquals(framesIn(JSON.stringify({ groups: { frames: [{ name: " Reset ", levels: {} }, { levels: {} }] } })), ["Reset", "Frame 2"]);
  assertEquals(framesIn("nope"), []);
  assertEquals(framesIn("{}"), []);
});
