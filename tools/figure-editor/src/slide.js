// The slide (F19), built on the F10 slide frame. No DOM.
//
// A slide has a size (16:9 or 4:3, PowerPoint's own), a header and a footer band where PowerPoint's own title and
// footer go, and regions in the content area between them. A region is a schematic, a timing diagram or a text
// placeholder; it sits on the module grid (0.5 cm), in modules from the slide's top-left corner. The slide is saved in
// the figure's `groups.slide`, so the circuit/0.2 file stays valid (the same place frames and net labels live).
//
// Content is fitted to its region and re-drawn at the region's size: the schematic's geometry is scaled to fit while
// every stroke keeps its drawn width, and the timing diagram is laid out again at the region's size (never stretched).
// Text placeholders show where PowerPoint text goes; they are never exported.

import { FORMATS } from "./frame.js";
import { applyFrame, exportSvg, framesOf, fmt, MODULE_CM } from "../../schematic-editor/src/index.js";
import { drawTiming } from "../../timing/src/index.js";
import { arrowHeadSizeOf, arrowLabelSizeOf, edgeLineWidthOf, edgeStylesFor, lineWidthOf, signalNameSizeOf, textSizeOf } from "../../timing/src/index.js";

export { FORMATS };
export const KINDS = { schematic: "Schematic", timing: "Timing diagram", text: "Text (PowerPoint)" };
const KEY = "slide";

/** Size of a slide format in modules (not whole numbers: PowerPoint's 13.333 in is 67.73 modules). */
export const slideSize = (format) => ({ w: FORMATS[format].widthCm / MODULE_CM, h: FORMATS[format].heightCm / MODULE_CM });

/** The content area between the header and the footer, inset one module at the sides, in whole modules. */
export function contentArea(s) {
  const { w, h } = slideSize(s.format);
  const top = Math.ceil(s.headerCm / MODULE_CM), bottom = Math.floor(h - s.footerCm / MODULE_CM);
  return { x: 1, y: top, w: Math.floor(w) - 2, h: Math.max(4, bottom - top) };
}

const R = (id, kind, x, y, w, h, extra = {}) => ({ id, kind, label: KINDS[kind], x, y, w, h, ...extra });

/**
 * Layouts from common slide practice. Each fills the content area with a one-module gap. The dividers are percentages that
 * every layout gives a default (`defaults`) and the user can change (saved in the slide's `splits`):
 * h is the height of the top part, v the width of the left part, c the height of a caption strip.
 */
