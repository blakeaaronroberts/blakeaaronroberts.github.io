// F19: the slide model, the six layouts, saving in the figure, and the slide and part exports.

import { contentArea, cleanSlide, defaultSlide, LAYOUTS, nudgeRegion, slideOf, slideSize, slideSvg, withLayout, withSlide } from "../src/slide.js";
import { parse, serialize } from "../src/doc.js";
import { captureFrame } from "../src/levelframes.js";
import { buildClaChevron } from "../examples/cla-chevron.js";
import { assert, assertClose, assertEquals, pack, typeset } from "./helpers.js";

const doc = () => buildClaChevron(pack);
const inside = (r, a) => r.x >= a.x && r.y >= a.y && r.x + r.w <= a.x + a.w && r.y + r.h <= a.y + a.h;
const root = (svg) => ({ w: +/width="([\d.]+)cm"/.exec(svg)[1], h: +/height="([\d.]+)cm"/.exec(svg)[1] });

Deno.test("sizes are PowerPoint's; the content area sits between the header and footer on whole modules", () => {
  assertClose(slideSize("16:9").w * 0.5, 33.867, 1e-9);
  const a = contentArea({ format: "16:9", headerCm: 3, footerCm: 1 });
  assertEquals([a.x, a.y], [1, 6]);
  assert(Number.isInteger(a.w) && Number.isInteger(a.h));
});

Deno.test("each of the six layouts fills the content area with regions on the grid, none overlapping", () => {
  assertEquals(Object.keys(LAYOUTS).length, 6);
  for (const id of Object.keys(LAYOUTS)) {
    const s = withLayout({ format: "16:9", headerCm: 3, footerCm: 1 }, id), a = contentArea(s);
    for (const r of s.regions) {
      assert(inside(r, a), `${id}: ${r.id} inside the content area`);
      assert([r.x, r.y, r.w, r.h].every(Number.isInteger), `${id}: ${r.id} on the module grid`);
    }
    for (const p of s.regions) for (const q of s.regions) if (p !== q) assert(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${id}: ${p.id} and ${q.id} overlap`);
  }
});

Deno.test("the slide is saved in the figure and comes back; bad values are repaired", () => {
  const s = withLayout({ ...defaultSlide(), format: "4:3", headerCm: 2.5 }, "side");
  const text = serialize(withSlide(doc(), s), pack);
  assertEquals(slideOf(parse(text).doc), cleanSlide(s));
  const bad = cleanSlide({ format: "1:1", headerCm: -4, regions: [{ kind: "nope" }, { kind: "text", x: 999, y: -5, w: 1, h: 1 }] });
  assertEquals(bad.format, "16:9");
  assertEquals(bad.headerCm, 0);
  assertEquals(bad.regions.length, 1);
  assert(bad.regions[0].w >= 2 && bad.regions[0].x + bad.regions[0].w <= Math.floor(slideSize("16:9").w));
  const moved = nudgeRegion(s, s.regions[0].id, { dx: 2, dw: -3 });
  assertEquals([moved.regions[0].x - s.regions[0].x, moved.regions[0].w - s.regions[0].w], [2, -3]);
});

Deno.test("whole slide: slide size, no text placeholders or header in the file; strokes keep their drawn width", () => {
  const s = withLayout(defaultSlide(), "caption");
  const svg = slideSvg(doc(), pack, s, { typeset });
  assertEquals(root(svg), { w: 33.867, h: 19.05 });
  assert(!/fill-opacity="0.08"|stroke-dasharray="0.3/.test(svg), "no placeholder");
  const lw = pack.theme.line.width_module;
  const scale = +/scale\(([\d.]+)\)/.exec(svg)[1];
  const widths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => +m[1] * scale);
  assert(widths.some((x) => Math.abs(x - lw) < 1e-3), `a wire is ${lw} module wide on the slide (scale ${scale})`);
});

Deno.test("a part exports at exactly its slot size; a timing part is laid out at that size", () => {
  const s = withLayout(defaultSlide(), "over");
  const [sch, tim] = s.regions;
  assertEquals(root(slideSvg(doc(), pack, s, { typeset, only: sch.id })), { w: sch.w * 0.5, h: sch.h * 0.5 });
  const t = slideSvg(doc(), pack, s, { only: tim.id, timing: { source: { signal: [{ name: "clk", wave: "p..." }] } } });
  assertEquals(root(t), { w: tim.w * 0.5, h: tim.h * 0.5 });
  assert(t.includes(">clk</text>"));
});

Deno.test("a 2 by 2 grid draws each frame's own levels", () => {
  let d = doc();
  for (const n of ["a", "b", "c", "d"]) d = captureFrame(d, n);
  const svg = slideSvg(d, pack, withLayout(defaultSlide(), "grid"), { typeset });
  assertEquals((svg.match(/<g fill="none" stroke=/g) ?? []).length, 4);   // one wire group per drawn schematic
});
