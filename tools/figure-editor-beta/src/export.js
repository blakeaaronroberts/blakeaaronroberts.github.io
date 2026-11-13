// The drawing and the SVG export. No DOM.
//
// drawing() turns a document into what is drawn, in SVG modules (y down): element placements,
// wire polylines, joints, junction dots, labels and level tags. The canvas (view.js) and the
// export both draw from it, so the screen and the file agree.
//
// exportSvg() writes a standalone file for slides (proposal section 7): real size in cm times
// the scale option, transparent background, one module of margin, every glyph an inline path
// (each <use> in the pack's SVG is expanded in place, and MathJax's labels are paths already),
// colours resolved to attributes, and no fonts, links, ids, classes or CSS.

import { boxOf, elementBox, elementSvgBox, fmt, fromSvg, MODULE_CM, svgTransform, toSvg } from "./geometry.js";
import { allCorners, serialize } from "./doc.js";
import { metadataOf } from "./svgimport.js";
import { BLOCK, blockNodes } from "./block.js";
import { busMark, tagAnchor, withArrows } from "./marks.js";
import { dots, joints } from "./junctions.js";
import { colourNodes, emModules, labelItems, levelTagTex, packLabelPt, placeLabel, REFERENCE_TEX } from "./labels.js";
import { attr, walk, writeXml } from "./xml.js";

export class ExportError extends Error {}

const sameColour = (a, b) => a.toUpperCase() === b.toUpperCase();

/**
 * What is drawn. Options: `typeset` (a Map from TeX to parseTypeset's result: the labels),
 * `labelPt` (label size, default the pack's or the toolbox's 10 pt) and `levelTags` (a 0/1/X/Z
 * tag by each wire that has a level). `problems` lists labels that could not be drawn, and
 * `pending` those still waiting to be typeset.
 */