export const LAYOUTS = {
  over: { name: "Schematic over timing diagram", defaults: { h: 60 }, uses: ["h"], make: (a, p) => { const t = Math.round(a.h * p.h / 100); return [R("r1", "schematic", a.x, a.y, a.w, t - 1), R("r2", "timing", a.x, a.y + t, a.w, a.h - t)]; } },
  side: { name: "Schematic and timing diagram side by side", defaults: { v: 55 }, uses: ["v"], make: (a, p) => { const l = Math.round(a.w * p.v / 100); return [R("r1", "schematic", a.x, a.y, l - 1, a.h), R("r2", "timing", a.x + l, a.y, a.w - l, a.h)]; } },
  textover: {
    name: "Text and schematic on top, timing diagram across the bottom", defaults: { h: 62, v: 40 }, uses: ["h", "v"],
    make: (a, p) => { const t = Math.round(a.h * p.h / 100), l = Math.round(a.w * p.v / 100); return [R("r1", "text", a.x, a.y, l - 1, t - 1, { label: "Text" }), R("r2", "schematic", a.x + l, a.y, a.w - l, t - 1), R("r3", "timing", a.x, a.y + t, a.w, a.h - t)]; },
  },
  schemover: {
    name: "Schematic and text on top, timing diagram across the bottom", defaults: { h: 62, v: 60 }, uses: ["h", "v"],
    make: (a, p) => { const t = Math.round(a.h * p.h / 100), l = Math.round(a.w * p.v / 100); return [R("r1", "schematic", a.x, a.y, l - 1, t - 1), R("r2", "text", a.x + l, a.y, a.w - l, t - 1, { label: "Text" }), R("r3", "timing", a.x, a.y + t, a.w, a.h - t)]; },
  },
  caption: { name: "Large schematic with a caption strip", defaults: { c: 18 }, uses: ["c"], make: (a, p) => { const c = Math.max(3, Math.round(a.h * p.c / 100)); return [R("r1", "schematic", a.x, a.y, a.w, a.h - c - 1), R("r2", "text", a.x, a.y + a.h - c, a.w, c, { label: "Caption" })]; } },
  diagram: { name: "Timing diagram only", defaults: {}, uses: [], make: (a) => [R("r1", "timing", a.x, a.y, a.w, a.h)] },
  grid: {
    name: "Four frames, 2 by 2", defaults: {}, uses: [], make: (a) => {
      const w = Math.floor((a.w - 1) / 2), h = Math.floor((a.h - 1) / 2);
      return [0, 1, 2, 3].map((i) => R(`r${i + 1}`, "schematic", a.x + (i % 2) * (w + 1), a.y + Math.floor(i / 2) * (h + 1), w, h, { label: `Frame ${i + 1}`, frame: i }));
    },
  },
  textleft: { name: "Text left, figure right", defaults: { v: 40 }, uses: ["v"], make: (a, p) => { const l = Math.round(a.w * p.v / 100); return [R("r1", "text", a.x, a.y, l - 1, a.h, { label: "Text" }), R("r2", "schematic", a.x + l, a.y, a.w - l, a.h)]; } },
  schematicOnly: { name: "Schematic only", defaults: {}, uses: [], make: (a) => [R("r1", "schematic", a.x, a.y, a.w, a.h)] },
  textOnly: { name: "Text placeholder only", defaults: {}, uses: [], make: (a) => [R("r1", "text", a.x, a.y, a.w, a.h, { label: "Text" })] },
  timingOver: { name: "Timing diagram over schematic", defaults: { h: 45 }, uses: ["h"], make: (a, p) => { const t = Math.round(a.h * p.h / 100); return [R("r1", "timing", a.x, a.y, a.w, t - 1), R("r2", "schematic", a.x, a.y + t, a.w, a.h - t)]; } },
  figureText: { name: "Schematic left, text right", defaults: { v: 62 }, uses: ["v"], make: (a, p) => { const l = Math.round(a.w * p.v / 100); return [R("r1", "schematic", a.x, a.y, l - 1, a.h), R("r2", "text", a.x + l, a.y, a.w - l, a.h, { label: "Text" })]; } },
  timingText: { name: "Timing diagram left, text right", defaults: { v: 62 }, uses: ["v"], make: (a, p) => { const l = Math.round(a.w * p.v / 100); return [R("r1", "timing", a.x, a.y, l - 1, a.h), R("r2", "text", a.x + l, a.y, a.w - l, a.h, { label: "Text" })]; } },
  threeColumns: {
    name: "Text, schematic and timing in three columns", defaults: {}, uses: [], make: (a) => {
      const w = Math.floor((a.w - 2) / 3), last = a.w - 2 * w - 2;
      return [R("r1", "text", a.x, a.y, w, a.h, { label: "Text" }), R("r2", "schematic", a.x + w + 1, a.y, w, a.h), R("r3", "timing", a.x + 2 * (w + 1), a.y, last, a.h)];
    },
  },
  threeRows: {
    name: "Schematic, timing and text stacked", defaults: {}, uses: [], make: (a) => {
      const top = Math.round(a.h * 0.45), middle = Math.round(a.h * 0.3);
      return [R("r1", "schematic", a.x, a.y, a.w, top - 1), R("r2", "timing", a.x, a.y + top, a.w, middle - 1), R("r3", "text", a.x, a.y + top + middle, a.w, a.h - top - middle, { label: "Text" })];
    },
  },
  captionTop: { name: "Caption above schematic", defaults: { c: 20 }, uses: ["c"], make: (a, p) => { const c = Math.max(3, Math.round(a.h * p.c / 100)); return [R("r1", "text", a.x, a.y, a.w, c - 1, { label: "Caption" }), R("r2", "schematic", a.x, a.y + c, a.w, a.h - c)]; } },
  timingCaption: { name: "Timing diagram with caption", defaults: { c: 20 }, uses: ["c"], make: (a, p) => { const c = Math.max(3, Math.round(a.h * p.c / 100)); return [R("r1", "timing", a.x, a.y, a.w, a.h - c - 1), R("r2", "text", a.x, a.y + a.h - c, a.w, c, { label: "Caption" })]; } },
  twoSchematics: {
    name: "Two schematic frames side by side", defaults: { v: 50 }, uses: ["v"], make: (a, p) => {
      const l = Math.round(a.w * p.v / 100);
      return [R("r1", "schematic", a.x, a.y, l - 1, a.h, { label: "Frame 0", frame: 0 }), R("r2", "schematic", a.x + l, a.y, a.w - l, a.h, { label: "Frame 1", frame: 1 })];
    },
  },
};

