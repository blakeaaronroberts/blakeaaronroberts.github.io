// The exported SVG is standalone: real size, no text, fonts, links, ids, classes or CSS.

import { exportSvg } from "../src/export.js";
import { parseXml, walk } from "../src/xml.js";
import { buildFullAdder } from "../examples/full-adder.js";
import { assert, assertEquals, pack } from "./helpers.js";

const svg = exportSvg(buildFullAdder(pack), pack);
const root = parseXml(svg);

Deno.test("export is real size in cm with a viewBox in modules (0.5 cm)", () => {
  const a = Object.fromEntries(root.attrs);
  const [, , w, h] = a.viewBox.split(" ").map(Number);
  assertEquals(a.width, `${+(w * 0.5).toFixed(5)}cm`);
  assertEquals(a.height, `${+(h * 0.5).toFixed(5)}cm`);
});

Deno.test("export has no text, fonts, links, ids, classes, styles or <use>", () => {
  const tags = new Set(), names = new Set();
  walk(root, (n) => {
    if (n.tag !== "title") n.children.forEach((c) => assert(c.tag !== "#text", `text inside <${n.tag}>`));
    if (n.tag !== "#text") tags.add(n.tag);
    n.attrs.forEach(([k]) => names.add(k));
  });
  assertEquals([...tags].sort(), ["circle", "g", "path", "svg", "title"]);
  for (const bad of ["href", "xlink:href", "id", "class", "style", "font-family"]) assert(!names.has(bad), `has ${bad}`);
  assert(!/url\(|@import|<text|<style|https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(svg), "external reference found");
});

Deno.test("export draws every element, every wire and the two four-way dots", () => {
  const doc = buildFullAdder(pack);
  const groups = root.children.filter((n) => n.tag === "g");
  assertEquals(groups.filter((g) => g.attrs.some(([k]) => k === "transform")).length, doc.elements.length);
  const wires = groups.find((g) => g.attrs.some(([k, v]) => k === "fill" && v === "none"));
  assertEquals(wires.children.length, doc.wires.length);
  const dotR = String(pack.theme.junction.radius_module);
  let dots = 0;
  walk(root, (n) => { if (n.tag === "circle" && n.attrs.some(([k, v]) => k === "r" && v === dotR)) dots++; });
  assertEquals(dots, 2);
});

Deno.test("colours in the export are the pack theme's", () => {
  const colours = new Set();
  walk(root, (n) => n.attrs.forEach(([k, v]) => { if ((k === "fill" || k === "stroke") && v !== "none") colours.add(v.toUpperCase()); }));
  const theme = new Set([...Object.values(pack.theme.roles), ...Object.values(pack.theme.colors)].map((c) => c.toUpperCase()));
  for (const c of colours) assert(theme.has(c), `colour ${c} is not in theme.json`);
});