export function drawing(doc, pack, opts = {}) {
  const typeset = opts.typeset ?? new Map();
  const { line, junction, roles, geometry } = pack.theme;
  const ink = roles.ink;
  const lw = line.width_module;
  const corners = allCorners(doc, pack);

  // Colour by level: a wire's own, its leads' (the wire that ends on the pin), its joints' and its dots'.
  const levelOf = new Map(doc.wires.filter((w) => w.level).map((w) => [w.id, w.level]));
  const wireColour = (id) => pack.levelColour(levelOf.get(id)) ?? ink;
  const leadColour = new Map();
  for (const w of doc.wires) {
    const c = pack.levelColour(w.level);
    if (!c) continue;
    for (const end of [w.from, w.to]) if (typeof end === "string" && end.includes(".") && !leadColour.has(end)) leadColour.set(end, c);
  }

  // Element level: the body (outline, glyphs; not the leads) is drawn in the level's colour.
  const bodyColour = new Map(doc.elements.filter((e) => e.level && pack.levelColour(e.level)).map((e) => [e.id, pack.levelColour(e.level)]));
  const elements = doc.elements.filter((el) => pack.defFor(el)).map((el) => {
    const def = pack.defFor(el);
    const byPin = {};
    for (const pin of Object.keys(def.pins)) if (leadColour.has(`${el.id}.${pin}`)) byPin[pin] = leadColour.get(`${el.id}.${pin}`);
    const body = bodyColour.get(el.id) ?? null;
    const nodes = el.type === BLOCK ? blockNodes(el.params, pack, { body, leads: byPin })
      : withBodyColour(withLeadColours(standaloneSymbol(pack, el.type), byPin), ink, body);
    return { el, transform: svgTransform(el), box: elementSvgBox(el, def), nodes };
  });
  // A wire with arrowheads is drawn shorter, ending inside each head; a bus mark is a slash across its longest run.
  const spec = new Map(doc.wires.map((w) => [w.id, w]));
  const wires = [...corners].map(([id, c]) => {
    const w = spec.get(id), full = c.map(toSvg);
    const { points, heads } = withArrows(full, w.arrow, lw);
    const mark = w.bus ? busMark(c, lw) : null;
    return { id, points, heads, slash: mark?.slash ?? null, level: levelOf.get(id) ?? null, colour: wireColour(id) };
  });

  const jts = joints(doc, pack, corners).map((j) => {
    const owner = j.owners.find((o) => leadColour.has(o) || levelOf.has(o));
    const colour = owner === undefined ? ink : (leadColour.get(owner) ?? wireColour(owner));
    return { at: toSvg(j.at), r: (lw / 2) * (j.straight ? line.straight_joint_frac : 1), straight: j.straight, colour };
  });
  const ds = dots(doc, pack).map((dot) => ({
    id: dot.id, at: toSvg(dot.at), r: junction.radius_module,
    colour: wireColour(doc.junctions.find((j) => j.id === dot.id).on),
  }));

  // Labels and level tags: outlined paths from MathJax, placed by the pack's label gap and anchors.
  const em = emModules(pack, opts.labelPt ?? packLabelPt(pack));
  const gap = geometry.label_gap_cm / geometry.module_cm;
  const ref = typeset.get(REFERENCE_TEX);
  const labels = [], problems = [], pending = [];
  const put = (item, describe) => {
    if (item.error) { problems.push(`${describe}: ${item.error}`); return; }
    const ts = typeset.get(item.tex);
    if (!ts) { pending.push(item.tex); problems.push(`${describe}: not typeset yet`); return; }
    if (!ts.ok) { problems.push(`${describe}: ${ts.error}`); return; }
    const dir = item.dir ? [item.dir[0], -item.dir[1]] : null;
    const placed = placeLabel(ts, ref, toSvg(item.at), dir, em, gap);
    const colour = ink;   // F15: level colour is for the body only; a block's title text keeps the ink role like element names
    labels.push({ key: item.key, kind: item.kind, id: item.id, index: item.index, transform: placed.transform, box: placed.box, nodes: colourNodes(ts.nodes, colour) });
  };
  for (const item of labelItems(doc, pack, corners)) put(item, `label ${JSON.stringify(item.text)}`);
  if (opts.levelTags) {
    for (const [id, c] of corners) {
      const level = levelOf.get(id);
      if (!level) continue;
      const { at, dir } = tagAnchor(c);
      put({ key: `tag:${id}`, kind: "tag", id, tex: levelTagTex(level), at, dir, error: null }, `level tag of ${id}`);
    }
  }

  if (opts.levelTags) {   // a leveled element's tag sits just right of its top-right corner
    for (const el of doc.elements) {
      if (!el.level || !pack.defFor(el)) continue;
      put({ key: `tag:${el.id}`, kind: "tag", id: el.id, tex: levelTagTex(el.level), at: elementBox(el, pack.defFor(el)).max, dir: [1, 0], error: null }, `level tag of ${el.id}`);
    }
  }

  const pts = [];
  for (const e of elements) pts.push(e.box.min, e.box.max);
  const hw = lw / 2;
  for (const w of wires) {
    for (const [x, y] of w.points) pts.push([x - hw, y - hw], [x + hw, y + hw]);
    for (const h of w.heads) pts.push(h.tip, h.a, h.b);
    for (const [x, y] of w.slash ?? []) pts.push([x - hw, y - hw], [x + hw, y + hw]);
  }
  for (const d of ds) pts.push([d.at[0] - d.r, d.at[1] - d.r], [d.at[0] + d.r, d.at[1] + d.r]);
  for (const l of labels) pts.push(l.box.min, l.box.max);
  return { elements, wires, joints: jts, dots: ds, labels, problems, pending: [...new Set(pending)], box: pts.length ? boxOf(pts) : null };
}

/** Where a wire's 0/1/X/Z tag goes: the middle of its longest segment, above it (horizontal) or to its right (vertical). Grid steps, y up. */
export { tagAnchor };

/** An arrowhead as path data (modules). */
export const headPath = (h) => `M ${fmt(h.tip[0])} ${fmt(h.tip[1])} L ${fmt(h.a[0])} ${fmt(h.a[1])} L ${fmt(h.b[0])} ${fmt(h.b[1])} Z`;

