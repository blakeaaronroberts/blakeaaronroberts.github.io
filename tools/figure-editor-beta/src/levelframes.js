// Level frames (F11.2). No DOM.
//
// A frame is a named snapshot of the logic levels on the wires and elements: one per transition, so each
// step of a scenario can be exported as its own figure. Frames live in the figure's own free-form `groups`
// map, under the key "frames", so the circuit/0.2 file stays valid and Save and Open keep them. Each frame is
// { name, levels: { "<wire or element id>": "0" | "1" | "X" | "Z" } }; anything not listed has no level.
//
// Every function returns a new document; none changes its argument.

import { clone } from "./doc.js";

export const KEY = "frames";

/** The frames a document carries (a copy). */
export const framesOf = (doc) => (Array.isArray(doc.groups?.[KEY]) ? structuredClone(doc.groups[KEY]) : []);

function withFrames(doc, frames) {
  const d = clone(doc);
  const groups = { ...(d.groups ?? {}) };
  if (frames.length) groups[KEY] = frames; else delete groups[KEY];
  if (Object.keys(groups).length) d.groups = groups; else delete d.groups;
  return d;
}

/** The current levels of the document, as a frame's `levels`. */
export function levelsOf(doc) {
  const levels = {};
  for (const x of [...doc.wires, ...doc.elements]) if (x.level) levels[x.id] = x.level;
  return levels;
}

/** Add a frame holding the current levels. The name defaults to "Frame N". */
export function captureFrame(doc, name) {
  const frames = framesOf(doc);
  frames.push({ name: (name ?? "").trim() || `Frame ${frames.length + 1}`, levels: levelsOf(doc) });
  return withFrames(doc, frames);
}

/** The document drawn at a frame's levels (for the canvas and the exports). The frames themselves are kept. */
export function applyFrame(doc, frame) {
  const d = clone(doc);
  for (const x of [...d.wires, ...d.elements]) {
    const level = frame.levels?.[x.id];
    if (level) x.level = level; else delete x.level;
  }
  return d;
}

export const renameFrame = (doc, i, name) => {
  const frames = framesOf(doc);
  if (frames[i] && name.trim()) frames[i].name = name.trim();
  return withFrames(doc, frames);
};

export const removeFrame = (doc, i) => withFrames(doc, framesOf(doc).filter((_, k) => k !== i));

/** Move frame i by `by` places (-1 earlier, +1 later). */
export function moveFrame(doc, i, by) {
  const frames = framesOf(doc), j = i + by;
  if (!frames[i] || j < 0 || j >= frames.length) return withFrames(doc, frames);
  [frames[i], frames[j]] = [frames[j], frames[i]];
  return withFrames(doc, frames);
}

/** Replace frame i's levels with the document's current ones. */
export function recaptureFrame(doc, i) {
  const frames = framesOf(doc);
  if (frames[i]) frames[i].levels = levelsOf(doc);
  return withFrames(doc, frames);
}

/** "01", "02", ...: the number in an exported file's name (at least two digits). */
export const numbered = (i, n) => String(i + 1).padStart(Math.max(2, String(n).length), "0");

/** The TeX that typesets a frame's name as a label (text mode; characters TeX treats specially are made plain). */
export const frameTex = (name) => `\text{${name.replace(/[\^~]/g, " ").replace(/([{}$&#_%])/g, "\$1")}}`;

/** Columns and rows for n small figures on a slide of the given shape (width / height). */
export function gridShape(n, aspect) {
  let best = { cols: n, rows: 1, score: -1 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const score = Math.min(aspect / cols, 1 / rows);   // the cell size, in units of the slide's height, if cells are square-ish
    if (score > best.score + 1e-9) best = { cols, rows, score };
  }
  return { cols: best.cols, rows: best.rows };
}

// Net labels: a wire's signal name, kept in groups["wire_labels"] ({ wireId: text }) so the file stays valid.
export const wireLabelOf = (doc, id) => doc.groups?.wire_labels?.[id] ?? "";
export function setWireLabels(doc, ids, text) {
  const d = clone(doc), map = { ...(d.groups?.wire_labels ?? {}) };
  for (const id of ids) if (text) map[id] = text; else delete map[id];
  const groups = { ...(d.groups ?? {}) };
  if (Object.keys(map).length) groups.wire_labels = map; else delete groups.wire_labels;
  if (Object.keys(groups).length) d.groups = groups; else delete d.groups;
  return d;
}

// Where a wire's net label sits: groups["wire_label_style"] = { wireId: { side, gap } }. side is up, down, left or right
// (absent: above a horizontal run, right of a vertical one); gap is extra distance in grid steps along that side.
export const SIDES = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };
export const wireLabelStyleOf = (doc, id) => doc.groups?.wire_label_style?.[id] ?? {};
export function setWireLabelStyle(doc, ids, patch) {
  const d = clone(doc), map = { ...(d.groups?.wire_label_style ?? {}) };
  for (const id of ids) {
    const s = { ...(map[id] ?? {}), ...patch };
    if (!(s.side in SIDES)) delete s.side;
    s.gap = Number.isFinite(+s.gap) ? Math.max(-10, Math.min(20, +s.gap)) : 0;
    if (!s.gap) delete s.gap;
    if (Object.keys(s).length) map[id] = s; else delete map[id];
  }
  const groups = { ...(d.groups ?? {}) };
  if (Object.keys(map).length) groups.wire_label_style = map; else delete groups.wire_label_style;
  if (Object.keys(groups).length) d.groups = groups; else delete d.groups;
  return d;
}
