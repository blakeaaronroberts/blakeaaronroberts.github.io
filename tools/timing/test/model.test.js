// The step editor's model: every edit it makes to the WaveDrom-format source.

import { addSignal, cellsOf, dataAt, empty, isCalculatedCell, moveSignal, nextValue, removeSignal, setCalculatedLevels, setCell, setClock, setDelay, setSteps, stepCount } from "../src/model.js";

const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const eq = (a, b) => assert(JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

Deno.test("a new diagram is empty; added signals start low for every step, clocks as clocks; no duplicates", () => {
  let v = empty();
  eq(v.signal, []);
  v = addSignal(addSignal(v, "D"), "clk", { clock: true });
  eq(v.signal.map((s) => s.wave), ["0.......", "p......."]);
  eq(addSignal(v, "D").signal.length, 2);
});

Deno.test("setting a step makes it explicit; later held steps follow it; shift (hold) continues the step before", () => {
  let v = addSignal(empty(), "D");
  v = setCell(v, 0, 3, "1");
  eq(v.signal[0].wave, "0..1....");
  eq(cellsOf(v.signal[0], 8).map((c) => c.value).join(""), "00011111");
  v = setCell(v, 0, 3, ".");
  eq(v.signal[0].wave, "0.......");
});

Deno.test("data steps keep their labels in order as steps are added and removed", () => {
  let v = addSignal(empty(), "Q");
  v = setCell(v, 0, 2, "=", "A");
  v = setCell(v, 0, 5, "=", "B");
  eq(v.signal[0].data, ["A", "B"]);
  v = setCell(v, 0, 1, "=", "Z0");
  eq(v.signal[0].data, ["Z0", "A", "B"]);
  eq(dataAt(v.signal[0], 6), "B");
  v = setCell(v, 0, 2, "0");
  eq(v.signal[0].data, ["Z0", "B"]);
});

Deno.test("steps, clock, delay, order and removal", () => {
  let v = addSignal(addSignal(empty(), "A"), "B");
  v = setSteps(v, 5);
  eq([stepCount(v), v.signal[0].wave], [5, "0...."]);
  v = setClock(v, 1, true);
  eq(v.signal[1].wave, "p....");
  v = setCell(v, 1, 2, "1");
  eq(v.signal[1].wave, "p.1..");   // a step of a clock can be set on its own, as WaveDrom allows
  v = setDelay(v, 0, 0.25);
  eq(v.signal[0].delay, 0.25);
  eq(moveSignal(v, 1, -1).signal.map((s) => s.name), ["B", "A"]);
  eq(removeSignal(v, 0).signal.map((s) => s.name), ["B"]);
});

Deno.test("the click cycle goes 0, 1, X, Z, data and back", () => {
  eq(["0", "1", "x", "z", "="].map((c) => nextValue(c)), ["1", "x", "z", "=", "0"]);
  eq(nextValue("0", true), "=");
});

Deno.test("calculated cells are tracked independently and a manual edit is never overwritten", () => {
  let v = setSteps(addSignal(empty(), "D"), 3);
  v = setCalculatedLevels(v, { Q: { 0: "0", 1: "1", 2: "0" } });
  eq(v.signal[1].wave, "010");
  eq([0, 1, 2].map((i) => isCalculatedCell(v.signal[1], i)), [true, true, true]);
  v = setCell(v, 1, 1, "x");
  v = setCalculatedLevels(v, { Q: { 0: "1", 1: "1", 2: "1" }, D: { 0: "1" } });
  eq(v.signal[1].wave, "1x1");
  eq(isCalculatedCell(v.signal[1], 1), false);
  eq(v.signal[0].wave, "0..");
  const saved = fromWaveDrom(toWaveDrom(v));
  eq(isCalculatedCell(saved.signal[1], 0), true);
  eq(isCalculatedCell(saved.signal[1], 1), false);
});

import { addEdge, addSpacer, arrowHeadColourOf, arrowHeadSizeOf, dataColoursOf, edgesOf, edgeLineColourOf, edgeLineWidthOf, fromWaveDrom, nextLetter, nodeLetters, removeEdge, resetTimingColours, setArrowHeadColour, setArrowHeadSize, setBand, setDataColour, setEdge, setEdgeLineColour, setEdgeLineWidth, setHscale, setNode, setProp, toWaveDrom } from "../src/model.js";
import { drawTiming, lanesOf, parseEdge } from "../src/draw.js";

Deno.test("period, phase, group; nodes and edges; spacers; head and foot; hscale", () => {
  let v = addSignal(addSignal(empty(), "clk", { clock: true }), "D");
  v = setProp(setProp(setProp(v, 0, "period", 2), 1, "phase", 0.5), 1, "group", "Inputs");
  eq([v.signal[0].period, v.signal[1].phase, v.signal[1].group], [2, 0.5, "Inputs"]);
  eq(setProp(v, 0, "period", 1).signal[0].period, undefined);
  v = setNode(v, 0, 1, nextLetter(v));
  v = setNode(v, 1, 3, nextLetter(v));
  eq(nodeLetters(v), ["a", "b"]);
  v = addEdge(v, { from: "a", op: "~>", to: "b", label: "t_pd" });
  eq(v.edge, ["a~>b t_pd"]);
  v = setEdge(v, 0, { op: "-|->" });
  eq(edgesOf(v)[0], { from: "a", op: "-|->", to: "b", label: "t_pd" });
  eq(removeEdge(v, 0).edge, undefined);
  v = addSpacer(v);
  eq(v.signal[2], {});
  v = setBand(v, "head", { text: "Setup", tick: 0, every: 2 });
  eq(v.head, { text: "Setup", tick: 0, every: 2 });
  eq(setBand(v, "head", { text: "", tick: "", every: 1 }).head, undefined);
  eq(setHscale(v, 2).config.hscale, 2);
});

Deno.test("WaveDrom groups go to flat signals and back", () => {
  const w = { signal: [{ name: "clk", wave: "p..." }, ["Bus", { name: "A", wave: "01.." }, { name: "B", wave: "0.1." }]] };
  const flat = fromWaveDrom(w);
  eq(flat.signal.map((s) => s.group ?? ""), ["", "Bus", "Bus"]);
  eq(toWaveDrom(flat).signal, w.signal);
  eq(lanesOf(w).map((l) => l.groups.join("/")), ["", "Bus", "Bus"]);
});

Deno.test("the drawing has every WaveDrom feature: colours, gaps, clock arrows, groups, ticks, edges", () => {
  const v = {
    signal: [{ name: "clk", wave: "P.N.", node: ".a.." }, ["Bus", { name: "D", wave: "3.4|", data: ["A", "B"], node: "...b" }], {}, { name: "w", wave: "u.d.hl" }],
    edge: ["a~>b t_pd", "a-|>b"], head: { text: "Title", tick: 0 }, foot: { tock: 1 },
  };
  const s = drawTiming(v, { dataFills: ["#111111", "#222222"] }).svg;
  assert(s.includes('fill="#111111"') && s.includes('fill="#222222"'), "data colours 3 and 4");
  assert(s.includes(">Title</text>") && s.includes(">t_pd</text>") && s.includes(">Bus</text>"), "head text, edge label, group name");
  assert(s.includes("stroke-dasharray"), "weak pull-up drawn dashed");
  assert((s.match(/ C /g) ?? []).length >= 1, "a curved edge");
  eq(parseEdge("a<->b  hold").label, "hold");
});

import { setSlant, slantOf } from "../src/model.js";
Deno.test("edge slant: 0 gives square vertical edges, 5 (the default) the slanted WaveDrom look, both drawn", () => {
  const v = { signal: [{ name: "D", wave: "0.1.0" }] };
  assert(slantOf(v) === 5 && slantOf(setSlant(v, 0)) === 0 && setSlant(v, 5).config.slant === undefined);
  const xs = (svg) => [...svg.matchAll(/ L ([\d.]+) /g)].map((m) => +m[1]);
  const sq = drawTiming(setSlant(v, 0), {}).svg, sl = drawTiming(v, {}).svg;
  assert(sq !== sl);
  const pts = (svg) => / d="(M [^"]*)"/.exec(svg)[1].split(/ [ML] /).map((p) => p.replace(/^M /, "").split(" ").map(Number));
  const vertical = (svg) => pts(svg).some((p, i, a) => i && p[0] === a[i - 1][0] && p[1] !== a[i - 1][1]);
  assert(vertical(sq), "square: the edge is vertical");
  assert(!vertical(sl), "slanted: the edge leans");
  assert(xs(sq).length > 0);
});

