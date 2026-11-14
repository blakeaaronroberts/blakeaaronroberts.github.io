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
Deno.test("nets are named by the label on them, not their internal name", async () => {
  const { nodesOf } = await import("../src/nodes.js");
  const doc = { schema: "circuit/0.2", ports: [{ id: "p1", label: "CLK", at: [0, 0] }], nets: { n1: ["p1", "u.A"], n2: ["u.Y", "v.A"], n3: ["v.Y"] },
    wires: [{ id: "w", from: "u.Y", to: [10, 4], via: [[6, 4]] }], labels: [{ text: "N1", at: [7, 5] }] };
  assertEquals(nodesOf(JSON.stringify(doc)).nodes.map((x) => x.name), ["CLK", "N1", "n3"]);
});
Deno.test("a wire's net label, or its bus label, names the signal", async () => {
  const { nodesOf } = await import("../src/nodes.js");
  const doc = { schema: "circuit/0.2", nets: { n1: ["u.Y", "v.A"], n2: ["v.Y", "w.A"], n3: ["w.Y"] },
    wires: [{ id: "a", from: "u.Y", to: "v.A" }, { id: "b", from: "v.Y", to: "w.A", bus: "D[3:0]" }, { id: "c", from: "w.Y", to: [0, 0], bus: "4" }],
    groups: { wire_labels: { a: "CLK" } } };
  assertEquals(nodesOf(JSON.stringify(doc)).nodes.map((x) => x.name), ["CLK", "D[3:0]", "n3"]);
});
Deno.test("our drawing is laid out from the size, not scaled to it: stroke width stays, step width follows", async () => {
  const { drawTiming } = await import("../src/draw.js");
  const v = { signal: [{ name: "clk", wave: "p...." }, { name: "D", wave: "0.1=0", data: ["a"] }] };
  const a = drawTiming(v, { width: 300, height: 100 }), b = drawTiming(v, { width: 600, height: 200 });
  assert(b.geometry.stepW > a.geometry.stepW * 1.9 && b.geometry.laneH > a.geometry.laneH * 1.9);
  assert(/stroke-width="1.6"/.test(a.svg) && /stroke-width="1.6"/.test(b.svg));
  assert(!/preserveAspectRatio/.test(b.svg));
  assert(drawTiming(v, { marker: 2 }).svg.includes('class="td-marker"'));
  assert(drawTiming(v, {}).svg.includes(">a</text>"));
});