/** Label and port boxes in grid steps (y up), for hit-testing and box selection. */
export function labelBoxes(d) {
  return d.labels.filter((l) => l.kind !== "tag").map((l) => {
    const a = fromSvg(l.box.min), b = fromSvg(l.box.max);
    return { kind: l.kind, id: l.id, index: l.index, box: boxOf([a, b]) };
  });
}

export const pathData = (points) => points.map(([x, y], i) => `${i ? "L" : "M"} ${fmt(x)} ${fmt(y)}`).join(" ");

// ---- the pack's SVG, made standalone -------------------------------------------------

const DROP = new Set(["class", "id", "overflow", "version", "xmlns", "xmlns:xlink"]);

export function hex(colour) {
  const m = /^rgb\(\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)\s*\)$/.exec(colour.trim());
  if (!m) return colour.trim();
  const ch = (v, pct) => Math.round(pct ? (+v * 255) / 100 : +v).toString(16).padStart(2, "0").toUpperCase();
  return `#${ch(m[1], m[2])}${ch(m[3], m[4])}${ch(m[5], m[6])}`;
}

/** style="a:b;c:d" to presentation attributes, so every SVG reader (PowerPoint included) sees them. Colours go through the theme. */
function cleanAttrs(attrs, pack) {
  const paint = (name, value) => (/^(fill|stroke)$/.test(name) && /^#[0-9A-Fa-f]{6}$/.test(hex(value)) ? pack.recolour(hex(value)) : value);
  const out = [];
  for (const [k, v] of attrs) {
    if (DROP.has(k) || k.startsWith("data-")) continue;
    if (k === "style") {
      for (const decl of v.split(";")) {
        const i = decl.indexOf(":");
        if (i > 0) { const name = decl.slice(0, i).trim(); out.push([name, paint(name, decl.slice(i + 1).trim())]); }
      }
    } else out.push([k, paint(k, v)]);
  }
  return out;
}

const standaloneCache = new WeakMap();

/**
 * The element's body and leads as plain nodes: <use> expanded, <defs>/<symbol> gone. A lead's node
 * carries `pin` (its pin's name), which is not an attribute, so it never reaches a file.
 */
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
      const rest = cleanAttrs(n.attrs.filter(([k]) => !["x", "y", "transform", "xlink:href", "href", "width", "height"].includes(k)), pack);
      const kids = (target.tag === "symbol" ? target.children : [target]).flatMap(expand);
      return [{ tag: "g", attrs: t ? [...rest, ["transform", t]] : rest, children: kids }];
    }
    const node = { tag: n.tag, attrs: cleanAttrs(n.attrs, pack), children: n.children.flatMap(expand) };
    if (n.tag === "path" && (attr(n, "class") ?? "").split(/\s+/).includes("lead") && attr(n, "data-pin")) node.pin = attr(n, "data-pin");
    if (node.tag === "g" && !node.attrs.length) return node.children;   // drop empty wrappers
    if (node.tag === "g" && !node.children.length) return [];
    return [node];
  };
  const nodes = root.children.flatMap(expand);
  cache.set(type, nodes);
  return nodes;
}

/** The symbol's nodes with some leads recoloured (a copy; the cached nodes are never changed). */
export function withLeadColours(nodes, byPin) {
  if (!Object.keys(byPin).length) return nodes;
  const walkCopy = (n) => {
    const attrs = n.pin && byPin[n.pin] ? n.attrs.map(([k, v]) => [k, k === "stroke" ? byPin[n.pin] : v]) : n.attrs;
    return { ...n, attrs, children: n.children.map(walkCopy) };
  };
  return nodes.map(walkCopy);
}

