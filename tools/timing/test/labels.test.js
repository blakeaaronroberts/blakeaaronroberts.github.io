// Hotfix: arrow labels never overlap; they push each other apart, each moving half the overlap, staying as near as they can to where they started.
const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
import { drawTiming, spreadLabels } from "../src/draw.js";

const overlap = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1e-6 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 1e-6;

Deno.test("two labels on top of each other are split apart, each moving the same distance in opposite directions", () => {
  const [a, b] = spreadLabels([{ x: 100, y: 50, w: 30, h: 14 }, { x: 100, y: 50, w: 30, h: 14 }]);
  assert(!overlap(a, b), "no overlap");
  assert(Math.abs((a.y - 50) + (b.y - 50)) < 1e-6 && a.x === 100 && b.x === 100, "split the difference: equal and opposite moves");
  assert(Math.abs(a.y - 50) <= 8, `moved no more than half the label height plus a gap: ${a.y}`);
});
Deno.test("labels that do not overlap stay exactly where they are; a label overlapped by two is pushed out of both", () => {
  const far = spreadLabels([{ x: 10, y: 10, w: 20, h: 10 }, { x: 100, y: 10, w: 20, h: 10 }]);
  assert(far[0].x === 10 && far[1].x === 100, "untouched");
  const row = spreadLabels([{ x: 100, y: 50, w: 30, h: 14 }, { x: 110, y: 52, w: 30, h: 14 }, { x: 120, y: 54, w: 30, h: 14 }]);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert(!overlap(row[i], row[j]), `${i} and ${j} apart`);
});
Deno.test("labels stay inside the bounds they are given", () => {
  const out = spreadLabels([{ x: 5, y: 5, w: 30, h: 14 }, { x: 5, y: 5, w: 30, h: 14 }], { x0: 0, y0: 0, x1: 200, y1: 60 });
  for (const l of out) assert(l.x - l.w / 2 >= -1e-6 && l.y - l.h / 2 >= -1e-6, JSON.stringify(l));
});

Deno.test("in a drawing, two arrows between the same nodes get labels that do not overlap", () => {
  const value = { signal: [{ name: "A", wave: "01", node: "a." }, { name: "B", wave: "01", node: ".b" }], edge: ["a~>b first", "a->b second", "a-|>b third"] };
  const svg = drawTiming(value, { width: 400, height: 140, paper: "#ffffff", fontSize: 12 }).svg;
  const rects = [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)" fill="#ffffff"\/>/g)].map((m) => ({ x: +m[1] + +m[3] / 2, y: +m[2] + +m[4] / 2, w: +m[3], h: +m[4] }));
  assert(rects.length === 3, `three label patches, got ${rects.length}`);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert(!overlap(rects[i], rects[j]), `labels ${i} and ${j} overlap`);
});