/** What each divider is called, its allowed range (percent) and what it measures. */
export const SPLITS = {
  h: { name: "Top part height", min: 25, max: 80, hint: "% of the content height" },
  v: { name: "Left part width", min: 20, max: 80, hint: "% of the content width" },
  c: { name: "Caption strip height", min: 8, max: 40, hint: "% of the content height" },
};

export const defaultSlide = () => withLayout({ format: "16:9", headerCm: 3, footerCm: 1, layout: "over", splits: {}, regions: [] }, "over");

/** The dividers a layout uses, as percentages: its defaults, overridden by the slide's own (kept inside their ranges). */
export function splitsOf(s, layout = s.layout) {
  const L = LAYOUTS[layout];
  const out = { ...(L?.defaults ?? {}) };
  for (const k of L?.uses ?? []) { const v = Number(s.splits?.[k]); if (Number.isFinite(v)) out[k] = Math.min(SPLITS[k].max, Math.max(SPLITS[k].min, v)); }
  return out;
}

/** The slide with a layout's regions (replacing the regions it had). The slide's own dividers are kept; `reset` drops them for the layout's defaults. */
export function withLayout(s, layout, { reset = false } = {}) {
  const id = layout in LAYOUTS ? layout : "over", L = LAYOUTS[id];
  const base = { ...s, layout: id, splits: reset ? {} : (s.splits ?? {}) };
  return { ...base, regions: L.make(contentArea(base), splitsOf(base, id)) };
}

/** Change one divider (percent) and lay the layout out again. */
export const withSplit = (s, key, value) => withLayout({ ...s, splits: { ...(s.splits ?? {}), [key]: value } }, s.layout in LAYOUTS ? s.layout : "over");

const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);

/** A slide as saved, repaired: unknown values become the defaults; regions whole modules, inside the slide, at least 2 by 2. */
export function cleanSlide(raw) {
  const d = defaultSlide();
  if (!raw || typeof raw !== "object") return d;
  const s = { format: raw.format in FORMATS ? raw.format : d.format, headerCm: num(raw.headerCm, 0, 8, d.headerCm), footerCm: num(raw.footerCm, 0, 5, d.footerCm), layout: raw.layout in LAYOUTS ? raw.layout : "custom", splits: {} };
  for (const k of Object.keys(SPLITS)) if (Number.isFinite(+raw.splits?.[k])) s.splits[k] = num(raw.splits[k], SPLITS[k].min, SPLITS[k].max, 0);
  const { w, h } = slideSize(s.format);
  const ids = new Set();
  s.regions = (Array.isArray(raw.regions) ? raw.regions : d.regions).filter((r) => r && r.kind in KINDS).slice(0, 12).map((r, i) => {
    let id = typeof r.id === "string" && /^[A-Za-z0-9_-]{1,20}$/.test(r.id) ? r.id : `r${i + 1}`;
    while (ids.has(id)) id += "x";
    ids.add(id);
    const rw = Math.round(num(r.w, 2, Math.floor(w), 10)), rh = Math.round(num(r.h, 2, Math.floor(h), 6));
    const out = { id, kind: r.kind, label: typeof r.label === "string" ? r.label.slice(0, 40) : KINDS[r.kind], x: Math.round(num(r.x, 0, Math.floor(w) - rw, 1)), y: Math.round(num(r.y, 0, Math.floor(h) - rh, 1)), w: rw, h: rh };
    if (r.kind === "schematic" && Number.isInteger(r.frame) && r.frame >= 0) out.frame = r.frame;
    return out;
  });
  return s;
}

