// The drawing and the SVG export. No DOM.
//
// drawing() turns a document into what is drawn, in SVG modules (y down): element
// placements, wire polylines, joints and junction dots. The canvas (view.js) and the
// export both draw from it, so the screen and the file agree.
//
// exportSvg() writes a standalone file for slides (proposal section 7): real size in
// cm, transparent background, one module of margin, every glyph an inline path (each
// <use> in the pack's SVG is expanded in place), colours resolved to attributes, and
// no fonts, links, ids, classes or CSS.

import { boxOf, elementSvgBox, fmt, MODULE_CM, svgTransform, toSvg } from "./geometry.js";
import { allCorners } from "./doc.js";
import { dots, joints, SEAM_PATCH } from "./junctions.js";
import { attr, walk, writeXml } from "./xml.js";

export function drawing(doc, pack) {
  const { line, junction } = pack.theme;
  const corners = allCorners(doc, pack);
  const elements = doc.elements.filter((el) => pack.def(el.type)).map((el) => ({
    el, transform: svgTransform(el), box: elementSvgBox(el, pack.def(el.type)),
  }));
  const wires = [...corners].map(([id, c]) => ({ id, points: c.map(toSvg) }));
  const jts = joints(doc, pack, corners).map((j) => ({
    at: toSvg(j.at), r: (line.width_module / 2) * (j.straight ? SEAM_PATCH : 1), straight: j.straight,
  }));
  const ds = dots(doc, pack).map((d) => ({ id: d.id, at: toSvg(d.at), r: junction.radius_module }));

  const pts = [];
  for (const e of elements) pts.push(e.box.min, e.box.max);
  const hw = line.width_module / 2;
  for (const w of wires) for (const [x, y] of w.points) pts.push([x - hw, y - hw], [x + hw, y + hw]);
  for (const d of ds) pts.push([d.at[0] - d.r, d.at[1] - d.r], [d.at[0] + d.r, d.at[1] + d.r]);
  return { elements, wires, joints: jts, dots: ds, box: pts.length ? boxOf(pts) : null };
}

export const pathData = (points) => points.map(([x, y], i) => `${i ? "L" : "M"} ${fmt(x)} ${fmt(y)}`).join(" ");

// ---- the pack's SVG, made standalone -------------------------------------------------

const DROP = new Set(["class", "id", "overflow", "version", "xmlns", "xmlns:xlink"]);

function hex(colour) {
  const m = /^rgb\(\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)\s*\)$/.exec(colour.trim());
  if (!m) return colour.trim();
  const ch = (v, pct) => Math.round(pct ? (+v * 255) / 100 : +v).toString(16).padStart(2, "0").toUpperCase();
  return `#${ch(m[1], m[2])}${ch(m[3], m[4])}${ch(m[5], m[6])}`;
}

/** style="a:b;c:d" to presentation attributes, so every SVG reader (PowerPoint included) sees them. */
function cleanAttrs(attrs) {
  const out = [];
  for (const [k, v] of attrs) {
    if (DROP.has(k) || k.startsWith("data-")) continue;
    if (k === "style") {
      for (const decl of v.split(";")) {
        const i = decl.indexOf(":");
        if (i > 0) out.push([decl.slice(0, i).trim(), hex(decl.slice(i + 1))]);
      }
    } else out.push([k, /fill|stroke/.test(k) ? hex(v) : v]);
  }
  return out;
}

const standaloneCache = new WeakMap();

/** The element's body and leads as plain nodes: <use> expanded, <defs>/<symbol> gone. */
export function standaloneSymbol(pack, type) {
  if (!standaloneCache.has(pack)) standaloneCache.set(pack, new Map());
  const cache = standaloneCache.get(pack);
  if (cache.has(type)) return cache.get(type);
  const root = pack.svgs.get(type);
  const ids = new Map();
  walk(root, (n) => { const id = attr(n, "id"); if (id) ids.set(id, n); });
  const expand = (n) => {
    if (n.tag === "defs" || n.tag === "symbol") return [];
    if (n.tag === "use") {
      const href = attr(n, "xlink:href") ?? attr(n, "href") ?? "";
      const target = href.startsWith("#") && ids.get(href.slice(1));
      if (!target) throw new Error(`${type}.svg: <use> points at ${href || "nothing"}, which is not in the file`);
      const x = +(attr(n, "x") ?? 0), y = +(attr(n, "y") ?? 0);
      const t = [attr(n, "transform"), x || y ? `translate(${fmt(x)} ${fmt(y)})` : null].filter(Boolean).join(" ");
      const rest = cleanAttrs(n.attrs.filter(([k]) => !["x", "y", "transform", "xlink:href", "href", "width", "height"].includes(k)));
      const kids = (target.tag === "symbol" ? target.children : [target]).flatMap(expand);
      return [{ tag: "g", attrs: t ? [...rest, ["transform", t]] : rest, children: kids }];
    }
    const node = { tag: n.tag, attrs: cleanAttrs(n.attrs), children: n.children.flatMap(expand) };
    if (node.tag === "g" && !node.attrs.length) return node.children;   // drop empty wrappers
    if (node.tag === "g" && !node.children.length) return [];
    return [node];
  };
  const nodes = root.children.flatMap(expand);
  cache.set(type, nodes);
  return nodes;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A standalone SVG file of the figure. */
export function exportSvg(doc, pack) {
  const { roles, line } = pack.theme;
  const d = drawing(doc, pack);
  const m = 1;   // one module of margin
  const box = d.box ?? { min: [0, 0], max: [0, 0] };
  const [x0, y0] = [box.min[0] - m, box.min[1] - m];
  const [w, h] = [box.max[0] - box.min[0] + 2 * m, box.max[1] - box.min[1] + 2 * m];
  const out = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${fmt(w * MODULE_CM)}cm" height="${fmt(h * MODULE_CM)}cm" viewBox="${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)}">`,
    `  <title>${esc(doc.title ?? doc.id)}</title>`,
  ];
  if (d.wires.length) {
    out.push(`  <g fill="none" stroke="${roles.low}" stroke-width="${fmt(line.width_module)}" stroke-linecap="${line.cap}" stroke-linejoin="${line.join}">`);
    for (const wire of d.wires) out.push(`    <path d="${pathData(wire.points)}"/>`);
    out.push("  </g>");
  }
  for (const e of d.elements) {
    out.push(`  <g transform="${e.transform}">`);
    for (const n of standaloneSymbol(pack, e.el.type)) out.push(writeXml(n, "    "));
    out.push("  </g>");
  }
  const circles = [...d.joints, ...d.dots];
  if (circles.length) {
    out.push(`  <g fill="${roles.low}" stroke="none">`);
    for (const c of circles) out.push(`    <circle cx="${fmt(c.at[0])}" cy="${fmt(c.at[1])}" r="${fmt(c.r)}"/>`);
    out.push("  </g>");
  }
  out.push("</svg>", "");
  return out.join("\n");
}
