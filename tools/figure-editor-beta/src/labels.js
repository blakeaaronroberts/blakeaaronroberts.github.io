// Labels: TeX text typeset by MathJax 4 (STIX2 font, SVG output), kept as outlined paths. No DOM.
//
// mathjax.js (browser only) turns a TeX string into MathJax's SVG text. This module turns that
// text into plain path nodes, sizes and places them, and lists every label a document has.
// With fontCache "none" MathJax writes each glyph as an inline <path>, so nothing here, and
// nothing in an export, refers to a font. A <text> element would mean a glyph the STIX2 font
// lacks; such a label is refused instead of being drawn with a font.

import { DIRECTIONS, fmt, orient, place } from "./geometry.js";
import { BLOCK, geometryOf } from "./block.js";
import { attr, parseXml } from "./xml.js";

/** Typeset once, to measure a capital letter: labels beside a wire are centred on this height, not on their own box. */
export const REFERENCE_TEX = "X";

/** Label size in TeX points when neither the pack nor the user says. 10 pt is the toolbox's own (LaTeX `standalone` default). */
export const DEFAULT_LABEL_PT = 10;

/** The pack's label size if it carries one (`label.size_pt`), else the default. */
export const packLabelPt = (pack) => pack.theme.label?.size_pt ?? DEFAULT_LABEL_PT;

// ---- from the label text to TeX -------------------------------------------------------

const TEXT_ESCAPES = { "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "%": "\\%", "#": "\\#", "&": "\\&", "_": "\\_", "^": "\\^{}", "~": "\\~{}" };
const escapeText = (s) => s.replace(/[\\{}%#&_^~]/g, (c) => TEXT_ESCAPES[c]);

/**
 * The TeX MathJax is given for a label's text. The schema stores TeX maths such as "$A_0$"; text
 * with no "$" is plain words (a title or note), and text mixing both is words with maths inside.
 */
export function texOf(text) {
  const t = String(text).trim();
  if (!t) throw new Error("the label is empty");
  const whole = /^\$([^$]+)\$$/.exec(t);
  if (whole) return whole[1].trim();
  if (!t.includes("$")) return `\\text{${escapeText(t)}}`;
  const parts = t.split("$");
  if (parts.length % 2 === 0) throw new Error(`a "$" in "${t}" is not closed`);
  return `\\text{${parts.map((s, i) => (i % 2 ? `$${s}$` : escapeText(s))).join("")}}`;
}

export const levelTagTex = (level) => `\\mathrm{${level}}`;

// ---- MathJax output to clean nodes ----------------------------------------------------

const KEEP_TAGS = new Set(["g", "path", "rect"]);
const DROP_ATTRS = new Set(["id", "class", "style", "role", "focusable", "aria-hidden"]);

/**
 * Parse MathJax's SVG text. Returns {ok: true, nodes, left, width, height, depth} (sizes in em:
 * `height` above the baseline, `depth` below it, `left` the box's left edge), or {ok: false, error}.
 * The nodes are plain g/path/rect with no data-*, ids, styles or fonts; colours stay "currentColor".
 */
export function parseTypeset(svgText) {
  let root;
  try { root = parseXml(svgText, ["text"]); }   // MathJax falls back to <text> for a glyph it lacks: read it, to refuse it
  catch (e) { return { ok: false, error: e.message }; }
  const vb = (attr(root, "viewBox") ?? "").split(/\s+/).map(Number);
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v))) return { ok: false, error: "MathJax gave no viewBox" };
  let problem = null;
  const clean = (n) => {
    if (!KEEP_TAGS.has(n.tag)) {
      problem ??= n.tag === "text" ? "a glyph is not in the STIX2 font (it would need a font)" : `unexpected <${n.tag}> in the typeset label`;
      return [];
    }
    // Label colours come from the theme (currentColor). MathJax draws an unknown TeX command in red, and \color
    // sets named colours; either would put a colour of its own in the figure.
    const own = n.attrs.find(([k, v]) => (k === "fill" || k === "stroke") && v !== "currentColor" && v !== "none");
    if (own) problem ??= `the label draws in a colour of its own (${own[1]}), probably an unknown TeX command; label colours come from the theme`;
    const attrs = n.attrs.filter(([k]) => !k.startsWith("data-") && !DROP_ATTRS.has(k));
    return [{ tag: n.tag, attrs, children: n.children.flatMap(clean) }];
  };
  const nodes = root.children.flatMap(clean);
  if (problem) return { ok: false, error: problem };
  const [x, y, w, h] = vb;       // MathJax's viewBox is in 1/1000 em, y down, with the baseline at 0
  return { ok: true, nodes, left: x / 1000, width: w / 1000, height: -y / 1000, depth: (y + h) / 1000 };
}

/** Copy nodes with "currentColor" replaced by a resolved colour. */
export function colourNodes(nodes, colour) {
  const paint = (n) => ({
    tag: n.tag,
    attrs: n.attrs.map(([k, v]) => [k, v === "currentColor" ? colour : v]),
    children: n.children.map(paint),
  });
  return nodes.map(paint);
}

