// Hand-set levels on calculated nets, as circuit-model's scenario/0.2 fields (F24; circuit-model C14, pinned tag in
// MODEL_PIN.json). No DOM.
//
// The editor no longer evaluates a level set by hand on a net an element drives. It records it, and the simulator
// does the rest:
// - In Frame 0, on a net a latch's or flip-flop's Q or Qn drives: `initial`, that element's stored state before step 0
//   (Qn set to 0 is Q = 1).
// - In Frame 0 on any other driven net (a gate-level latch has no stored state), and in any later frame: `force`, the
//   net held at that level over a range of frames (`from` to `to`, inclusive; frame 0 is step 0).
// The record is editor data, groups.scenario = { initial: { element id: level }, force: [{ id, level, from, to }] },
// saved in annotations["schematic-editor"]. A force names its net by a wire or port id on it (net ids are made per
// run). Files saved before F24 kept such levels only in their frames; convertHandLevels() rebuilds the record from them.

import { MODELS } from "../../shared/src/sim/logic.mjs";
import { framesOf } from "./levelframes.js";
import { clone } from "./doc.js";
import { networkOf } from "./simlevels.js";

export const KEY = "scenario";
const LEVELS = new Set(["0", "1", "X", "Z"]);
const INVERT = { 0: "1", 1: "0", X: "X" };

/** The record a document carries (a copy): { initial, force }. */
export function scenarioOf(doc) {
  const s = doc.groups?.[KEY] ?? {};
  const initial = s.initial && typeof s.initial === "object" && !Array.isArray(s.initial) ? { ...s.initial } : {};
  const force = Array.isArray(s.force) ? s.force.filter((f) => f && typeof f.id === "string" && LEVELS.has(f.level) && Number.isInteger(f.from) && Number.isInteger(f.to) && f.to >= f.from).map((f) => ({ ...f })) : [];
  return { initial, force };
}

function withScenario(doc, s) {
  const d = clone(doc), groups = { ...(d.groups ?? {}) };
  const out = {};
  if (Object.keys(s.initial).length) out.initial = s.initial;
  if (s.force.length) out.force = s.force.sort((a, b) => a.id.localeCompare(b.id) || a.from - b.from);
  if (Object.keys(out).length) groups[KEY] = out; else delete groups[KEY];
  if (Object.keys(groups).length) d.groups = groups; else delete d.groups;
  return d;
}

/** Nets an element drives, by net key: { element, pin } for a stored-state element's Q or Qn, else { element: null }. */
function drivers(doc, pack, net) {
  const out = new Map();
  for (const el of doc.elements) {
    const model = MODELS[el.type];
    if (!model) continue;
    for (const pin of model.outputs) {
      const key = net.keyForRef(`${el.id}.${pin}`);
      if (key === null) continue;
      const holds = model.sequential && (pin === "Q" || pin === "Qn");
      if (!out.has(key) || holds) out.set(key, holds ? { element: el.id, pin } : { element: null });
    }
  }
  return out;
}

/**
 * Record (or, with level null, remove) a hand-set level on the nets of `ids` in frame `frame`. Ids on nets no element
 * drives are inputs and are ignored here. Returns the new document.
 */
export function setHandLevel(doc, pack, ids, frame, level) {
  const net = networkOf(doc, pack), drive = drivers(doc, pack, net), s = scenarioOf(doc);
  const keys = new Map();
  for (const id of ids) { const key = net.keyOf(id); if (key !== null && key !== undefined && drive.has(key) && !keys.has(key)) keys.set(key, id); }
  for (const [key, id] of keys) {
    const holder = drive.get(key);
    const asInitial = frame === 0 && holder.element && (level === null || level in INVERT);
    if (frame === 0 && holder.element) delete s.initial[holder.element];
    // Take this frame out of any force on the same net.
    s.force = s.force.flatMap((f) => {
      if (net.keyOf(f.id) !== key || f.to < frame || f.from > frame) return [f];
      return [f.from < frame ? { ...f, to: frame - 1 } : null, f.to > frame ? { ...f, from: frame + 1 } : null].filter(Boolean);
    });
    if (level === null) continue;
    if (asInitial) { s.initial[holder.element] = holder.pin === "Qn" ? INVERT[level] : level; continue; }
    s.force.push({ id, level, from: frame, to: frame });
    // Join neighbouring frames that hold the same net at the same level.
    const same = s.force.filter((f) => net.keyOf(f.id) === key && f.level === level).sort((a, b) => a.from - b.from);
    const rest = s.force.filter((f) => !same.includes(f));
    const joined = [];
    for (const f of same) { const last = joined.at(-1); if (last && f.from <= last.to + 1) last.to = Math.max(last.to, f.to); else joined.push({ ...f, id }); }
    s.force = [...rest, ...joined];
  }
  return withScenario(doc, s);
}

/** Drop entries that no longer fit the drawing: deleted or stateless elements, ids gone, nets no longer driven. */
export function liveScenario(doc, pack, frames = framesOf(doc).length) {
  const s = scenarioOf(doc), net = networkOf(doc, pack), drive = drivers(doc, pack, net);
  const initial = Object.fromEntries(Object.entries(s.initial).filter(([id, level]) => {
    const el = doc.elements.find((e) => e.id === id);
    return el && MODELS[el.type]?.sequential && level in INVERT;
  }));
  const force = s.force.filter((f) => { const key = net.keyOf(f.id); return key !== null && key !== undefined && drive.has(key) && f.from < frames; })
    .map((f) => ({ ...f, to: Math.min(f.to, frames - 1) }));
  return { initial, force, net };
}

/**
 * The hand-set levels the frames hold, recorded as scenario entries for frames `from` onward (entries for earlier
 * frames are kept). In a frame, a level on a driven net that the editor did not calculate there is hand-set: frames
 * after Frame 0 list what was calculated (`calculated`); in Frame 0 the static view's calculated wires are
 * groups.logic_generated_levels. Nothing in the frames changes.
 */
export function handLevelsFromFrames(doc, pack, from = 0) {
  const net = networkOf(doc, pack), drive = drivers(doc, pack, net), s = scenarioOf(doc);
  s.force = s.force.filter((f) => f.from < from).map((f) => ({ ...f, to: Math.min(f.to, from - 1) }));
  if (from === 0) s.initial = {};
  let next = withScenario(doc, s);
  const generated = doc.groups?.logic_generated_levels ?? {};
  framesOf(doc).forEach((frame, i) => {
    if (i < from) return;
    const byLevel = new Map();
    for (const [id, level] of Object.entries(frame.levels ?? {})) {
      if (!LEVELS.has(level)) continue;
      const key = net.keyOf(id);
      if (key === null || key === undefined || !drive.has(key)) continue;
      if ((i > 0 ? frame.calculated?.[id] : generated[id]) === level) continue;
      if (!byLevel.has(level)) byLevel.set(level, []);
      byLevel.get(level).push(id);
    }
    for (const [level, ids] of byLevel) next = setHandLevel(next, pack, ids, i, level);
  });
  return next;
}

/** Files saved before F24 kept hand-set levels only in their frames: record them. A document with a record is kept as it is. */
export const convertHandLevels = (doc, pack) => doc.groups?.[KEY] !== undefined ? doc : handLevelsFromFrames(doc, pack, 0);