/** The symbol's body nodes with ink recoloured to `colour` (a copy). Leads (nodes with a pin) keep theirs; fills that are not ink stay. */
export function withBodyColour(nodes, ink, colour) {
  if (!colour) return nodes;
  const walkCopy = (n) => {
    if (n.pin) return n;
    const attrs = n.attrs.map(([k, v]) => [k, (k === "fill" || k === "stroke") && sameColour(v, ink) ? colour : v]);
    return { ...n, attrs, children: n.children.map(walkCopy) };
  };
  return nodes.map(walkCopy);
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The exported file's size for a drawing: real size (its box plus a module of margin, 0.5 cm a module) times the scale option. */
export function exportSize(d, scale = 1, frame = null) {
  const box = frame ?? d.box ?? { min: [0, 0], max: [0, 0] }, m = frame ? 0 : 1;
  return { widthCm: (box.max[0] - box.min[0] + 2 * m) * MODULE_CM * scale, heightCm: (box.max[1] - box.min[1] + 2 * m) * MODULE_CM * scale };
}

/**
 * A standalone SVG file of the figure. Options: scale (1 is real size), levelTags, labelPt, typeset
 * (see drawing). Throws ExportError if a label could not be drawn, so a file never silently lacks one.
 */
export function exportSvg(doc, pack, opts = {}) {
  const scale = opts.scale ?? 1;
  if (!(scale > 0 && Number.isFinite(scale))) throw new ExportError("the scale must be a number above 0");
  const { roles, line } = pack.theme;
  const d = drawing(doc, pack, opts);
  if (d.problems.length) throw new ExportError(`Not exported: ${d.problems.join("; ")}.`);
  const ink = roles.ink;
  const framed = opts.frame ?? null;   // a slide frame ({min, max} in modules): exactly that rectangle, no margin, at 1:1
  const m = framed ? 0 : 1;            // otherwise one module of margin
  const box = framed ?? d.box ?? { min: [0, 0], max: [0, 0] };
  const [x0, y0] = [box.min[0] - m, box.min[1] - m];
  const [w, h] = [box.max[0] - box.min[0] + 2 * m, box.max[1] - box.min[1] + 2 * m];
  const out = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${fmt(w * MODULE_CM * scale)}cm" height="${fmt(h * MODULE_CM * scale)}cm" viewBox="${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)}"${framed ? ' overflow="hidden"' : ""}>`,
    `  <title>${esc(doc.title ?? doc.id)}</title>`,
    metadataOf(serialize(doc, pack)),   // the circuit itself, so Open on this file brings the figure back editable
  ];
  if (d.wires.length) {
    out.push(`  <g fill="none" stroke="${ink}" stroke-width="${fmt(line.width_module)}" stroke-linecap="${line.cap}" stroke-linejoin="${line.join}">`);
    for (const wire of d.wires) {
      const own = sameColour(wire.colour, ink) ? "" : ` stroke="${wire.colour}"`;
      out.push(`    <path${own} d="${pathData(wire.points)}"/>`);
      if (wire.slash) out.push(`    <path${own} d="${pathData(wire.slash)}"/>`);
    }
    out.push("  </g>");
    const heads = d.wires.flatMap((wire) => wire.heads.map((h) => ({ h, colour: wire.colour })));
    if (heads.length) {
      out.push(`  <g fill="${ink}" stroke="none">`);
      for (const { h, colour } of heads) out.push(`    <path${sameColour(colour, ink) ? "" : ` fill="${colour}"`} d="${headPath(h)}"/>`);
      out.push("  </g>");
    }
  }
  for (const e of d.elements) {
    out.push(`  <g transform="${e.transform}">`);
    for (const n of e.nodes) out.push(writeXml(n, "    "));
    out.push("  </g>");
  }
  const circles = [...d.joints, ...d.dots];
  if (circles.length) {
    out.push(`  <g fill="${ink}" stroke="none">`);
    for (const c of circles) out.push(`    <circle cx="${fmt(c.at[0])}" cy="${fmt(c.at[1])}" r="${fmt(c.r)}"${sameColour(c.colour, ink) ? "" : ` fill="${c.colour}"`}/>`);
    out.push("  </g>");
  }
  for (const l of d.labels) {
    out.push(`  <g transform="${l.transform}">`);
    for (const n of l.nodes) out.push(writeXml(n, "    "));
    out.push("  </g>");
  }
  out.push("</svg>", "");
  return out.join("\n");
}
