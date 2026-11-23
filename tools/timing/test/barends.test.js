// F28: a filled bar (X, data) ends in one slanted edge into a 0 or 1 level, and the export is plain vector shapes
// (no pattern, clipPath, filter or mask), so it pastes into PowerPoint cleanly.
const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
import { drawTiming } from "../src/draw.js";

const near = (a, b) => Math.abs(a - b) < 0.02;
const has = (pts, x, y) => pts.some(([px, py]) => near(px, x) && near(py, y));
const numbers = (d) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0]);
const pairs = (d) => { const n = numbers(d), out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; };
/** The closed shapes (paths ending in Z), as point lists. */
const polygons = (svg) => [...svg.matchAll(/<path\b[^>]*\bd="(M[^"]*Z)"/g)].map((m) => pairs(m[1]));

/** One lane drawn 200 wide; returns the first bar's points and the lane's levels. */
function lane(wave, options = {}, config = {}) {
  const r = drawTiming({ signal: [{ name: "S", wave, data: ["a", "b"] }], config }, { width: 400, height: 60, ...options });
  const g = r.geometry, yh = g.top + g.laneH * 0.17, yl = g.top + g.laneH * 0.83;
  return { svg: r.svg, g, yh, yl, ym: (yh + yl) / 2, slope: Math.min(config.slant ?? 5, g.stepW * 0.15), bars: polygons(r.svg) };
}
const xAt = (l, i) => l.g.x0 + i * l.g.stepW;

for (const [label, options] of [["", {}], [" (centred transitions)", { centerTransitions: true }]]) {
  Deno.test(`a bar followed by 0 ends in one slanted edge into the low level${label}`, () => {
    for (const bar of ["x", "="]) {
      const l = lane(bar + "0", options), p = l.bars[0], xr = xAt(l, 1);
      assert(p, "bar drawn");
      assert(has(p, xr - l.slope, l.yh) && has(p, xr, l.yl), `${bar}: the top edge runs down to the low level at the step end`);
      assert(!has(p, xr, l.ym), `${bar}: no point at mid level`);
      assert(!p.some(([x, y]) => x > xr - l.slope - 0.02 && near(y, l.yl) && !near(x, xr)), `${bar}: the bottom edge stays on the low level`);
    }
  });
  Deno.test(`a bar followed by 1 mirrors it: the bottom edge rises to the high level${label}`, () => {
    for (const bar of ["x", "="]) {
      const l = lane(bar + "1", options), p = l.bars[0], xr = xAt(l, 1);
      assert(has(p, xr, l.yh) && has(p, xr - l.slope, l.yl), `${bar}: the bottom edge runs up to the high level at the step end`);
      assert(!has(p, xr, l.ym), `${bar}: no point at mid level`);
    }
  });
}
Deno.test("the level line after a bar starts where the slanted edge ends, with no gap", () => {
  for (const [wave, which] of [["x0", "yl"], ["x1", "yh"]]) {
    const l = lane(wave), xr = xAt(l, 1);
    const sig = [...l.svg.matchAll(/<path d="(M[^"Z]*)" fill="none" stroke="[^"]*" stroke-width="[^"]*" stroke-linecap="round"/g)].map((m) => pairs(m[1])).find((q) => q.length && near(q[0][1], l[which]));
    assert(sig, `${wave}: level line drawn`);
    assert(sig[0][0] >= xr - l.slope - 0.02 && sig[0][0] <= xr + 0.02, `${wave}: it starts at the edge's end (x ${sig[0][0]}, edge ${xr - l.slope}..${xr})`);
  }
});
Deno.test("bar to bar and bar to Z keep the pointed end (a bar at the end of the wave is cut straight: see fill.test.js)", () => {
  for (const wave of ["xx", "x=", "xz"]) {
    const l = lane(wave), p = l.bars[0];
    assert(has(p, xAt(l, 1), l.ym), `${wave}: point at mid level`);
  }
});
Deno.test("0 or 1 followed by a bar enters in one slanted edge (unchanged)", () => {
  const lo = lane("0x"), a = lo.bars[0], xl = xAt(lo, 1);
  assert(has(a, xl, lo.yl) && has(a, xl + lo.slope, lo.yh), "0 then X: up from the low level to the top");
  const hi = lane("1x"), b = hi.bars[0];
  assert(has(b, xl, hi.yh) && has(b, xl + hi.slope, hi.yl), "1 then X: down from the high level to the bottom");
});

