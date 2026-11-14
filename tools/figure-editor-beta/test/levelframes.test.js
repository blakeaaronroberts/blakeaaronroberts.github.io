// F11.2: level frames kept in the figure's `groups`, applied to the drawing, and every frame on one slide.

import { exportGridSvg, exportSvg } from "../src/export.js";
import { parse, serialize, setLevel } from "../src/doc.js";
import { REFERENCE_TEX } from "../src/labels.js";
import {
  applyFrame, captureFrame, frameTex, framesOf, gridShape, moveFrame, numbered, removeFrame, renameFrame,
} from "../src/levelframes.js";
import { buildClaChevron } from "../examples/cla-chevron.js";
import { assert, assertEquals, pack, typeset } from "./helpers.js";

const base = () => buildClaChevron(pack);

Deno.test("capture stores the current levels; apply draws them; the figure's own levels are untouched", () => {
  let doc = setLevel(base(), [base().wires[0].id], "1");
  doc = captureFrame(doc);
  const doc2 = captureFrame(setLevel(doc, [doc.wires[0].id], "0"), "Reset");
  const [a, b] = framesOf(doc2);
  assertEquals(a.name, "Frame 1");
  assertEquals(b.name, "Reset");
  assertEquals(a.levels[doc.wires[0].id], "1");
  assertEquals(b.levels[doc.wires[0].id], "0");
  assertEquals(applyFrame(doc2, a).wires[0].level, "1");
  assertEquals(applyFrame(doc2, { name: "x", levels: {} }).wires[0].level, undefined);
  assertEquals(doc2.wires[0].level, "0");
});

Deno.test("rename, move and delete", () => {
  let doc = base();
  for (const n of ["a", "b", "c"]) doc = captureFrame(doc, n);
  doc = moveFrame(doc, 2, -1);
  assertEquals(framesOf(doc).map((f) => f.name), ["a", "c", "b"]);
  doc = renameFrame(doc, 0, "start");
  doc = removeFrame(doc, 1);
  assertEquals(framesOf(doc).map((f) => f.name), ["start", "b"]);
  assertEquals(framesOf(removeFrame(removeFrame(doc, 0), 0)), []);
  assertEquals(removeFrame(removeFrame(doc, 0), 0).groups, undefined);
});

Deno.test("frames survive save and reload and the file stays within the schema's fields", () => {
  let doc = setLevel(base(), [base().wires[0].id], "X");
  doc = captureFrame(doc, "Step 1");
  const text = serialize(doc, pack);
  const back = parse(text).doc;
  assertEquals(framesOf(back), framesOf(doc));
  assertEquals(serialize(back, pack), text);
  assertEquals(Object.keys(JSON.parse(text)).filter((k) => k === "frames"), []);
});

Deno.test("names become TeX text with special characters made plain", () => {
  assertEquals(frameTex("A_1 & B"), "\text{A\_1 \& B}");
});

Deno.test("numbering and grid shape", () => {
  assertEquals([numbered(0, 3), numbered(9, 12), numbered(99, 120)], ["01", "10", "100"]);
  const g = gridShape(6, 16 / 9);
  assert(g.cols * g.rows >= 6 && g.cols >= g.rows, `${g.cols}x${g.rows}`);
  assertEquals(gridShape(1, 16 / 9), { cols: 1, rows: 1 });
});

Deno.test("all frames on one slide: slide-size SVG, every frame drawn once, no text elements", () => {
  let doc = base();
  const names = ["Frame 1", "Frame 2", "Frame 3"];
  for (const n of names) doc = captureFrame(setLevel(doc, [doc.wires[0].id], n === "Frame 2" ? "1" : "0"), n);
  const ts = new Map(typeset);
  for (const n of names) ts.set(frameTex(n), typeset.get(REFERENCE_TEX));
  const slide = { w: 33.867 / 0.5, h: 19.05 / 0.5 };
  const svg = exportGridSvg(doc, pack, framesOf(doc).map((f) => ({ name: f.name, doc: applyFrame(doc, f) })), slide, { typeset: ts });
  assert(/width="33\.867cm" height="19\.05cm"/.test(svg), "slide size");
  assertEquals((svg.match(/<g transform="translate\([^"]*\) scale\(/g) ?? []).length >= 6, true);
  assert(!/<text|<style|font/.test(svg));
  assert(svg !== exportSvg(doc, pack, { typeset: ts }));
});

Deno.test("a wire's net label is drawn as a label on the schematic", async () => {
  const { setWireLabels } = await import("../src/levelframes.js");
  const { labelItems } = await import("../src/labels.js");
  const doc = base();
  const id = doc.wires[0].id;
  const items = labelItems(setWireLabels(doc, [id], "CLK"), pack).filter((i) => i.kind === "net");
  assertEquals(items.map((i) => [i.id, i.text, i.error]), [[id, "CLK", null]]);
  assertEquals(labelItems(doc, pack).filter((i) => i.kind === "net").length, 0);
});

Deno.test("net label side and spacing move the label; the default is above a horizontal wire", async () => {
  const { setWireLabels, setWireLabelStyle } = await import("../src/levelframes.js");
  const { labelItems } = await import("../src/labels.js");
  let doc = base();
  const id = doc.wires[0].id;
  doc = setWireLabels(doc, [id], "CLK");
  const at = (d) => labelItems(d, pack).find((i) => i.kind === "net");
  const a = at(doc);
  assertEquals(a.dir, [0, 1]);
  const b = at(setWireLabelStyle(doc, [id], { side: "down", gap: 2 }));
  assertEquals(b.dir, [0, -1]);
  assertEquals(b.at[1], a.at[1] - 2);
});

Deno.test("the schematic part is exported at exactly its slide size", async () => {
  const { regions, defaultFrame } = await import("../src/frame.js");
  const { drawing } = await import("../src/export.js");
  const f = { ...defaultFrame(), layout: "below" }, r = regions(f).schematic;
  const doc = base(), d = drawing(doc, pack, { typeset });
  const rw = r.max[0] - r.min[0], rh = r.max[1] - r.min[1];
  const k = Math.max(1, (d.box.max[0] - d.box.min[0]) / rw, (d.box.max[1] - d.box.min[1]) / rh);
  const cx = (d.box.min[0] + d.box.max[0]) / 2, cy = (d.box.min[1] + d.box.max[1]) / 2;
  const svg = exportSvg(doc, pack, { typeset, scale: 1 / k, frame: { min: [cx - rw * k / 2, cy - rh * k / 2], max: [cx + rw * k / 2, cy + rh * k / 2] } });
  const w = +/width="([\d.]+)cm"/.exec(svg)[1], h = +/height="([\d.]+)cm"/.exec(svg)[1];
  assert(Math.abs(w - rw * 0.5) < 0.01 && Math.abs(h - rh * 0.5) < 0.01, `${w} x ${h}`);
});

Deno.test("a sent timing diagram is fitted into the timing part of the slide frame", async () => {
  const { timingGroup } = await import("../src/export.js");
  const g = timingGroup({ svg: '<svg width="100" height="50"><path d="M0 0"/></svg>', w: 100, h: 50 }, { min: [0, 0], max: [40, 10] });
  assert(g.includes("<path") && /translate\(/.test(g) && !g.includes("<svg"));
  assertEquals(timingGroup({ svg: "nope", w: 1, h: 1 }, { min: [0, 0], max: [1, 1] }), null);
});
