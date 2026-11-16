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
Deno.test("WaveDrom empty-object signals round-trip as blank spacer lanes", async () => {
  const source = '{signal: [{name: "A", wave: "0"}, {}, {name: "B", wave: "1"}]}';
  const parsed = parseSource(source);
  assert(parsed.ok);
  const { fromWaveDrom, toWaveDrom } = await import("../src/model.js");
  const flat = fromWaveDrom(parsed.value);
  assertEquals(flat.signal[1], {});
  assertEquals(toWaveDrom(flat).signal, parsed.value.signal);
  const { drawTiming, lanesOf } = await import("../src/draw.js");
  const spacer = drawTiming(parsed.value, {}), noSpacer = drawTiming({ signal: [parsed.value.signal[0], parsed.value.signal[2]] }, {});
  assert(lanesOf(parsed.value)[1].spacer);
  assert(spacer.natural.h > noSpacer.natural.h, "the spacer reserves a blank lane");
  assert((spacer.svg.match(/<path /g) ?? []).length === (noSpacer.svg.match(/<path /g) ?? []).length, "the spacer adds no visible waveform");
});
Deno.test("nodes come from ports and net names; junk is dropped", () => {
  const n = nodesOf(JSON.stringify({ schema: "circuit/0.2", ports: [{ id: "A", dir: "in" }, { id: "S", dir: "out" }, { id: "<b>x</b>" }], nets: { n1: [], Cout: [] } }));
  assertEquals(n.nodes.map((x) => x.name), ["A", "S", "n1", "Cout"]);
  assert(!nodesOf("not json").ok); assert(!nodesOf('{"schema":"other"}').ok);
});
Deno.test("disconnected wires with the same label become one timing node", () => {
  const circuit = {
    schema: "circuit/0.3", ports: [], nets: {},
    wires: [{ id: "w1", from: [0, 0], to: [2, 0] }, { id: "w2", from: [8, 2], to: [10, 2] }],
    groups: { wire_labels: { w1: "READY", w2: "READY" } },
  };
  const result = nodesOf(JSON.stringify(circuit), { mergeConnected: true });
  assert(result.ok);
  assertEquals(result.nodes.map((node) => node.name), ["READY"]);
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
Deno.test("beta timing nodes merge connected segments and retain TeX labels", () => {
  const doc = { schema: "circuit/0.3", ports: [{ id: "p1", label: "P", at: [0, 0] }], nets: { n1: ["p1"] },
    wires: [{ id: "w1", from: [0, 0], to: [4, 0] }, { id: "w2", from: [4, 0], to: [10, 0] }],
    groups: { wire_labels: { w2: "$Q_{0}$" } } };
  assertEquals(nodesOf(JSON.stringify(doc), { mergeConnected: true, allowTexNames: true }).nodes.map((x) => x.name), ["$Q_{0}$"]);
  const texPort = JSON.stringify({ schema: "circuit/0.2", ports: [{ id: "q", label: "$Q_{n+1}$" }] });
  assertEquals(nodesOf(texPort).nodes.map((x) => x.name), ["q"]);
  assertEquals(nodesOf(texPort, { allowTexNames: true }).nodes.map((x) => x.name), ["$Q_{n+1}$"]);
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
Deno.test("text size, line width and outlined TeX names are drawing inputs", async () => {
  const { drawTiming, naturalSize } = await import("../src/draw.js");
  const name = "$Q_0$", parsed = { ok: true, left: 0, width: 0.9, height: 0.7, depth: 0.2, nodes: [{ tag: "path", attrs: [["d", "M0 0L1 1"], ["fill", "currentColor"]], children: [] }] };
  const value = { signal: [{ name, wave: "01" }, { name: "D", wave: "01" }] }, names = new Map([[name, parsed]]);
  const plain = drawTiming(value, {}), tuned = drawTiming(value, { fontSize: 18, lineWidth: 3.2, nameTypeset: names });
  assert(tuned.svg.includes('class="td-name-math"') && tuned.svg.includes("<path d=") && tuned.svg.includes("scale(0.018)"));
  assert(!tuned.svg.includes(`${name}</text>`));
  assert(tuned.svg.includes('font-size="18"') && tuned.svg.includes('stroke-width="3.2"'));
  assert(naturalSize(value, 1, { fontSize: 18, nameTypeset: names }).h > naturalSize(value).h);
  assert(plain.svg.includes('font-size="12"') && plain.svg.includes('stroke-width="1.6"'));
  const hidden = drawTiming(value, { showNames: false });
  assert(!hidden.svg.includes(`${name}</text>`) && !hidden.svg.includes(">D</text>"));
  assert(hidden.natural.w < plain.natural.w);
});
Deno.test("beta look settings persist in WaveDrom config with unchanged defaults", async () => {
  const { empty, lineWidthOf, setLineWidth, setTextSize, textSizeOf, toWaveDrom } = await import("../src/model.js");
  let value = setTextSize(setLineWidth(empty(), 2.4), 18);
  assertEquals([textSizeOf(value), lineWidthOf(value), toWaveDrom(value).config.fontSize, toWaveDrom(value).config.lineWidth], [18, 2.4, 18, 2.4]);
  value = setTextSize(setLineWidth(value, 1.6), 12);
  assertEquals([textSizeOf(value), lineWidthOf(value), value.config.fontSize, value.config.lineWidth], [12, 1.6, undefined, undefined]);
});
Deno.test("net-name visibility persists in WaveDrom config and defaults to visible", async () => {
  const { empty, setShowNames, showNamesOf, toWaveDrom } = await import("../src/model.js");
  const value = empty(), hidden = setShowNames(value, false), shown = setShowNames(hidden, true);
  assert(showNamesOf(value) && !showNamesOf(hidden) && showNamesOf(shown));
  assertEquals(toWaveDrom(hidden).config.showNames, false);
  assertEquals(shown.config.showNames, undefined);
});
Deno.test("a delay shifts a lane right by that many steps, fractions allowed, and the lane holds its first level before it", async () => {
  const { drawTiming } = await import("../src/draw.js");
  const v = (delay) => ({ signal: [{ name: "D", wave: "0.1.", delay }] });
  const a = drawTiming(v(0), {}), b = drawTiming(v(0.5), {});
  const nums = (s) => (/ d="(M [^"]*)"/.exec(s.svg)[1].match(/[0-9.]+/g) ?? []).map(Number);
  assert(nums(a).join() !== nums(b).join() && nums(b)[0] === nums(a)[0], "the delayed lane differs but starts at the same x");
});
Deno.test("levelColour colours each level's line like the nets", async () => {
  const { drawTiming } = await import("../src/draw.js");
  const v = { signal: [{ name: "D", wave: "0.1.z" }] };
  const s = drawTiming(v, { levelColour: (l) => ({ 0: "#111111", 1: "#222222", Z: "#333333" })[l] ?? null }).svg;
  for (const c of ["#111111", "#222222", "#333333"]) assert(s.includes(`stroke="${c}"`), c);
  assert(!drawTiming(v, {}).svg.includes("#111111"));
});
Deno.test("theme level backgrounds coordinate X and Z fills with the signal line colour", async () => {
  const { drawTiming } = await import("../src/draw.js");
  const svg = drawTiming({ signal: [{ name: "D", wave: "xz" }] }, {
    signalLineColour: "#123456",
    levelFills: { unknown: "#CC79A7", floating: "#0072B2" },
  }).svg;
  assert(svg.includes('fill="#CC79A7" fill-opacity="0.35"'));
  assert(svg.includes('fill="#0072B2" fill-opacity="0.35"'));
  assert(svg.includes('stroke="#123456"'));
});

Deno.test("arrow colour and dotted lines follow straight, curved and square arrow types", async () => {
  const { drawTiming } = await import("../src/draw.js");
  const svg = drawTiming({
    signal: [{ name: "A", wave: "01", node: "ab" }, { name: "B", wave: "01", node: "cd" }],
    edge: ["a->b", "a~>b", "a-|>b"],
    config: { edgeStyles: {
      straight: { colour: "#112233", dotted: true },
      curved: { colour: "#223344" },
      square: { colour: "#334455", dotted: true },
    } },
  }).svg;
  assert(svg.includes('stroke="#112233"') && svg.includes('stroke-dasharray="2 2"'));
  assert(svg.includes('stroke="#223344"') && !svg.includes('stroke="#223344" stroke-width="1" stroke-dasharray'));
  assert(svg.includes('stroke="#334455"') && svg.includes('fill="#112233"') && svg.includes('fill="#223344"') && svg.includes('fill="#334455"'));
});

Deno.test("edge nodes retain their legacy slanted positions", async () => {
  const { drawTiming } = await import("../src/draw.js");
  for (const slant of [0, 5, 12]) {
    const value = {
      signal: [{ name: "A", wave: "01", node: ".a" }, { name: "B", wave: "01", node: ".b" }],
      edge: ["a->b"], config: { slant, edgeLineColour: "#123456" },
    };
    const result = drawTiming(value, { width: 300, height: 100 });
    const edgeX = (svg) => {
      const edgePath = svg.match(/<path d="M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)" fill="none" stroke="#123456"/);
      assert(edgePath, "the edge between nodes is drawn");
      return [edgePath[1], edgePath[3]];
    };
    const x = result.geometry.x0 + result.geometry.stepW;
    const legacyX = String(Math.round((x + Math.min(slant, result.geometry.stepW * 0.15) / 2) * 100) / 100);
    assertEquals(edgeX(result.svg), [legacyX, legacyX]);
  }
});