/** The slide a document carries, or null if it has none. */
export const slideOf = (doc) => (doc.groups?.[KEY] ? cleanSlide(doc.groups[KEY]) : null);

/** The document with this slide saved in it (or removed, with null). */
export function withSlide(doc, s) {
  const d = structuredClone(doc), groups = { ...(d.groups ?? {}) };
  if (s) groups[KEY] = cleanSlide(s); else delete groups[KEY];
  if (Object.keys(groups).length) d.groups = groups; else delete d.groups;
  return d;
}

/** Move or resize a region by whole modules (dx, dy for a move; dw, dh for a resize), kept on the slide. */
export function nudgeRegion(s, id, { dx = 0, dy = 0, dw = 0, dh = 0 }) {
  return cleanSlide({ ...s, layout: "custom", regions: s.regions.map((r) => (r.id === id ? { ...r, x: r.x + dx, y: r.y + dy, w: r.w + dw, h: r.h + dh } : r)) });
}

// ---- drawing the slide --------------------------------------------------------------------------------------------

const PX_PER_MODULE = (MODULE_CM / 2.54) * 96;   // the timing diagram is laid out in CSS px at 96 dpi

/** The schematic fitted into a region: its geometry scaled, its strokes kept at their drawn width. */
function schematicIn(doc, pack, r, opts) {
  const text = exportSvg(doc, pack, { ...opts, scale: 1, frame: null, timing: null });
  const vb = /viewBox="([^"]+)"/.exec(text)[1].split(" ").map(Number);
  const inner = text.slice(text.indexOf("</metadata>") + "</metadata>".length, text.lastIndexOf("</svg>"));
  const s = Math.min(r.w / vb[2], r.h / vb[3], opts.maxScale ?? 4);
  const tx = r.x + (r.w - vb[2] * s) / 2 - vb[0] * s, ty = r.y + (r.h - vb[3] * s) / 2 - vb[1] * s;
  const kept = inner.replace(/stroke-width="([\d.]+)"/g, (_, v) => `stroke-width="${fmt(+v / s)}"`);   // re-drawn at the slot size: line weights as drawn
  return `  <g transform="translate(${fmt(tx)} ${fmt(ty)}) scale(${fmt(s)})">${kept}</g>`;
}

/** The timing diagram laid out at the region's size (px at 96 dpi), placed in modules. */
function timingIn(r, t, index) {
  if (!t?.source) return "";
  const targetW = r.w * PX_PER_MODULE, targetH = r.h * PX_PER_MODULE;
  const drawn = drawTiming(t.source, {
    centerTransitions: true, fitText: true, idPrefix: `slide-timing-${index}-`,
    width: r.w * PX_PER_MODULE, height: r.h * PX_PER_MODULE, ink: t.ink, accent: t.accent,
    marker: t.marker ?? null, levelColour: t.levelColour ?? null, dataFills: t.dataFills ?? [], levelFills: t.levelFills ?? {}, signalLineColour: t.signalLineColour ?? t.ink, paper: t.paper ?? null,
    fontSize: t.fontSize ?? textSizeOf(t.source), signalNameSize: t.signalNameSize ?? signalNameSizeOf(t.source), arrowLabelSize: t.arrowLabelSize ?? arrowLabelSizeOf(t.source),
    lineWidth: t.lineWidth ?? lineWidthOf(t.source), showNames: t.showNames ?? true, nameTypeset: t.nameTypeset ?? null, edgeLabelTypeset: t.edgeLabelTypeset ?? t.nameTypeset ?? null,
    edgeStyles: edgeStylesFor(t.source, t.accent), edgeLineWidth: edgeLineWidthOf(t.source), arrowHeadSize: arrowHeadSizeOf(t.source), arrowHeadMax: 32,
  });
  const svg = drawn.svg;
  const inner = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
  const fit = Math.min(1, targetW / drawn.geometry.width, targetH / drawn.geometry.height);
  const tx = r.x + (targetW - drawn.geometry.width * fit) / (2 * PX_PER_MODULE), ty = r.y + (targetH - drawn.geometry.height * fit) / (2 * PX_PER_MODULE);
  return `  <g transform="translate(${fmt(tx)} ${fmt(ty)}) scale(${fmt(fit / PX_PER_MODULE)})">${inner}</g>`;
}