// ---- size and placement ---------------------------------------------------------------

/** One em of label text, in SVG modules: points converted with the pack's own pt-to-cm ratio (its line width). */
export const emModules = (pack, labelPt) =>
  (labelPt * (pack.theme.line.width_cm / pack.theme.line.width_pt)) / pack.theme.geometry.module_cm;

/**
 * Where a typeset label goes. `at` is the anchor in SVG modules (y down); `dir` is the side of the
 * anchor the label sits on, as a y-down unit vector, or null to centre it on the anchor. As in the
 * toolbox, a label above its anchor is attached by its bottom, one to the right by its left side, and
 * so on, with the pack's label gap between. Beside a wire (left, right or centred) the baseline is set
 * so a capital letter is centred on the anchor (`ref` is the typeset reference capital), so A, A_0 and B
 * on parallel wires share one baseline. Returns {transform, box}, the box in modules.
 */
export function placeLabel(ts, ref, at, dir, em, gap) {
  const w = ts.width * em, left = ts.left * em;
  const above = ts.height * em, below = ts.depth * em;                  // extent above and below the baseline
  const half = ref?.ok ? (ref.height * em) / 2 : (above - below) / 2;   // half a capital, or half the label itself
  const centre = at[0] - w / 2 - left;                                  // baseline origin x that centres the box
  let x = centre, y = at[1] + half;
  if (dir && dir[1] < 0) y = at[1] - gap - below;                       // above: bottom edge at the gap
  else if (dir && dir[1] > 0) y = at[1] + gap + above;                  // below: top edge at the gap
  else if (dir && dir[0] > 0) x = at[0] + gap - left;                   // right: left edge at the gap
  else if (dir) x = at[0] - gap - w - left;                             // left: right edge at the gap
  return {
    transform: `translate(${fmt(x)} ${fmt(y)}) scale(${scaleText(em / 1000)})`,
    box: { min: [x + left, y - above], max: [x + left + w, y + below] },
  };
}

const scaleText = (v) => String(Math.round(v * 1e7) / 1e7);

// ---- every label a document has -------------------------------------------------------

/**
 * Where an element's own label goes: the pack's anchor if it gives one, else the middle of the top edge of the
 * element's bounding box with the label above (the convention the pack's own anchors follow), so every element can carry a label.
 */
export function labelSpec(def) {
  if (def?.label) return def.label;
  if (!def?.bbox) return null;
  const { min, max } = def.bbox;
  return { anchor: [(min[0] + max[0]) / 2, max[1]], direction: "up" };
}

/**
 * The labels of a document: {key, kind, text, tex, at, dir, error}. `at` is in grid steps and may be
 * fractional (an element label's anchor); `dir` is a y-up grid vector or null. kind is "element" (its
 * own label, at the pack's anchor), "port" or "label" (free text). An element with no pack anchor uses labelSpec's fallback. If the
 * element has no bounding box it is skipped. `error` is set (and `tex` null) if the text cannot be converted.
 */
export function labelItems(doc, pack) {
  const out = [];
  const add = (item) => {
    try { out.push({ ...item, tex: texOf(item.text), error: null }); } catch (e) { out.push({ ...item, tex: null, error: e.message }); }
  };
  const side = (s) => (s ? DIRECTIONS[s] ?? null : null);
  for (const el of doc.elements) {
    const def = pack.defFor(el);
    const spec = labelSpec(def);
    const turn = (v) => orient(v, el.rotation ?? 0, el.mirror ?? false);
    if (el.label && spec) {
      add({ key: `element:${el.id}`, kind: "element", id: el.id, text: el.label, at: place(el, spec.anchor), dir: turn(DIRECTIONS[spec.direction]) });
    }
    // A block's own text is drawn upright whatever its rotation: the label in the middle, and each pin's label just inside the outline.
    const g = el.type === BLOCK ? geometryOf(el.params) : null;
    if (g) {
      if (g.params.label) add({ key: `block:${el.id}`, kind: "block", id: el.id, text: g.params.label, at: place(el, g.centre), dir: null });
      for (const [name, q] of Object.entries(g.pins)) {
        if (q.label) add({ key: `pin:${el.id}.${name}`, kind: "pin", id: `${el.id}.${name}`, text: q.label, at: place(el, q.labelAt), dir: turn(q.labelDir) });
      }
    }
  }
  for (const p of doc.ports) if (p.label) add({ key: `port:${p.id}`, kind: "port", id: p.id, text: p.label, at: p.at, dir: side(p.side) });
  doc.labels.forEach((l, index) => add({ key: `label:${index}`, kind: "label", index, text: l.text, at: l.at, dir: side(l.side) }));
  return out;
}

/** Every TeX string that must be typeset to draw the document: its labels, the reference capital, and level tags if asked. */
export function texNeeded(doc, pack, { levelTags = false } = {}) {
  const need = new Set([REFERENCE_TEX]);
  for (const i of labelItems(doc, pack)) if (i.tex) need.add(i.tex);
  if (levelTags) for (const w of doc.wires) if (w.level) need.add(levelTagTex(w.level));
  return [...need];
}
