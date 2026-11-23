// F29.6: sizing the diagram to the view window. Run: quarto run tools/timing/test/run.js
import { fitSize } from "../src/fit.js";
import { naturalSize } from "../src/draw.js";

const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const value = { signal: [{ name: "clk", wave: "p......." }, { name: "D", wave: "0.1..0.." }, { name: "Q", wave: "x.1..0.." }] };
const natural = naturalSize(value);

Deno.test("a big window is filled in both directions", () => {
  const f = fitSize(natural, { w: 1400, h: 700 }, { steps: 8 });
  assert(f.w === 1400 && f.h === 700 && !f.scrolls, JSON.stringify(f));
});
Deno.test("a narrow or short window shrinks the diagram, down to a readable minimum", () => {
  const f = fitSize(natural, { w: natural.w - 100, h: natural.h - 20 }, { steps: 8 });
  assert(f.w === natural.w - 100 && f.h === natural.h - 20 && !f.scrolls, `shrinks: ${JSON.stringify(f)}`);
  const tiny = fitSize(natural, { w: 50, h: 30 }, { steps: 8 });
  assert(tiny.w > 50 && tiny.h > 30 && tiny.scrolls, `stops at the minimum and scrolls: ${JSON.stringify(tiny)}`);
  assert(tiny.w >= natural.w - 8 * 40 * 0.6 - 1 && tiny.h >= Math.round(natural.h * 0.6), "minimum is 40% step width and 60% height");
});
Deno.test("large text is not squeezed: its natural size is the minimum", () => {
  const f = fitSize(natural, { w: 100, h: 50 }, { steps: 8, largeText: true });
  assert(f.w === natural.w && f.h === natural.h && f.scrolls, JSON.stringify(f));
});
Deno.test("an unknown window (size 0) draws the natural size", () => {
  const f = fitSize(natural, { w: 0, h: 0 }, { steps: 8 });
  assert(f.w === natural.w && f.h === natural.h && !f.scrolls, JSON.stringify(f));
});
Deno.test("the fitted size draws with text at the same size and the waves re-spaced", async () => {
  const { drawTiming } = await import("../src/draw.js");
  const big = drawTiming(value, { width: 1200, height: 600 }), small = drawTiming(value, { width: 420, height: 160 });
  const fontOf = (s) => /font-size="([\d.]+)"/.exec(s.svg)[1];
  assert(fontOf(big) === fontOf(small), "text is not scaled");
  assert(big.geometry.stepW > small.geometry.stepW && big.geometry.laneH > small.geometry.laneH, "steps and lanes are re-spaced");
});