/**
 * The slide as an SVG file. Options: everything exportSvg takes (typeset, labelPt, levelTags), plus
 * `timing` ({source, ink, accent, marker, levelColour}: the diagram for timing regions), `frame` (a frame index: its
 * levels for schematic regions with no frame of their own), `only` (a region id: export just that part, at its slot
 * size) and `preview` (draw the header, footer and text placeholders, for the screen; never in a file).
 */
export function slideSvg(doc, pack, s, opts = {}) {
  const { w, h } = slideSize(s.format);
  const frames = framesOf(doc);
  const part = opts.only ? s.regions.find((r) => r.id === opts.only) : null;
  if (opts.only && !part) throw new Error(`no region ${opts.only}`);
  const [vx, vy, vw, vh] = part ? [part.x, part.y, part.w, part.h] : [0, 0, w, h];
  const out = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${fmt(vw * MODULE_CM)}cm" height="${fmt(vh * MODULE_CM)}cm" viewBox="${fmt(vx)} ${fmt(vy)} ${fmt(vw)} ${fmt(vh)}" overflow="hidden">`,
    `  <title>${String(doc.title ?? doc.id).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</title>`,
  ];
  const ink = pack.theme.roles.ink, accent = pack.theme.roles.accent, muted = pack.theme.roles.muted ?? ink;
  if (opts.preview) {
    const a = contentArea(s);
    out.push(`  <rect x="0" y="0" width="${fmt(w)}" height="${fmt(a.y)}" fill="${accent}" fill-opacity="0.06"/>`);
    out.push(`  <rect x="0" y="${fmt(a.y + a.h)}" width="${fmt(w)}" height="${fmt(h - a.y - a.h)}" fill="${accent}" fill-opacity="0.06"/>`);
  }
  for (const [index, r] of s.regions.entries()) {
    if (part && r !== part) continue;
    if (r.kind === "schematic") {
      const f = Number.isInteger(r.frame) ? r.frame : opts.frame;
      const at = Number.isInteger(f) && frames[f] ? applyFrame(doc, frames[f]) : doc;
      out.push(schematicIn(at, pack, r, opts));
    } else if (r.kind === "timing") out.push(timingIn(r, opts.timing ? { ...opts.timing, ink: opts.timing.ink ?? ink, accent: opts.timing.accent ?? accent } : null, index));
    else if (opts.preview) out.push(`  <rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" fill="${muted}" fill-opacity="0.08" stroke="${muted}" stroke-width="0.06" stroke-dasharray="0.3 0.2"/>`);
  }
  out.push("</svg>", "");
  return out.join("\n");
}

/** A small picture of a layout for its button: the slide, its header and footer bands, and each region shaded by kind. */
export function layoutThumb(id, s, roles) {
  const { w, h } = slideSize(s.format), regions = withLayout(s, id).regions, a = contentArea(s);
  const fill = { schematic: roles.ink, timing: roles.accent, text: roles.muted ?? roles.ink };
  return `<svg viewBox="0 0 ${fmt(w)} ${fmt(h)}" aria-hidden="true" focusable="false">` +
    `<rect width="${fmt(w)}" height="${fmt(h)}" fill="none" stroke="currentColor" stroke-width="0.8"/>` +
    `<rect width="${fmt(w)}" height="${a.y}" fill="currentColor" fill-opacity="0.12"/>` +
    regions.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill[r.kind]}" fill-opacity="${r.kind === "text" ? 0.15 : 0.35}"${r.kind === "text" ? ` stroke="${fill.text}" stroke-width="0.4" stroke-dasharray="1 0.8"` : ""}/>`).join("") +
    `</svg>`;
}
