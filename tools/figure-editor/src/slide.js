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
import { exportSvg } from "./export.js";
import { MODULE_CM, fmt } from "./geometry.js";
import { applyFrame, framesOf } from "./levelframes.js";
import { drawTiming } from "../../timing/src/draw.js";

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

/** Six layouts from common slide practice. Each fills the content area with a one-module gap. */
export const LAYOUTS = {
  over: { name: "Schematic over timing diagram", make: (a) => { const t = Math.round(a.h * 0.6); return [R("r1", "schematic", a.x, a.y, a.w, t - 1), R("r2", "timing", a.x, a.y + t, a.w, a.h - t)]; } },
  side: { name: "Schematic and timing diagram side by side", make: (a) => { const l = Math.round(a.w * 0.55); return [R("r1", "schematic", a.x, a.y, l - 1, a.h), R("r2", "timing", a.x + l, a.y, a.w - l, a.h)]; } },
  caption: { name: "Large schematic with a caption strip", make: (a) => { const c = Math.max(3, Math.round(a.h * 0.18)); return [R("r1", "schematic", a.x, a.y, a.w, a.h - c - 1), R("r2", "text", a.x, a.y + a.h - c, a.w, c, { label: "Caption" })]; } },
  diagram: { name: "Timing diagram only", make: (a) => [R("r1", "timing", a.x, a.y, a.w, a.h)] },
  grid: {
    name: "Four frames, 2 by 2", make: (a) => {
      const w = Math.floor((a.w - 1) / 2), h = Math.floor((a.h - 1) / 2);
      return [0, 1, 2, 3].map((i) => R(`r${i + 1}`, "schematic", a.x + (i % 2) * (w + 1), a.y + Math.floor(i / 2) * (h + 1), w, h, { label: `Frame ${i + 1}`, frame: i }));
    },
  },
  textleft: { name: "Text left, figure right", make: (a) => { const l = Math.round(a.w * 0.4); return [R("r1", "text", a.x, a.y, l - 1, a.h, { label: "Text" }), R("r2", "schematic", a.x + l, a.y, a.w - l, a.h)]; } },
};

export const defaultSlide = () => withLayout({ format: "16:9", headerCm: 3, footerCm: 1, layout: "over", regions: [] }, "over");

/** The slide with a layout's regions (replacing the regions it had). */
export function withLayout(s, layout) {
  const L = LAYOUTS[layout] ?? LAYOUTS.over;
  return { ...s, layout: layout in LAYOUTS ? layout : "over", regions: L.make(contentArea(s)) };
}

const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);

/** A slide as saved, repaired: unknown values become the defaults; regions whole modules, inside the slide, at least 2 by 2. */
export function cleanSlide(raw) {
  const d = defaultSlide();
  if (!raw || typeof raw !== "object") return d;
  const s = { format: raw.format in FORMATS ? raw.format : d.format, headerCm: num(raw.headerCm, 0, 8, d.headerCm), footerCm: num(raw.footerCm, 0, 5, d.footerCm), layout: raw.layout in LAYOUTS ? raw.layout : "custom" };
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
function timingIn(r, t) {
  if (!t?.source) return "";
  const svg = drawTiming(t.source, { width: r.w * PX_PER_MODULE, height: r.h * PX_PER_MODULE, ink: t.ink, accent: t.accent, marker: t.marker ?? null, levelColour: t.levelColour ?? null }).svg;
  const inner = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
  return `  <g transform="translate(${fmt(r.x)} ${fmt(r.y)}) scale(${fmt(1 / PX_PER_MODULE)})">${inner}</g>`;
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
  for (const r of s.regions) {
    if (part && r !== part) continue;
    if (r.kind === "schematic") {
      const f = Number.isInteger(r.frame) ? r.frame : opts.frame;
      const at = Number.isInteger(f) && frames[f] ? applyFrame(doc, frames[f]) : doc;
      out.push(schematicIn(at, pack, r, opts));
    } else if (r.kind === "timing") out.push(timingIn(r, opts.timing));
    else if (opts.preview) out.push(`  <rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" fill="${muted}" fill-opacity="0.08" stroke="${muted}" stroke-width="0.06" stroke-dasharray="0.3 0.2"/>`);
  }
  out.push("</svg>", "");
  return out.join("\n");
}
