// F29: the diagram is always filled edge to edge, waves are cut exactly at the plot's right edge, delay fills the left
// with the first value, phase fills the right with the last value, and a signal can be hidden (wave, name) while its row
// and arrow nodes stay put. Run: quarto run tools/timing/test/run.js
const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
import { drawTiming } from "../src/draw.js";
import { fromWaveDrom, setProp, toWaveDrom } from "../src/model.js";

const near = (a, b, e = 0.02) => Math.abs(a - b) < e;
const numbers = (d) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0]);
const pairs = (d) => { const n = numbers(d), out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; };
const paths = (svg) => [...svg.matchAll(/<path\b[^>]*\bd="(M[^"]*)"[^>]*>/g)].map((m) => ({ tag: m[0], d: m[1], pts: pairs(m[1]), closed: m[1].endsWith("Z") }));
/** The stroked signal lines (round caps), not bars, arrows or hatch. */
const lines = (svg) => paths(svg).filter((p) => /stroke-linecap="round"/.test(p.tag));
const bars = (svg) => paths(svg).filter((p) => p.closed && /stroke-linejoin="round"/.test(p.tag) && !/fill="none"/.test(p.tag));

function draw(signal, options = {}, extra = {}) {
  const r = drawTiming({ signal, ...extra }, { width: 400, height: 40 + 30 * signal.length, ...options });
  const g = r.geometry;
  return { svg: r.svg, g, end: g.x0 + g.steps * g.stepW, lane: (i) => { const top = g.top + i * g.laneH; return { yh: top + g.laneH * 0.17, yl: top + g.laneH * 0.83, ym: top + g.laneH * 0.5 }; } };
}

Deno.test("nothing is drawn right of the plot end, whatever the period, delay and phase", () => {
  const signal = [
    { name: "A", wave: "01x=z", data: ["d"], period: 2, delay: 0.5, phase: 1, node: "a" },
    { name: "B", wave: "pPnN.", period: 2, delay: 0.5 },
    { name: "C", wave: "0.1.x.=|1", delay: 1.25 },
    { name: "D", wave: "01", period: 3, phase: 0.5 },
  ];
  for (const options of [{}, { centerTransitions: true, levelFills: { unknown: "#CC79A7", floating: "#0072B2" }, paper: "#ffffff" }]) {
    const { svg, end } = draw(signal, { fitText: true, ...options });
    for (const p of paths(svg)) for (const [x] of p.pts) assert(x <= end + 0.02, `x ${x} is right of the plot end ${end} in ${p.d.slice(0, 60)}`);
  }
});

Deno.test("a wave that ends exactly at the edge is cut there with no end shape: the last bar has a straight edge", () => {
  const { svg, end, lane } = draw([{ name: "A", wave: "0=", data: ["v"] }, { name: "B", wave: "=", data: ["v"] }]);
  const l = lane(0), [bar] = bars(svg);
  assert(bar.pts.some(([x, y]) => near(x, end) && near(y, l.yh)) && bar.pts.some(([x, y]) => near(x, end) && near(y, l.yl)), "straight edge at the right");
  assert(!bar.pts.some(([x, y]) => near(y, l.ym) && x > end - 3), "no point at the end");
});

Deno.test("delay fills the left with the first value: a level, a bar, X and a clock", () => {
  const level = draw([{ name: "A", wave: "01", delay: 1 }]);
  const first = lines(level.svg)[0].pts[0], l = level.lane(0);
  assert(near(first[0], level.g.x0) && near(first[1], l.yl), `level holds its first value from the left edge: ${first}`);

  const bar = draw([{ name: "A", wave: "=0", data: ["v"], delay: 1 }]);
  const b = bars(bar.svg)[0], bl = bar.lane(0);
  assert(b.pts.some(([x, y]) => near(x, bar.g.x0) && near(y, bl.yh)) && b.pts.some(([x, y]) => near(x, bar.g.x0) && near(y, bl.yl)), "the bar starts at the left edge, square");
  assert(!b.pts.some(([x, y]) => near(x, bar.g.x0) && near(y, bl.ym)), "no point at the left edge");
  assert(bar.svg.split(">v</text>").length === 2, "its label is kept once");

  const x = draw([{ name: "A", wave: "x1", delay: 1 }], { levelFills: { unknown: "#CC79A7" }, paper: "#ffffff" });
  const hatch = paths(x.svg).filter((p) => !p.closed && /fill="none"/.test(p.tag) && !/stroke-linecap/.test(p.tag));
  assert(hatch.length && Math.min(...hatch.flatMap((h) => h.pts.map((q) => q[0]))) < x.g.x0 + 8, "the hatch starts at the left edge");

  const clock = draw([{ name: "C", wave: "p", delay: 1 }, { name: "D", wave: "0101" }]);
  const c = lines(clock.svg).find((p) => p.pts.length >= 3);
  assert(c.pts.filter(([px]) => px < clock.g.x0 + clock.g.stepW - 0.02).length >= 3, "the clock continues its pattern backwards into the delay");
});

