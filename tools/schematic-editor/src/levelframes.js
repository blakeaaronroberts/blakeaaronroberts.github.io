// Level frames (F11.2). No DOM.
//
// A frame is a named snapshot of the logic levels on the wires and elements: an initial Frame 0 followed
// by one frame per timing step. Frames live in the figure's own free-form `groups`
// map, under the key "frames", so the circuit/0.2 file stays valid and Save and Open keep them. Each frame is
// { name, levels: { "<wire or element id>": "0" | "1" | "X" | "Z" } }; anything not listed has no level.
//
// Every function returns a new document; none changes its argument.

import { clone, connectedWireIds, wiresForRefs } from "./doc.js";

export const KEY = "frames";

const zeroFrame = (levels = {}) => ({
  name: "Frame 0",
  levels: structuredClone(levels),
});

/** The frames a document carries (a copy), always beginning with Frame 0. */
export function framesOf(doc) {
  const saved = Array.isArray(doc.groups?.[KEY]) ? structuredClone(doc.groups[KEY]) : [];
  return [zeroFrame(saved[0]?.name === "Frame 0" ? saved[0].levels ?? {} : {}), ...(saved[0]?.name === "Frame 0" ? saved.slice(1) : saved)];
}

function withFrames(doc, frames) {
  const d = clone(doc);
  const groups = { ...(d.groups ?? {}) };
  const rest = frames[0]?.name === "Frame 0" ? frames.slice(1) : frames;
  groups[KEY] = [zeroFrame(frames[0]?.name === "Frame 0" ? frames[0].levels ?? {} : {}), ...rest];
  if (Object.keys(groups).length) d.groups = groups; else delete d.groups;
  return d;
}

/** Add or repair the invariant Frame 0 in a document. */
export const ensureFrameZero = (doc) => withFrames(doc, framesOf(doc));

/** The current levels of the document, as a frame's `levels`. */
export function levelsOf(doc) {
  const levels = { ...(doc.groups?.port_levels ?? {}) };
  for (const x of [...doc.wires, ...doc.elements]) if (x.level) levels[x.id] = x.level;
  return levels;
}

/** Add a frame holding the current levels. The name defaults to "Frame N". */
export function captureFrame(doc, name) {
  const frames = framesOf(doc);
  frames.push({ name: (name ?? "").trim() || `Frame ${frames.length}`, levels: levelsOf(doc) });
  return withFrames(doc, frames);
}

/** The document drawn at a frame's levels (for the canvas and the exports). The frames themselves are kept. */
export function applyFrame(doc, frame) {
  const d = clone(doc);
  for (const x of [...d.wires, ...d.elements]) {
    const level = frame.levels?.[x.id];
    if (level) x.level = level; else delete x.level;
  }
  const portLevels = {};
  for (const port of d.ports) if (["0", "1", "X", "Z"].includes(frame.levels?.[port.id])) portLevels[port.id] = frame.levels[port.id];
  const groups = { ...(d.groups ?? {}) };
  if (Object.keys(portLevels).length) groups.port_levels = portLevels; else delete groups.port_levels;
  if (Object.keys(groups).length) d.groups = groups; else delete d.groups;
  return d;
}

export const renameFrame = (doc, i, name) => {
  const frames = framesOf(doc);
  if (i > 0 && frames[i] && name.trim()) frames[i].name = name.trim();
  return withFrames(doc, frames);
};

export const removeFrame = (doc, i) => i <= 0 ? withFrames(doc, framesOf(doc)) : withFrames(doc, framesOf(doc).filter((_, k) => k !== i));

/** Move frame i by `by` places (-1 earlier, +1 later). */
export function moveFrame(doc, i, by) {
  const frames = framesOf(doc), j = i + by;
  if (i === 0 || j <= 0 || !frames[i] || j >= frames.length) return withFrames(doc, frames);
  [frames[i], frames[j]] = [frames[j], frames[i]];
  return withFrames(doc, frames);
}

/** Replace frame i's levels with the document's current ones. */
export function recaptureFrame(doc, i, editedIds = null) {
  const frames = framesOf(doc);
  if (i >= 0 && frames[i]) {
    frames[i].levels = levelsOf(doc);
    if (editedIds === null) delete frames[i].calculated;
    else if (frames[i].calculated) {
      for (const id of editedIds) delete frames[i].calculated[id];
      if (!Object.keys(frames[i].calculated).length) delete frames[i].calculated;
    }
  }
  return withFrames(doc, frames);
}

/** Replace calculated levels for completed timing steps, keeping explicitly edited levels. */
export function setCalculatedFrames(doc, results) {
  const frames = framesOf(doc);
  for (const [i, generated] of results.entries()) {
    const frame = frames[i + 1];
    if (!frame) throw new Error(`Missing timing frame ${i + 1}.`);
    const previous = frame.calculated ?? {};
    for (const [id, level] of Object.entries(previous)) {
      if (frame.levels[id] === level) delete frame.levels[id];
    }
    frame.calculated = {};
    for (const [id, level] of Object.entries(generated)) {
      if (!(id in frame.levels)) {
        frame.levels[id] = level;
        frame.calculated[id] = level;
      }
    }
    if (!Object.keys(frame.calculated).length) delete frame.calculated;
  }
  return withFrames(doc, frames);
}