Deno.test("exported SVG has no pattern, clipPath, filter or mask, and no clip-path attribute", () => {
  const value = { signal: [{ name: "A", wave: "0x1=z", data: ["d"], node: ".a..b" }, { name: "B", wave: "p.Pn.", node: "...c" }, { name: "C", wave: "x.0.x", delay: 0.5 }], edge: ["a->b", "a~>c"], head: { tick: 0 } };
  for (const options of [{}, { centerTransitions: true, levelFills: { unknown: "#CC79A7", floating: "#0072B2" }, paper: "#ffffff", marker: 1 }]) {
    const svg = drawTiming(value, { width: 500, height: 160, ...options }).svg;
    for (const token of ["<pattern", "patternTransform", "clipPath", "clip-path", "<filter", "<mask", "url(#"]) assert(!svg.includes(token), `${token} is in the export`);
  }
});
Deno.test("X hatch is plain 45 degree line segments in one stroke-only path, inside the bar", () => {
  const l = lane("0x0", { levelFills: { unknown: "#CC79A7" }, paper: "#ffffff" }), bar = l.bars[0];
  const hatch = [...l.svg.matchAll(/<path\b[^>]*\bd="(M[^"]*)"[^>]*>/g)].map((m) => ({ tag: m[0], pts: pairs(m[1]), d: m[1] }))
    .find((p) => !p.d.endsWith("Z") && /^(M [\d. -]+ L [\d. -]+ ?)+$/.test(p.d) && p.pts.length >= 6 && p.pts.every((q, i, a) => i % 2 === 0 || near(q[0] - a[i - 1][0], -(q[1] - a[i - 1][1]))));
  assert(hatch, "a hatch path of M/L 45 degree segments exists");
  assert(/fill="none"/.test(hatch.tag) && /stroke="/.test(hatch.tag), "stroke only");
  const [x0, x1] = [Math.min(...bar.map((p) => p[0])), Math.max(...bar.map((p) => p[0]))], [y0, y1] = [Math.min(...bar.map((p) => p[1])), Math.max(...bar.map((p) => p[1]))];
  assert(hatch.pts.every(([x, y]) => x >= x0 - 0.02 && x <= x1 + 0.02 && y >= y0 - 0.02 && y <= y1 + 0.02), "every end lies within the bar's box");
  const sums = hatch.pts.filter((_, i) => i % 2 === 0).map(([x, y]) => x + y);
  const gaps = sums.slice(1).map((s, i) => Math.abs(s - sums[i])).filter((g) => g > 0.05);
  assert(gaps.length && gaps.every((g) => near(g, 6 * Math.SQRT2) || near(g % (6 * Math.SQRT2), 0) || near((g % (6 * Math.SQRT2)) - 6 * Math.SQRT2, 0)), "the 6-unit spacing of the old pattern is kept");
});
Deno.test("bar fills are solid colours mixed with the paper colour, not translucent", () => {
  const l = lane("0x1=", { levelFills: { unknown: "#CC79A7" }, paper: "#ffffff", signalLineColour: "#000000" });
  assert(!/fill="#[0-9a-f]{6}" fill-opacity="0\.(35|08)"/i.test(l.svg), "no translucent bar fill");
  assert(l.svg.includes(`fill="#edd0e0"`), "the unknown fill is the 35% mix of #CC79A7 with white");
});