Deno.test("phase fills the right with the last value: a level, a bar, a clock", () => {
  const level = draw([{ name: "A", wave: "01", phase: 1 }]);
  const last = lines(level.svg)[0].pts.at(-1), l = level.lane(0);
  assert(near(last[0], level.end) && near(last[1], l.yh), `level holds its last value to the right edge: ${last}`);

  const bar = draw([{ name: "A", wave: "0=", data: ["v"], phase: 1 }]);
  const b = bars(bar.svg)[0], bl = bar.lane(0);
  assert(near(Math.max(...b.pts.map((p) => p[0])), bar.end) && b.pts.some(([x, y]) => near(x, bar.end) && near(y, bl.yh)), "the bar runs to the right edge");

  const clock = draw([{ name: "C", wave: "p", phase: 1 }, { name: "D", wave: "0101" }]);
  const c = lines(clock.svg).find((p) => p.pts.length >= 3);
  assert(near(Math.max(...c.pts.map((p) => p[0])), clock.end, 0.5), "the clock continues to the right edge");
});

Deno.test("hidden: the wave is not drawn, the row keeps its name, and arrow nodes stay exactly where they were", () => {
  const signal = (hidden) => [{ name: "A", wave: "0101", node: "a..." }, { name: "Bsig", wave: "0=1x", data: ["v"], node: ".b..", ...(hidden ? { hidden: true } : {}) }];
  const withEdge = (hidden) => draw(signal(hidden), {}, { edge: ["a~>b"] });
  const shown = withEdge(false), hid = withEdge(true);
  const edge = (r) => paths(r.svg).find((p) => /stroke="#|stroke="currentColor"/.test(p.tag) && /fill="none"/.test(p.tag) && p.d.includes("C"))?.d;
  assert(edge(shown) && edge(shown) === edge(hid), `the arrow joins the same points: ${edge(shown)} vs ${edge(hid)}`);
  const band = hid.g.top + hid.g.laneH, inBand = (r) => lines(r.svg).concat(bars(r.svg)).filter((p) => p.pts.some(([, y]) => y >= band && y <= band + hid.g.laneH));
  assert(inBand(shown).length > 0 && inBand(hid).length === 0, "no wave in the hidden row");
  assert(hid.svg.includes(">Bsig</text>"), "the name is still there");
});

Deno.test("hideName: the name is not drawn, the wave is", () => {
  const { svg } = draw([{ name: "Aname", wave: "01" }, { name: "Bname", wave: "01", hideName: true }]);
  assert(svg.includes(">Aname</text>") && !svg.includes(">Bname</text>"), "only the hidden name is gone");
  assert(lines(svg).length >= 2, "both waves are drawn");
});

Deno.test("hidden and hideName are saved in the file and kept by the model", () => {
  let v = fromWaveDrom({ signal: [{ name: "A", wave: "01" }, { name: "B", wave: "01" }] });
  v = setProp(v, 1, "hidden", true);
  v = setProp(v, 0, "hideName", true);
  const out = toWaveDrom(v);
  assert(out.signal[1].hidden === true && out.signal[0].hideName === true, JSON.stringify(out));
  const back = toWaveDrom(fromWaveDrom(JSON.parse(JSON.stringify(out))));
  assert(back.signal[1].hidden === true && back.signal[0].hideName === true, "round trip");
  v = setProp(v, 1, "hidden", false);
  assert(!("hidden" in toWaveDrom(v).signal[1]), "false removes the key");
});

Deno.test("loading resets the look to the defaults and keeps the waves, nodes and signal options", async () => {
  const { resetTimingLook } = await import("../src/model.js");
  const saved = { signal: [{ name: "A", wave: "01", node: "a.", hidden: true, hideName: true, delay: 0.5 }], edge: ["a->a"], config: { hscale: 2, slant: 9, fontSize: 20, lineWidth: 4, signalLineColour: "#ff0000", showNames: false, dataColours: ["#111111"] } };
  const out = toWaveDrom(resetTimingLook(fromWaveDrom(saved)));
  assert(!out.config, `look keys are gone: ${JSON.stringify(out.config)}`);
  assert(out.signal[0].hidden === true && out.signal[0].hideName === true && out.signal[0].delay === 0.5 && out.signal[0].node === "a." && out.edge.length === 1, "waves and options are kept");
});