Deno.test("data and arrow appearance overrides are saved, bounded and reset independently", () => {
  const defaults = Array.from({ length: 7 }, (_, i) => `#00000${i}`);
  let value = empty();
  value = setDataColour(setDataColour(value, 0, "#123456"), 6, "#ABCDEF");
  value = setEdgeLineWidth(setEdgeLineWidth(value, 2.4), 2.4);
  value = setEdgeLineColour(value, "#654321");
  value = setArrowHeadSize(value, 9.5);
  value = setArrowHeadColour(value, "#FEDCBA");
  eq(dataColoursOf(value, defaults), ["#123456", ...defaults.slice(1, 6), "#ABCDEF"]);
  eq([edgeLineWidthOf(value), edgeLineColourOf(value), arrowHeadSizeOf(value), arrowHeadColourOf(value)], [2.4, "#654321", 9.5, "#FEDCBA"]);
  eq(setEdgeLineWidth(value, 20).config.edgeLineWidth, 4);
  eq(setArrowHeadSize(value, 20).config.arrowHeadSize, 16);
  const reset = resetTimingColours(value);
  eq([reset.config.edgeLineWidth, reset.config.arrowHeadSize, reset.config.dataColours, reset.config.edgeLineColour, reset.config.arrowHeadColour], [2.4, 9.5, undefined, undefined, undefined]);
  eq(setEdgeLineWidth(reset, 1).config.edgeLineWidth, undefined);
  eq(setArrowHeadSize(reset, 6).config.arrowHeadSize, undefined);
});

