// F10: the slide frame. Real slide sizes, regions, centring, and an export that is exactly the frame at 1:1.

import { drawing, exportSize, exportSvg } from "../src/export.js";
import { FORMATS, LAYOUTS, centreOn, cleanFrame, defaultFrame, frameBox, overflow, regions, sizeOf } from "../src/frame.js";
import { MODULE_CM } from "../src/geometry.js";
import { buildClaChevron } from "../examples/cla-chevron.js";
import { assert, assertClose, assertEquals, pack, typeset } from "./helpers.js";

const frameOf = (o = {}) => ({ ...defaultFrame(), ...o });
const rootOf = (svg) => {
  const g = (n) => new RegExp(`<svg[^>]* ${n}="([^"]*)"`).exec(svg)?.[1];
  return { width: g("width"), height: g("height"), viewBox: g("viewBox")?.split(" ").map(Number), overflow: g("overflow") };
};

Deno.test("the two slide sizes are PowerPoint's: 16:9 is 33.87 x 19.05 cm and 4:3 is 25.4 x 19.05 cm", () => {
  assertClose(FORMATS["16:9"].widthCm / FORMATS["16:9"].heightCm, 16 / 9, 1e-3);
  assertClose(FORMATS["4:3"].widthCm / FORMATS["4:3"].heightCm, 4 / 3, 1e-9);
  const { w, h } = sizeOf(frameOf());
  assertClose(w * MODULE_CM, 33.867, 1e-9);
  assertClose(h * MODULE_CM, 19.05, 1e-9);
});

Deno.test("the frame is centred on a grid point, y up, in the drawing's own coordinates", () => {
  const b = frameBox(frameOf({ x: 10, y: 6 }));
  const { w, h } = sizeOf(frameOf());
  assertClose((b.min[0] + b.max[0]) / 2, 5, 1e-9);        // 10 steps right = 5 modules
  assertClose((b.min[1] + b.max[1]) / 2, -3, 1e-9);       // 6 steps up = 3 modules, and y is down in modules
  assertClose(b.max[0] - b.min[0], w, 1e-9);
  assertClose(b.max[1] - b.min[1], h, 1e-9);
});

Deno.test("the regions partition the frame: the schematic's and, for a layout with one, the timing diagram's", () => {
  const f = frameBox(frameOf({ x: 4, y: -4 }));
  assertEquals(regions(frameOf({ x: 4, y: -4 })), { schematic: f, timing: null });
  for (const layout of ["below", "beside"]) {
    const fr = frameOf({ layout });
    const r = regions(fr), box = frameBox(fr);
    assert(r.timing, `${layout} has a timing region`);
    const area = (b) => (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]);
    assertClose(area(r.schematic) + area(r.timing), area(box), 1e-6, `${layout}: areas add up to the frame`);
    assertClose(area(r.schematic) / area(box), LAYOUTS[layout].split, 1e-9);
    if (layout === "below") { assertEquals(r.schematic.max[1], r.timing.min[1]); assertEquals(r.schematic.min[1], box.min[1]); assertEquals(r.timing.max[1], box.max[1]); }
    else { assertEquals(r.schematic.max[0], r.timing.min[0]); assertEquals(r.schematic.min[0], box.min[0]); assertEquals(r.timing.max[0], box.max[0]); }
  }
});

Deno.test("centring puts the middle of the schematic's region on the middle of the figure, to a grid step", () => {
  const box = { min: [-9.5, -4], max: [14, 6.25] };
  for (const layout of ["schematic", "below", "beside"]) {
    for (const format of ["16:9", "4:3"]) {
      const fr = centreOn(frameOf({ layout, format }), box);
      assert(Number.isInteger(fr.x) && Number.isInteger(fr.y));
      const r = regions(fr).schematic;
      assertClose((r.min[0] + r.max[0]) / 2, (box.min[0] + box.max[0]) / 2, 0.25 + 1e-9, `${layout} ${format} x`);
      assertClose((r.min[1] + r.max[1]) / 2, (box.min[1] + box.max[1]) / 2, 0.25 + 1e-9, `${layout} ${format} y`);
      assertEquals(overflow(fr, box), [], `${layout} ${format}: this figure fits`);
    }
  }
});