/** "00", "01", ...: the number in an exported file's name (at least two digits). */
export const numbered = (i, n) => String(i).padStart(Math.max(2, String(n - 1).length), "0");

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
  const label = typeof text === "string" ? text.trim() : "";
  for (const id of ids) if (label) map[id] = label; else delete map[id];
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

// Level-tag placement uses the same sides and grid-step offset as net labels, for wires and elements.
export const levelTagStyleOf = (doc, id) => doc.groups?.level_tag_style?.[id] ?? {};
export function setLevelTagStyle(doc, ids, patch) {
  const d = clone(doc), map = { ...(d.groups?.level_tag_style ?? {}) };
  for (const id of ids) {
    const style = { ...(map[id] ?? {}), ...patch };
    if (!(style.side in SIDES)) delete style.side;
    style.gap = Number.isFinite(+style.gap) ? Math.max(-10, Math.min(20, +style.gap)) : 0;
    if (!style.gap) delete style.gap;
    if (Object.keys(style).length) map[id] = style; else delete map[id];
  }
  const groups = { ...(d.groups ?? {}) };
  if (Object.keys(map).length) groups.level_tag_style = map; else delete groups.level_tag_style;
  if (Object.keys(groups).length) d.groups = groups; else delete d.groups;
  return d;
}

// ---- frames from the timing diagram -------------------------------------------------------------
// The timing tool sends signals as [{name, levels: ["0","1","X","Z",null, ...]}], one level per step. Step i becomes frame i+1.

/** The wire and element ids a signal name drives: wires with that net label, the net a port of that name or label sits on, and an element of that id. */
export function targetsOf(doc, nets, name, pack = null) {
  const wires = new Set(), elements = new Set(), ports = new Set();
  const refs = new Set();
  const labelText = (text) => typeof text === "string" ? text.trim() : "";
  const signalName = labelText(name);
  for (const port of doc.ports) if (port.id === name || port.label === name) ports.add(port.id);
  for (const [key, members] of Object.entries(nets)) {
    const hit = key === name || members.some((m) => doc.ports.some((p) => p.id === m && (p.id === name || p.label === name)));
    if (hit) members.forEach((m) => refs.add(m));
  }
  for (const w of doc.wires) {
    const lab = doc.groups?.wire_labels?.[w.id];
    const onNet = [w.from, w.to].some((e) => typeof e === "string" && refs.has(e));
    if (labelText(lab) === signalName || onNet) wires.add(w.id);
  }
  if (pack) {
    for (const id of wiresForRefs(doc, pack, [...refs])) wires.add(id);
    for (const id of connectedWireIds(doc, pack, [...wires])) wires.add(id);
  }
  for (const w of doc.wires) if (labelText(doc.groups?.wire_labels?.[w.id]) === signalName) [w.from, w.to].forEach((e) => { if (typeof e === "string") refs.add(e); });
  for (const w of doc.wires) if ([w.from, w.to].some((e) => typeof e === "string" && refs.has(e))) wires.add(w.id);
  for (const e of doc.elements) if (e.id === name) elements.add(e.id);
  return { wires: [...wires], elements: [...elements], ports: [...ports] };
}

/** Replace the document's frames with one per step of the signals. Returns { doc, steps, matched (signal names that drive something), unmatched }. */
export function framesFromSignals(doc, nets, signals, pack = null) {
  const steps = Math.max(0, ...signals.map((s) => s.levels.length));
  const old = framesOf(doc);
  const driven = new Set(signals.flatMap((signal) => {
    const target = targetsOf(doc, nets, signal.name, pack);
    return [...target.wires, ...target.elements, ...target.ports];
  }));
  const frames = [old[0], ...Array.from({ length: steps }, (_, i) => {
    const levels = Object.fromEntries(Object.entries(old[i + 1]?.levels ?? {}).filter(([id]) => !driven.has(id)));
    const calculated = Object.fromEntries(Object.entries(old[i + 1]?.calculated ?? {}).filter(([id, value]) => !driven.has(id) && levels[id] === value));
    return { name: `Step ${i + 1}`, levels, ...(Object.keys(calculated).length ? { calculated } : {}) };
  })];
  const manual = frames.map(() => new Set());
  const matched = [], unmatched = [];
  for (const s of signals) {
    const t = targetsOf(doc, nets, s.name, pack);
    if (!t.wires.length && !t.elements.length && !t.ports.length) { unmatched.push(s.name); continue; }
    matched.push(s.name);
    s.levels.forEach((lv, i) => {
      if (!lv) return;
      const frame = frames[i + 1], generated = s.calculated?.[i] === true;
      for (const id of [...t.wires, ...t.elements, ...t.ports]) {
        if (generated && manual[i + 1].has(id)) continue;
        const oldLevel = old[i + 1]?.levels?.[id];
        if (generated && oldLevel && old[i + 1]?.calculated?.[id] !== oldLevel) {
          frame.levels[id] = oldLevel;
          manual[i + 1].add(id);
          continue;
        }
        frame.levels[id] = lv;
        if (generated) frame.calculated = { ...(frame.calculated ?? {}), [id]: lv };
        else { manual[i + 1].add(id); if (frame.calculated) delete frame.calculated[id]; }
      }
      if (frame.calculated && !Object.keys(frame.calculated).length) delete frame.calculated;
    });
  }
  return { doc: withFrames(doc, frames), steps, matched, unmatched };
}