Deno.test("data fills and arrow-line styling are independent of arrowhead styling", () => {
  const value = {
    signal: [{ name: "D", wave: "3.", node: "a." }, { name: "Q", wave: "0.1", node: ".b" }],
    edge: ["a->b $t_{pd}$"],
  };
  const parsed = { ok: true, left: 0, width: 0.9, height: 0.7, depth: 0.2, nodes: [{ tag: "path", attrs: [["d", "M0 0L1 1"], ["fill", "currentColor"]], children: [] }] };
  const defaults = drawTiming(value, { lineWidth: 3.2 }).svg;
  assert(defaults.includes('stroke="#000000" stroke-width="2"'), "the default edge width follows the existing line-width ratio");
  const styled = drawTiming(value, {
    lineWidth: 3.2, edgeLineWidth: 2.2, edgeLineColour: "#112233", arrowHeadSize: 11,
    arrowHeadColour: "#445566", dataFills: ["#111111"], edgeLabelTypeset: new Map([["$t_{pd}$", parsed]]),
  }).svg;
  const headPath = (svg, colour) => new RegExp(`<path d="([^"]+)" fill="${colour}"/>`).exec(svg)?.[1];
  assert(styled.includes('fill="#111111"'), "the selected data-signal fill is used");
  assert(styled.includes('stroke="#112233" stroke-width="2.2"'), "the arrow line has its own colour and width");
  assert(styled.includes('fill="#445566"'), "the arrowhead has its own colour");
  assert(headPath(styled, "#445566") !== headPath(defaults, "#000000"), "the arrowhead size is independent of line width");
  assert(styled.includes('class="td-edge-label-math"') && styled.includes('scale(0.01)'), "the edge title is drawn from the typeset paths at label size");
});

Deno.test("signal-line colour persists and is cleared by the theme-colour reset", async () => {
  const { empty, resetTimingColours, setSignalLineColour, signalLineColourOf, toWaveDrom } = await import("../src/model.js");
  const fallback = "#ABCDEF";
  const styled = setSignalLineColour(empty(), "#123456");
  eq(signalLineColourOf(styled, fallback), "#123456");
  eq(toWaveDrom(styled).config.signalLineColour, "#123456");
  eq(signalLineColourOf(resetTimingColours(styled), fallback), fallback);
});

Deno.test("arrow shape colour and dotted state persist independently", async () => {
  const { edgeStyleOf, empty, resetTimingColours, setEdgeStyle, toWaveDrom } = await import("../src/model.js");
  let value = setEdgeStyle(empty(), "curved", { colour: "#123456", dotted: true });
  eq(edgeStyleOf(value, "curved"), { colour: "#123456", dotted: true });
  eq(toWaveDrom(value).config.edgeStyles.curved, { colour: "#123456", dotted: true });
  value = setEdgeStyle(value, "curved", { dotted: false });
  eq(edgeStyleOf(value, "curved"), { colour: "#123456", dotted: false });
  const reset = resetTimingColours(setEdgeStyle(value, "straight", { colour: "#654321", dotted: true }));
  eq(edgeStyleOf(reset, "straight"), { colour: null, dotted: true });
});

Deno.test("resetTimingLook removes visual overrides but preserves waveform content and unrelated config", async () => {
  const { resetTimingLook } = await import("../src/model.js");
  const value = {
    signal: [{ name: "D", wave: "01xz" }], edge: ["a->b"], head: { text: "Title" },
    config: {
      steps: 4, keepThis: "yes", hscale: 2, slant: 0, fontSize: 18, lineWidth: 3, showNames: false,
      signalLineColour: "#123456", dataColours: ["#234567"], edgeLineWidth: 2, edgeLineColour: "#345678",
      arrowHeadSize: 10, arrowHeadColour: "#456789", edgeStyles: { straight: { colour: "#56789A", dotted: true } },
    },
  };
  const reset = resetTimingLook(value);
  eq(reset.signal, value.signal);
  eq(reset.edge, value.edge);
  eq(reset.head, value.head);
  eq(reset.config, { steps: 4, keepThis: "yes" });
});