Deno.test("overflow names the sides a figure sticks out on, so a cut-off export is never a surprise", () => {
  const fr = frameOf({ format: "4:3" });
  const b = frameBox(fr);
  assertEquals(overflow(fr, null), []);
  assertEquals(overflow(fr, { min: [b.min[0] - 1, b.min[1]], max: [b.max[0], b.max[1] + 2] }), ["left", "bottom"]);
  assertEquals(overflow(frameOf({ layout: "below" }), { min: [0, 0], max: [1, 18] }), ["bottom"]);   // the schematic's region is only part of the frame
});

Deno.test("a frame read from the options is repaired: unknown formats and layouts, junk positions", () => {
  assertEquals(cleanFrame(null), defaultFrame());
  assertEquals(cleanFrame({ show: true, format: "21:9", layout: "left", x: "7.6", y: "abc" }), { show: true, format: "16:9", layout: "schematic", x: 8, y: 0 });
  assertEquals(cleanFrame({ show: "yes", format: "4:3", layout: "below", x: -3, y: 2 }), { show: false, format: "4:3", layout: "below", x: -3, y: 2 });
});

Deno.test("exporting the frame writes exactly the frame's rectangle at real size, with no margin", () => {
  const doc = buildClaChevron(pack);
  const fr = centreOn(frameOf(), drawing(doc, pack, { typeset }).box);
  const svg = exportSvg(doc, pack, { typeset, frame: frameBox(fr) });
  const r = rootOf(svg), b = frameBox(fr);
  assertEquals(r.width, `${+(33.867).toFixed(5)}cm`);
  assertEquals(r.height, `${+(19.05).toFixed(5)}cm`);
  assertClose(r.viewBox[0], b.min[0], 1e-4); assertClose(r.viewBox[1], b.min[1], 1e-4);
  assertClose(r.viewBox[2], b.max[0] - b.min[0], 1e-4); assertClose(r.viewBox[3], b.max[1] - b.min[1], 1e-4);
  assertEquals(r.overflow, "hidden");
  // the scale option multiplies the size, never the drawing
  const half = rootOf(exportSvg(doc, pack, { typeset, frame: frameBox(fr), scale: 0.5 }));
  assertEquals(half.width, `${+(33.867 * 0.5).toFixed(5)}cm`);
  assertEquals(half.viewBox, r.viewBox);
  const size = exportSize(drawing(doc, pack, { typeset }), 1, frameBox(fr));
  assertClose(size.widthCm, 33.867, 1e-9);
  assertClose(size.heightCm, 19.05, 1e-9);
});

Deno.test("the frame export draws the same figure as the plain export: only the root differs", () => {
  const doc = buildClaChevron(pack);
  const plain = exportSvg(doc, pack, { typeset });
  const framed = exportSvg(doc, pack, { typeset, frame: frameBox(centreOn(frameOf(), drawing(doc, pack, { typeset }).box)) });
  const body = (s) => s.slice(s.indexOf("<title>"));
  assertEquals(body(framed), body(plain));
  assert(rootOf(plain).overflow === undefined, "the plain export has no overflow attribute");
});

Deno.test("a figure larger than the frame is cut at the frame's edge by the viewBox, nothing is rescaled", () => {
  const doc = buildClaChevron(pack);
  const tiny = { min: [-3, -2], max: [3, 2] };                      // a 6 x 4 module window onto the figure
  const svg = exportSvg(doc, pack, { typeset, frame: tiny });
  const r = rootOf(svg);
  assertEquals(r.viewBox, [-3, -2, 6, 4]);
  assertEquals(r.width, `${6 * MODULE_CM}cm`);
  assertEquals(r.height, `${4 * MODULE_CM}cm`);
});
