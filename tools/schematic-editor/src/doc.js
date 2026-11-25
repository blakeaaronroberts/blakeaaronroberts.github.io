// The document: a circuit-schema object, edited by pure functions. No DOM.
//
// Every edit takes a document and returns a new one (the input is never changed),
// which is what makes snapshot undo (history.js) safe. Wire corners, junction
// counts, joints and nets are derived; per-junction solder-dot choices live in groups.

import { elementBox, orient, pinOf } from "./geometry.js";
import { BLOCK, canonicalParams, geometryOf, minSize, normalizeBlock } from "./block.js";
import { directionProblems, onPolyline, onSegment, route, snapOntoPolyline } from "./router.js";
import { checkedBackdrop } from "./svgimport.js";
import { annotationsFor, busesOf, editorDataOf } from "./annotations.js";

export const SCHEMA = "circuit/0.3";
export const SCHEMA_04 = "circuit/0.4";   // F22.1a: adds `modules` (hierarchy) and a block's params.module
const LEGACY_SCHEMA = "circuit/0.2";
const ID = /^[A-Za-z][A-Za-z0-9_]*$/;
const REF = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_+-]+)?$/;
const SOLDER_DOTS = "solder_dots";

export const clone = (doc) => structuredClone(doc);
export const isPoint = (end) => Array.isArray(end);
const same = (p, q) => p[0] === q[0] && p[1] === q[1];
const key = (p) => `${p[0]},${p[1]}`;
const add = (p, d) => [p[0] + d[0], p[1] + d[1]];

export function newDoc(id = "figure") {
  return { schema: LEGACY_SCHEMA, id, grid_cm: 0.25, elements: [], ports: [], wires: [], junctions: [], labels: [] };
}

// ---- ids ---------------------------------------------------------------------------

const PREFIX = {
  and_gate: "and", or_gate: "or", not_gate: "not", nand_gate: "nand", nor_gate: "nor", xor_gate: "xor",
  d_flipflop: "dff", d_latch: "latch", mux2: "mux", decoder2to4: "dec", full_adder: "fa",
  resistor: "R", capacitor: "C", inductor: "L", voltage_source: "V", switch: "SW", ground: "gnd",
  diode: "D", npn_bjt: "Q", nmos: "M", vdd: "vdd", block: "blk",
};
export const prefixFor = (type) => PREFIX[type] ?? type.replace(/[^A-Za-z0-9_]/g, "_");

function allIds(doc) {
  return new Set([...doc.elements, ...doc.ports, ...doc.wires, ...doc.junctions].map((x) => x.id));
}

/** One namespace for elements, ports, wires and junctions (schema $defs/id). */
export function nextId(doc, prefix, taken = allIds(doc)) {
  let n = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of taken) { const m = re.exec(id); if (m) n = Math.max(n, +m[1]); }
  let id;
  do id = `${prefix}${++n}`; while (taken.has(id));
  taken.add(id);
  return id;
}

// ---- resolving ends ------------------------------------------------------------------

/** A wire end as {at, dir, kind, ...}: a pin (with its outward direction), port, junction or free point. */
export function endpoint(doc, pack, end) {
  if (isPoint(end)) return { at: end, dir: null, kind: "point" };
  const dot = end.indexOf(".");
  if (dot > 0) {
    const el = doc.elements.find((e) => e.id === end.slice(0, dot));
    const def = el && pack.defFor(el);
    const pin = def && pinOf(el, def, end.slice(dot + 1));
    return pin ? { ...pin, kind: "pin", el: el.id, pin: end.slice(dot + 1) } : null;
  }
  const port = doc.ports.find((p) => p.id === end);
  if (port) return { at: port.at, dir: null, kind: "port" };
  const j = doc.junctions.find((x) => x.id === end);
  if (j) return { at: j.at, dir: null, kind: "junction" };
  return null;
}

export function wireCorners(doc, pack, w) {
  const a = endpoint(doc, pack, w.from), b = endpoint(doc, pack, w.to);
  return a && b ? route(a, b, w.via ?? [], w.first ?? null, w.route ?? []) : null;
}

export function allCorners(doc, pack) {
  const m = new Map();
  for (const w of doc.wires) { const c = wireCorners(doc, pack, w); if (c) m.set(w.id, c); }
  return m;
}

// ---- junction upkeep -----------------------------------------------------------------

/**
 * Keep junctions valid after any edit (proposal section 3):
 * a junction whose wire is gone becomes free ends; one that a reroute pushed off its
 * wire moves to the nearest grid point on the new route; one no wire ends on is removed.
 */
export function normalize(doc, pack) {
  const wires = new Map(doc.wires.map((w) => [w.id, w]));
  for (const j of doc.junctions.filter((x) => !wires.has(x.on))) freeEndsAt(doc, j.id, j.at);
  doc.junctions = doc.junctions.filter((x) => wires.has(x.on));
  for (const j of doc.junctions) {
    const c = wireCorners(doc, pack, wires.get(j.on));
    if (c && !onPolyline(j.at, c)) j.at = snapOntoPolyline(j.at, c);
  }
  const used = new Set(doc.wires.flatMap((w) => [w.from, w.to]).filter((e) => !isPoint(e)));
  doc.junctions = doc.junctions.filter((j) => used.has(j.id));
  if (doc.groups?.[SOLDER_DOTS]) {
    const states = { ...doc.groups[SOLDER_DOTS] };
    for (const id of Object.keys(states)) if (!doc.junctions.some((j) => j.id === id)) delete states[id];
    const groups = { ...doc.groups };
    if (Object.keys(states).length) groups[SOLDER_DOTS] = states; else delete groups[SOLDER_DOTS];
    if (Object.keys(groups).length) doc.groups = groups; else delete doc.groups;
  }
  return doc;
}

/** Turn every wire end that refers to `ref` into a free end at `at`. */
function freeEndsAt(doc, ref, at) {
  for (const w of doc.wires) {
    if (w.from === ref) w.from = [...at];
    if (w.to === ref) w.to = [...at];
  }
}

// ---- edits (each returns a new document) ---------------------------------------------

export function addElement(doc, pack, type, at, rotation = 0, params = null) {
  if (type === BLOCK) { if (!params) throw new Error("a block needs params: { shape, w, h }"); }
  else if (!pack.def(type)) throw new Error(`no element "${type}" in the symbol pack`);
  doc = clone(doc);
  const id = nextId(doc, prefixFor(type));
  const el = { id, type, at: [...at] };
  if (rotation) el.rotation = rotation;
  if (type === BLOCK) el.params = canonicalParams(params);   // throws, readably, on a bad shape, size or pin
  else if (params && Object.keys(params).length) el.params = { ...params };   // a variant of a family: {"n": 4} for a 4-input gate
  doc.elements.push(el);
  return { doc, id };
}

// ---- blocks (F5) ---------------------------------------------------------------------------

const pinNames = (params) => Object.fromEntries(["left", "right", "top", "bottom"].map((s) => [s, (params.pins?.[s] ?? []).map((p) => (typeof p === "string" ? p : p.name))]));

/**
 * Change a block's params: `patch` holds any of shape, w, h, label, pins (a whole `pins` object). The size is raised to
 * what the pin rule needs, about the block's centre. A pin that is gone leaves its wires with a free end where it was;
 * if a side kept its pin count, a changed name is a rename and the wires follow it. Returns a new document.
 */
export function setBlockParams(doc, pack, id, patch) {
  const before = doc;
  doc = clone(doc);
  const el = doc.elements.find((e) => e.id === id);
  if (!el || el.type !== BLOCK) throw new Error(`${id} is not a block`);
  const old = el.params;
  const next = canonicalParams({ ...old, ...patch });
  const was = pinNames(old), now = pinNames(next);
  const rename = new Map();
  for (const side of Object.keys(was)) {
    if (was[side].length !== now[side].length) continue;
    was[side].forEach((n, i) => { if (n !== now[side][i]) rename.set(n, now[side][i]); });
  }
  const gone = new Set(Object.values(was).flat().filter((n) => !Object.values(now).flat().includes(n) && !rename.has(n)));
  for (const w of doc.wires) {
    for (const side of ["from", "to"]) {
      const end = w[side];
      if (isPoint(end) || !end.startsWith(`${id}.`)) continue;
      const pin = end.slice(id.length + 1);
      if (rename.has(pin)) w[side] = `${id}.${rename.get(pin)}`;
      else if (gone.has(pin)) w[side] = [...endpoint(before, pack, end).at];
    }
  }
  el.params = next;
  return normalize(doc, pack);
}

/**
 * Drag a block's edge or corner. `handle` is one of n, s, e, w, ne, nw, se, sw in the block's own frame; `dw` and `dh`
 * are the growth in whole modules (negative shrinks), width and height, as the dragged edge moves. The opposite edge stays
 * where it is (the block's centre moves half as far), the size is never below the pin rule's minimum, and wires on its
 * pins follow. Returns a new document.
 */
export function resizeBlock(doc, pack, id, handle, dw, dh) {
  const el = doc.elements.find((e) => e.id === id);
  if (!el || el.type !== BLOCK) throw new Error(`${id} is not a block`);
  if (!Number.isInteger(dw) || !Number.isInteger(dh)) throw new Error("a block changes size in whole modules");
  const p = normalizeBlock(el.params), min = minSize(p.pins);
  const x = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0, y = handle.includes("n") ? 1 : handle.includes("s") ? -1 : 0;
  const w = x ? Math.max(min.w, p.w + dw) : p.w, h = y ? Math.max(min.h, p.h + dh) : p.h;
  const shift = orient([x * (w - p.w), y * (h - p.h)], el.rotation ?? 0, el.mirror ?? false);   // a module of growth moves the centre one step
  const out = clone(doc);
  const e = out.elements.find((q) => q.id === id);
  e.params = canonicalParams({ ...el.params, w, h });
  e.at = [e.at[0] + shift[0], e.at[1] + shift[1]];
  return normalize(out, pack);
}

/**
 * Move a selection by d grid steps. Wire ends on pins follow their pins and the router
 * redraws the first and last legs. A wire's own corners (via) and free ends move only
 * when the whole wire moves: it is selected, or both its ends are on moving things.
 */
export function moveSelection(doc, pack, sel, d) {
  doc = clone(doc);
  const els = new Set(sel.elements ?? []);
  const ports = new Set(sel.ports ?? []);
  const whole = new Set(sel.wires ?? []);
  const junctionWire = new Map(doc.junctions.map((j) => [j.id, j.on]));
  const endMoves = (end) => {
    if (isPoint(end)) return false;
    const dot = end.indexOf(".");
    if (dot > 0) return els.has(end.slice(0, dot));
    return ports.has(end) || (junctionWire.has(end) && whole.has(junctionWire.get(end)));
  };
  for (let grew = true; grew;) {              // a junction on a moving wire moves, which can move more wires
    grew = false;
    for (const w of doc.wires) {
      if (!whole.has(w.id) && endMoves(w.from) && endMoves(w.to)) { whole.add(w.id); grew = true; }
    }
  }
  for (const el of doc.elements) if (els.has(el.id)) el.at = add(el.at, d);
  for (const p of doc.ports) if (ports.has(p.id)) p.at = add(p.at, d);
  for (const i of sel.labels ?? []) if (doc.labels[i]) doc.labels[i].at = add(doc.labels[i].at, d);
  for (const w of doc.wires) {
    if (!whole.has(w.id)) continue;
    if (w.via) w.via = w.via.map((p) => add(p, d));
    if (isPoint(w.from)) w.from = add(w.from, d);
    if (isPoint(w.to)) w.to = add(w.to, d);
  }
  for (const j of doc.junctions) if (whole.has(j.on)) j.at = add(j.at, d);
  for (const crossing of doc.groups?.solder_crossings ?? []) {
    if (crossing.wires.every((id) => whole.has(id))) crossing.at = add(crossing.at, d);
  }
  return normalize(doc, pack);
}

/** Rotate elements 90 degrees counter-clockwise about their own origins. */
export function rotateElements(doc, pack, ids) {
  doc = clone(doc);
  for (const el of doc.elements) {
    if (!ids.includes(el.id)) continue;
    const r = ((el.rotation ?? 0) + 90) % 360;
    if (r) el.rotation = r; else delete el.rotation;
  }
  return normalize(doc, pack);
}

/** Mirror elements that the pack marks "mirrorable": true; the rest are refused (proposal 10.3). */
export function mirrorElements(doc, pack, ids) {
  doc = clone(doc);
  const refused = [];
  for (const el of doc.elements) {
    if (!ids.includes(el.id)) continue;
    if (!pack.mirrorable(el.type)) { refused.push(el.id); continue; }
    if (el.mirror) delete el.mirror; else el.mirror = true;
  }
  return { doc: normalize(doc, pack), refused };
}

/** Delete elements and wires. Wires that ended on deleted things keep their drawn end as a free end. */
export function deleteSelection(doc, pack, sel) {
  const els = new Set(sel.elements ?? []), ws = new Set(sel.wires ?? []);
  const ports = new Set(sel.ports ?? []), labels = new Set(sel.labels ?? []);
  const before = doc;
  doc = clone(doc);
  for (const w of doc.wires) {
    for (const side of ["from", "to"]) {
      const end = w[side];
      const gone = !isPoint(end) && (end.includes(".") ? els.has(end.slice(0, end.indexOf("."))) : ports.has(end));
      if (gone) {
        const e = endpoint(before, pack, end);
        if (e) w[side] = [...e.at];
      }
    }
  }
  doc.elements = doc.elements.filter((e) => !els.has(e.id));
  doc.ports = doc.ports.filter((p) => !ports.has(p.id));
  doc.labels = doc.labels.filter((_, i) => !labels.has(i));
  doc.wires = doc.wires.filter((w) => !ws.has(w.id));
  if (doc.groups?.port_taps) {
    for (const [port, wire] of Object.entries(doc.groups.port_taps)) {
      if (ports.has(port) || ws.has(wire)) delete doc.groups.port_taps[port];
    }
    if (!Object.keys(doc.groups.port_taps).length) delete doc.groups.port_taps;
  }
  if (doc.groups?.solder_crossings) {
    for (const crossing of doc.groups.solder_crossings) crossing.wires = crossing.wires.filter((id) => !ws.has(id));
    doc.groups.solder_crossings = doc.groups.solder_crossings.filter((crossing) => crossing.wires.length >= 2);
    if (!doc.groups.solder_crossings.length) delete doc.groups.solder_crossings;
  }
  return normalize(doc, pack);
}

/**
 * Turn something the user clicked into a wire end. Targets:
 *   {kind: "pin", ref}  {kind: "junction", id}  {kind: "port", id}
 *   {kind: "wire", id, at}  (ending on a wire taps it: a junction)
 *   {kind: "point", at}
 * Mutates `doc` (call on a clone).
 */
function endFor(doc, pack, t) {
  if (t.kind === "pin") return t.ref;
  if (t.kind === "junction" || t.kind === "port") return t.id;
  if (t.kind === "point") return [...t.at];
  if (t.kind === "wire") return tap(doc, pack, t.id, t.at);
  throw new Error(`unknown wire target ${t.kind}`);
}

/** A junction on wire `wireId` at `at` (reused if one is there). At the wire's own end, connect to that end instead. */
export function tap(doc, pack, wireId, at) {
  const w = doc.wires.find((x) => x.id === wireId);
  const c = w && wireCorners(doc, pack, w);
  if (!c || !onPolyline(at, c)) throw new Error(`[${at}] is not on wire ${wireId}`);
  if (same(at, c[0])) return isPoint(w.from) ? [...at] : w.from;
  if (same(at, c[c.length - 1])) return isPoint(w.to) ? [...at] : w.to;
  const existing = doc.junctions.find((j) => j.on === wireId && same(j.at, at));
  if (existing) return existing.id;
  const id = nextId(doc, "j");
  doc.junctions.push({ id, on: wireId, at: [...at] });
  return id;
}

/** Add a wire through clicked corners; routeModes selects auto or straight per leg. A zero-length wire has a null id. */
export function addWire(doc, pack, from, to, via = [], routeModes = []) {
  doc = clone(doc);
  const a = endFor(doc, pack, from), b = endFor(doc, pack, to);
  const pa = endpoint(doc, pack, a)?.at, pb = endpoint(doc, pack, b)?.at;
  if (!Array.isArray(routeModes) || (routeModes.length && routeModes.length !== via.length + 1)) {
    throw new Error("a wire route needs one mode per leg");
  }
  if (routeModes.some((mode) => !["auto", "straight"].includes(mode))) {
    throw new Error('wire route modes must be "auto" or "straight"');
  }
  const cleanedVia = [], cleanedModes = [];
  let finalMode = routeModes.at(-1) ?? "auto";
  for (let i = 0; i < via.length; i++) {
    const p = via[i];
    if (same(p, pb)) { finalMode = routeModes[i] ?? finalMode; continue; }
    if (same(p, pa) || (i > 0 && same(p, via[i - 1]))) continue;
    cleanedVia.push(p);
    if (routeModes.length) cleanedModes.push(routeModes[i]);
  }
  via = cleanedVia;
  if (routeModes.length) {
    cleanedModes.push(finalMode);
    routeModes = cleanedModes;
  }
  if (!pa || !pb || (same(pa, pb) && !via.length)) return { doc: normalize(doc, pack), id: null };
  const id = nextId(doc, "w");
  const w = { id, from: a, to: b };
  if (via.length) w.via = via.map((p) => [...p]);
  if (routeModes.includes("straight")) {
    w.route = routeModes;
    doc.schema = SCHEMA;
  }
  doc.wires.push(w);
  return { doc: normalize(doc, pack), id };
}

/** Reconnect one wire endpoint to a pin, port, junction, wire or free grid point. */
export function moveWireEnd(doc, pack, id, side, target) {
  if (!["from", "to"].includes(side)) throw new Error("wire end must be from or to");
  if (target.kind === "wire" && target.id === id) throw new Error("a wire end cannot connect to itself");
  const next = clone(doc), wire = next.wires.find((item) => item.id === id);
  if (!wire) throw new Error(`no wire ${id}`);
  const end = endFor(next, pack, target);
  const at = endpoint(next, pack, end)?.at;
  const other = endpoint(next, pack, wire[side === "from" ? "to" : "from"])?.at;
  if (!at || !other) throw new Error("the wire endpoint does not exist");
  if (same(at, other) && !wire.via?.length) throw new Error("a wire needs some length");
  wire[side] = end;
  return normalize(next, pack);
}

// ---- copy and paste --------------------------------------------------------------------

/** The selected elements, the wires between them (or selected), and their junctions. Ends leaving the fragment become free ends. */
export function extractFragment(doc, pack, sel) {
  const els = new Set(sel.elements ?? []);
  const ws = new Set(sel.wires ?? []);
  const ports = new Set(sel.ports ?? []);
  const js = new Set();
  const inside = (end) => {
    if (isPoint(end)) return false;
    const dot = end.indexOf(".");
    return dot > 0 ? els.has(end.slice(0, dot)) : js.has(end) || ports.has(end);
  };
  for (let grew = true; grew;) {
    grew = false;
    for (const j of doc.junctions) if (ws.has(j.on) && !js.has(j.id)) { js.add(j.id); grew = true; }
    for (const w of doc.wires) if (!ws.has(w.id) && inside(w.from) && inside(w.to)) { ws.add(w.id); grew = true; }
  }
  const wires = doc.wires.filter((w) => ws.has(w.id)).map((w) => {
    const c = clone(w);
    for (const side of ["from", "to"]) if (!isPoint(c[side]) && !inside(c[side])) c[side] = [...endpoint(doc, pack, c[side]).at];
    return c;
  });
  const solderDots = Object.fromEntries(doc.junctions.filter((j) => js.has(j.id) && !junctionConnected(doc, j.id)).map((j) => [j.id, false]));
  const portTaps = Object.fromEntries(Object.entries(doc.groups?.port_taps ?? {}).filter(([port, wire]) => ports.has(port) && ws.has(wire)));
  const crossings = (doc.groups?.solder_crossings ?? []).map((crossing) => ({ ...crossing, wires: crossing.wires.filter((id) => ws.has(id)) })).filter((crossing) => crossing.wires.length >= 2);
  return {
    elements: doc.elements.filter((e) => els.has(e.id)).map(clone),
    wires,
    junctions: doc.junctions.filter((j) => js.has(j.id)).map(clone),
    ports: doc.ports.filter((p) => ports.has(p.id)).map(clone),
    labels: (sel.labels ?? []).filter((i) => doc.labels[i]).map((i) => clone(doc.labels[i])),
    ...(Object.keys(solderDots).length ? { solderDots } : {}),
    ...(Object.keys(portTaps).length ? { portTaps } : {}),
    ...(crossings.length ? { crossings } : {}),
  };
}

/** Paste a fragment offset by d grid steps, with fresh ids. Returns {doc, selection}. */
export function pasteFragment(doc, pack, frag, d) {
  doc = clone(doc);
  const taken = allIds(doc), map = new Map();
  const fresh = (id, prefix) => { const n = nextId(doc, prefix, taken); map.set(id, n); return n; };
  const stem = (id) => id.replace(/\d+$/, "") || "x";
  for (const e of frag.elements) fresh(e.id, prefixFor(e.type));
  for (const w of frag.wires) fresh(w.id, stem(w.id));
  for (const j of frag.junctions) fresh(j.id, stem(j.id));
  for (const p of frag.ports ?? []) fresh(p.id, stem(p.id));
  const remap = (end) => {
    if (isPoint(end)) return add(end, d);
    const dot = end.indexOf(".");
    return dot > 0 ? `${map.get(end.slice(0, dot))}${end.slice(dot)}` : map.get(end);
  };
  for (const e of frag.elements) doc.elements.push({ ...clone(e), id: map.get(e.id), at: add(e.at, d) });
  for (const w of frag.wires) {
    const n = { ...clone(w), id: map.get(w.id), from: remap(w.from), to: remap(w.to) };
    if (w.via) n.via = w.via.map((p) => add(p, d));
    doc.wires.push(n);
  }
  if (doc.wires.some((w) => w.route?.includes("straight"))) doc.schema = SCHEMA;
  for (const j of frag.junctions) doc.junctions.push({ id: map.get(j.id), on: map.get(j.on), at: add(j.at, d) });
  for (const id of Object.keys(frag.solderDots ?? {})) {
    const pastedId = map.get(id);
    if (pastedId) doc = setJunctionConnected(doc, pastedId, false);
  }
  for (const p of frag.ports ?? []) doc.ports.push({ ...clone(p), id: map.get(p.id), at: add(p.at, d) });
  for (const [port, wire] of Object.entries(frag.portTaps ?? {})) {
    if (map.has(port) && map.has(wire)) doc.groups = { ...(doc.groups ?? {}), port_taps: { ...(doc.groups?.port_taps ?? {}), [map.get(port)]: map.get(wire) } };
  }
  for (const crossing of frag.crossings ?? []) {
    const remapped = { at: add(crossing.at, d), wires: crossing.wires.map((id) => map.get(id)).filter(Boolean) };
    if (remapped.wires.length >= 2) doc.groups = { ...(doc.groups ?? {}), solder_crossings: [...(doc.groups?.solder_crossings ?? []), remapped] };
  }
  const firstLabel = doc.labels.length;
  for (const l of frag.labels ?? []) doc.labels.push({ ...clone(l), at: add(l.at, d) });
  return {
    doc: normalize(doc, pack),
    selection: {
      elements: frag.elements.map((e) => map.get(e.id)),
      wires: frag.wires.map((w) => map.get(w.id)),
      ports: (frag.ports ?? []).map((p) => map.get(p.id)),
      labels: (frag.labels ?? []).map((_, i) => firstLabel + i),
    },
  };
}

// ---- ports, labels and wire levels -------------------------------------------------------

const SIDES = ["left", "right", "up", "down"];
export const LEVEL_VALUES = ["0", "1", "X", "Z"];
export const ARROWS = ["none", "start", "end", "both"];

const sideName = (v) => (Math.abs(v[0]) >= Math.abs(v[1]) ? (v[0] > 0 ? "right" : "left") : (v[1] > 0 ? "up" : "down"));

/**
 * Which side of a grid point a label should sit on so it lies clear of what ends there: outward from
 * a pin's tip, or away from the wire that ends at the point. null if nothing ends there.
 */
export function exitSide(doc, pack, at) {
  for (const el of doc.elements) {
    const def = pack.defFor(el);
    if (!def) continue;
    for (const name of Object.keys(def.pins)) {
      const p = pinOf(el, def, name);
      if (same(p.at, at)) return sideName(p.dir);
    }
  }
  for (const c of allCorners(doc, pack).values()) {
    for (const [a, b] of [[c[0], c[1]], [c[c.length - 1], c[c.length - 2]]]) {
      if (b && same(a, at)) return sideName([a[0] - b[0], a[1] - b[1]]);
    }
  }
  return null;
}

/** An input or output port at a grid point. Its id is also its net's name. */
export function addPort(doc, pack, at, dir = "in", wireId = null) {
  doc = clone(doc);
  if (wireId !== null) {
    const wire = doc.wires.find((item) => item.id === wireId);
    const corners = wire && wireCorners(doc, pack, wire);
    if (!corners || !onPolyline(at, corners)) throw new Error("the port must be on the selected wire");
  }
  const id = nextId(doc, dir === "in" ? "in" : "out");
  doc.ports.push({ id, dir, at: [...at] });
  if (wireId !== null) doc.groups = { ...(doc.groups ?? {}), port_taps: { ...(doc.groups?.port_taps ?? {}), [id]: wireId } };
  return { doc: normalize(doc, pack), id };
}

/** Change a port's id, direction, label or side. An empty label or side removes it. Renaming follows the wires on it. */
export function setPort(doc, pack, id, fields) {
  doc = clone(doc);
  const p = doc.ports.find((x) => x.id === id);
  if (!p) throw new Error(`no port ${id}`);
  if (fields.dir !== undefined) {
    if (!["in", "out"].includes(fields.dir)) throw new Error(`direction must be in or out`);
    p.dir = fields.dir;
  }
  for (const k of ["label", "side"]) {
    if (!(k in fields)) continue;
    if (k === "side" && fields.side && !SIDES.includes(fields.side)) throw new Error(`side must be left, right, up or down`);
    if (fields[k]) p[k] = fields[k]; else delete p[k];
  }
  if (fields.id !== undefined && fields.id !== id) {
    if (!ID.test(fields.id)) throw new Error(`"${fields.id}" is not an id: start with a letter, then letters, digits and _`);
    if (allIds(doc).has(fields.id)) throw new Error(`the id ${fields.id} is already used`);
    for (const w of doc.wires) { if (w.from === id) w.from = fields.id; if (w.to === id) w.to = fields.id; }
    if (doc.groups?.port_taps?.[id]) {
      doc.groups.port_taps[fields.id] = doc.groups.port_taps[id];
      delete doc.groups.port_taps[id];
    }
    p.id = fields.id;
  }
  return normalize(doc, pack);
}

/** Free text (a title, a signal name) at a grid point, on a side of it or centred. */
export function addLabel(doc, at, text, side = null) {
  doc = clone(doc);
  const l = { text, at: [...at] };
  if (side) l.side = side;
  doc.labels.push(l);
  return { doc, index: doc.labels.length - 1 };
}

export function setLabel(doc, index, fields) {
  doc = clone(doc);
  const l = doc.labels[index];
  if (!l) throw new Error(`no label ${index}`);
  if (fields.text !== undefined) l.text = fields.text;
  if ("side" in fields) {
    if (fields.side && !SIDES.includes(fields.side)) throw new Error(`side must be left, right, up or down`);
    if (fields.side) l.side = fields.side; else delete l.side;
  }
  return doc;
}

/** An element's own label (shown only where the pack gives that element a label position). */
export function setElementLabel(doc, id, text) {
  doc = clone(doc);
  const el = doc.elements.find((e) => e.id === id);
  if (!el) throw new Error(`no element ${id}`);
  if (text) el.label = text; else delete el.label;
  return doc;
}

/** Arrowheads and a bus mark on wires: `bus` is optional text; an empty string marks an unlabeled bus, null removes the mark. */
export function setWireStyle(doc, wireIds, fields) {
  if (fields.arrow !== undefined && !ARROWS.includes(fields.arrow)) throw new Error(`arrow must be none, start, end or both`);
  if (fields.bus !== undefined && fields.bus !== null && typeof fields.bus !== "string") throw new Error("the bus mark label must be text, such as N or 4");
  doc = clone(doc);
  for (const w of doc.wires) {
    if (!wireIds.includes(w.id)) continue;
    if (fields.arrow !== undefined) { if (fields.arrow === "none") delete w.arrow; else w.arrow = fields.arrow; }
    if (fields.bus !== undefined) { if (fields.bus === null) delete w.bus; else w.bus = fields.bus.trim(); }
  }
  return doc;
}

/** The logic level wires are drawn at: "0", "1", "X", "Z", or null for the default colour. */
export function setLevel(doc, wireIds, level, elementIds = [], pack = null) {
  if (level !== null && !LEVEL_VALUES.includes(level)) throw new Error(`level must be 0, 1, X or Z`);
  doc = clone(doc);
  const affectedWires = levelWireIds(doc, wireIds, pack);
  for (const x of [...doc.wires.filter((w) => affectedWires.includes(w.id)), ...doc.elements.filter((e) => elementIds.includes(e.id))]) {
    if (level === null) delete x.level; else x.level = level;
  }
  return doc;
}

/** Whether a junction carries a solder dot; older figures default to connected. */
export function junctionConnected(doc, id) {
  return doc.groups?.[SOLDER_DOTS]?.[id] !== false;
}

/** Set whether a junction is connected. A missing state means connected for compatibility. */
export function setJunctionConnected(doc, id, connected) {
  if (!doc.junctions.some((j) => j.id === id)) throw new Error(`no junction ${id}`);
  if (typeof connected !== "boolean") throw new Error("junction connection must be true or false");
  doc = clone(doc);
  const states = { ...(doc.groups?.[SOLDER_DOTS] ?? {}) };
  if (connected) delete states[id]; else states[id] = false;
  const groups = { ...(doc.groups ?? {}) };
  if (Object.keys(states).length) groups[SOLDER_DOTS] = states; else delete groups[SOLDER_DOTS];
  if (Object.keys(groups).length) doc.groups = groups; else delete doc.groups;
  return doc;
}

/** Join crossing wires at a grid point without joining their other crossings. */
export function connectWiresAt(doc, pack, at, wireIds) {
  const ids = [...new Set(wireIds)];
  if (ids.length < 2) throw new Error("choose a crossing of at least two wires");
  for (const id of ids) {
    const wire = doc.wires.find((item) => item.id === id);
    const corners = wire && wireCorners(doc, pack, wire);
    if (!corners || !onPolyline(at, corners)) throw new Error(`wire ${id} does not cross the chosen point`);
  }
  const next = clone(doc), crossings = next.groups?.solder_crossings ?? [];
  const existing = crossings.find((crossing) => same(crossing.at, at));
  if (existing) existing.wires = [...new Set([...existing.wires, ...ids])];
  else crossings.push({ at: [...at], wires: ids });
  next.groups = { ...(next.groups ?? {}), solder_crossings: crossings };
  return next;
}

// ---- nets (derived on save, never edited) --------------------------------------------

/**
 * "and2" before "and10"; otherwise by code point ("B" before "and1"). Not localeCompare:
 * collation can differ between browsers, and saved files must be the same bytes everywhere.
 */
export function naturalOrder(a, b) {
  const ta = a.match(/\d+|\D+/g) ?? [], tb = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(ta.length, tb.length); i++) {
    const [x, y] = [ta[i], tb[i]];
    if (x === y) continue;
    const nx = /^\d/.test(x), ny = /^\d/.test(y);
    if (nx && ny && +x !== +y) return +x - +y;
    return x < y ? -1 : 1;
  }
  return ta.length - tb.length;
}

/**
 * Union-find over pins, ports, junctions and wires, joined by wires, taps and touching
 * ends (pin tips, ports and free wire ends at the same grid point). Wires that only
 * cross are not joined. Members are pins and ports; a net is named after its port.
 */
function netGraph(doc, pack) {
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const node = (x) => { if (!parent.has(x)) parent.set(x, x); return x; };
  const union = (a, b) => { const ra = find(node(a)), rb = find(node(b)); if (ra !== rb) parent.set(ra, rb); };
  const refNode = (end) => (isPoint(end) ? `@${key(end)}` : `#${end}`);

  const members = new Set();
  for (const el of doc.elements) {
    const def = pack.defFor(el);
    for (const name of Object.keys(def?.pins ?? {})) {
      const ref = `${el.id}.${name}`;
      members.add(ref);
      union(`#${ref}`, `@${key(pinOf(el, def, name).at)}`);
    }
  }
  for (const p of doc.ports) { members.add(p.id); union(`#${p.id}`, `@${key(p.at)}`); }
  const wired = new Set();
  for (const w of doc.wires) {
    union(`~${w.id}`, refNode(w.from));
    union(`~${w.id}`, refNode(w.to));
    wired.add(`~${w.id}`);
  }
  for (const p of doc.ports) {
    const id = doc.groups?.port_taps?.[p.id], wire = doc.wires.find((w) => w.id === id);
    const corners = wire && wireCorners(doc, pack, wire);
    if (corners && onPolyline(p.at, corners)) union(`#${p.id}`, `~${id}`);
  }
  for (const crossing of doc.groups?.solder_crossings ?? []) {
    const ids = crossing.wires.filter((id) => {
      const wire = doc.wires.find((item) => item.id === id);
      const corners = wire && wireCorners(doc, pack, wire);
      return corners && onPolyline(crossing.at, corners);
    });
    for (const id of ids.slice(1)) union(`~${ids[0]}`, `~${id}`);
  }
  const ends = new Map(doc.junctions.map((j) => [j.id, 2]));
  for (const w of doc.wires) for (const end of [w.from, w.to]) {
    if (!isPoint(end) && ends.has(end)) ends.set(end, ends.get(end) + 1);
  }
  for (const j of doc.junctions) {
    const min = pack.theme.junction.min_wires;
    if (ends.get(j.id) < min || junctionConnected(doc, j.id)) union(`#${j.id}`, `~${j.on}`);
  }
  return { find, node, members, wired };
}

/** Every ordinary wire on the electrical nets touched by the selected wires. */
export function connectedWireIds(doc, pack, wireIds) {
  const graph = netGraph(doc, pack);
  const selected = new Set(doc.wires.filter((w) => wireIds.includes(w.id)).map((w) => graph.find(`~${w.id}`)));
  return doc.wires.filter((w) => selected.has(graph.find(`~${w.id}`))).map((w) => w.id);
}

/** Wires sharing an electrical connection or a non-empty net label inherit one level. */
export function levelWireIds(doc, wireIds, pack = null) {
  const ids = new Set(doc.wires.filter((w) => wireIds.includes(w.id)).map((w) => w.id));
  const labelOf = (id) => {
    const label = doc.groups?.wire_labels?.[id];
    return typeof label === "string" ? label.trim() : "";
  };
  let changed = true;
  while (changed) {
    const before = ids.size;
    if (pack) for (const id of connectedWireIds(doc, pack, [...ids])) ids.add(id);
    const labels = new Set([...ids].map(labelOf).filter(Boolean));
    for (const w of doc.wires) if (labels.has(labelOf(w.id))) ids.add(w.id);
    changed = ids.size !== before;
  }
  return doc.wires.filter((w) => ids.has(w.id)).map((w) => w.id);
}

/** Ordinary wires connected to any pin or port reference. */
export function wiresForRefs(doc, pack, refs) {
  const graph = netGraph(doc, pack);
  const selected = new Set(refs.map((ref) => graph.find(`#${ref}`)));
  return doc.wires.filter((w) => selected.has(graph.find(`~${w.id}`))).map((w) => w.id);
}

export function deriveNets(doc, pack) {
  const { find, node, members, wired } = netGraph(doc, pack);

  const groups = new Map();
  for (const m of members) {
    const r = find(node(`#${m}`));
    if (!groups.has(r)) groups.set(r, { refs: [], wired: false });
    groups.get(r).refs.push(m);
  }
  for (const w of wired) { const g = groups.get(find(w)); if (g) g.wired = true; }

  const order = naturalOrder;
  const ports = new Set(doc.ports.map((p) => p.id));
  const nets = [...groups.values()].filter((g) => g.wired || g.refs.length > 1).map((g) => g.refs.sort(order));
  nets.sort((a, b) => order(a[0], b[0]));
  const out = {}, taken = new Set([...allIds(doc)]);
  const unnamed = [];
  for (const refs of nets) {
    const port = refs.find((r) => ports.has(r));
    if (port && !(port in out)) out[port] = refs; else unnamed.push(refs);
  }
  let n = 0;
  for (const refs of unnamed) {
    let id;
    do id = `n${++n}`; while (taken.has(id) || id in out);
    out[id] = refs;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => order(a, b)));
}

// ---- lint (warnings only; never blocks a save: proposal 10.5) ---------------------------

export function lint(doc, pack) {
  const out = [];
  const els = doc.elements;
  for (const el of els) {
    if (el.level && !pack.levelColour(el.level)) out.push(`${el.id}: level ${el.level} has no colour in this theme, so it is drawn in the default colour`);
    if (el.type === BLOCK) {
      try { normalizeBlock(el.params); } catch (e) { out.push(`${el.id}: ${e.message}, so it is not drawn`); }
    } else if (!pack.defFor(el)) out.push(`${el.id}: "${el.type}" is not in the symbol pack, so it is not drawn`);
    else if (el.mirror && !pack.mirrorable(el.type)) out.push(`${el.id}: mirrored, but the pack does not mark ${el.type} mirrorable (its text would print backwards)`);
  }
  for (const w of doc.wires) {
    if (w.level && !pack.levelColour(w.level)) out.push(`${w.id}: level ${w.level} has no colour in this theme, so it is drawn in the default colour`);
    const a = endpoint(doc, pack, w.from), b = endpoint(doc, pack, w.to);
    if (!a || !b) { out.push(`${w.id}: ends on ${!a ? JSON.stringify(w.from) : JSON.stringify(w.to)}, which does not exist`); continue; }
    const c = route(a, b, w.via ?? [], w.first ?? null, w.route ?? []);
    for (const msg of directionProblems(c, a, b)) out.push(`${w.id} ${msg}`);
    for (const el of els) {
      const def = pack.defFor(el);
      if (!def) continue;
      const { min, max } = elementBox(el, def);
      for (let i = 0; i + 1 < c.length; i++) {
        const lo = [Math.min(c[i][0], c[i + 1][0]), Math.min(c[i][1], c[i + 1][1])];
        const hi = [Math.max(c[i][0], c[i + 1][0]), Math.max(c[i][1], c[i + 1][1])];
        if (lo[0] < max[0] && hi[0] > min[0] && lo[1] < max[1] && hi[1] > min[1]) {
          out.push(`${w.id} runs through ${el.id}`);
          break;
        }
      }
    }
  }
  return out;
}

// ---- the figure's style block (circuit/0.2, schema model-v0.3.1) -----------------------------------------------------
// style.weight and style.theme are kept as they are (F4.4 gives them a UI); style.levels is F17's: colours for 0, 1, X, Z.

const STYLE_WEIGHTS = ["thin", "regular", "bold"], STYLE_THEMES = ["default", "dark"], HEX6 = /^#[0-9A-Fa-f]{6}$/;

/** The style block in the file's key order: weight, theme, levels ("0", "1", "X", "Z", each light then dark). */
function orderedStyle(style) {
  const out = {};
  if (style.weight !== undefined) out.weight = style.weight;
  if (style.theme !== undefined) out.theme = style.theme;
  if (style.levels && Object.keys(style.levels).length) {
    out.levels = {};
    for (const k of LEVEL_VALUES) if (style.levels[k]) out.levels[k] = ordered(style.levels[k], ["light", "dark"]);
  }
  return out;
}

/** Check a style block as the schema does: only weight, theme and levels; levels only 0, 1, X, Z, each with light and dark as #RRGGBB. */
function checkStyle(style, fail) {
  if (!style || typeof style !== "object" || Array.isArray(style)) fail("style must be an object");
  for (const k of Object.keys(style)) if (!["weight", "theme", "levels"].includes(k)) fail(`style: unknown field "${k}"`);
  if (style.weight !== undefined && !STYLE_WEIGHTS.includes(style.weight)) fail("style.weight must be thin, regular or bold");
  if (style.theme !== undefined && !STYLE_THEMES.includes(style.theme)) fail("style.theme must be default or dark");
  if (style.levels !== undefined) {
    if (!style.levels || typeof style.levels !== "object" || Array.isArray(style.levels)) fail("style.levels must be an object");
    for (const [k, v] of Object.entries(style.levels)) {
      if (!LEVEL_VALUES.includes(k)) fail(`style.levels: "${k}" is not a level (0, 1, X or Z)`);
      if (!v || typeof v !== "object" || Array.isArray(v)) fail(`style.levels.${k} must be an object`);
      for (const [m, c] of Object.entries(v)) {
        if (m !== "light" && m !== "dark") fail(`style.levels.${k}: unknown field "${m}"`);
        if (typeof c !== "string" || !HEX6.test(c)) fail(`style.levels.${k}.${m} must be a #RRGGBB colour`);
      }
    }
  }
  return style;
}

/** The document with the level colours set (an object {level: {light?, dark?}}), or cleared when empty. Other style fields are kept. */
export function setStyleLevels(doc, levels) {
  const d = clone(doc), style = { ...(d.style ?? {}) };
  if (levels && Object.keys(levels).length) style.levels = levels; else delete style.levels;
  if (Object.keys(style).length) d.style = style; else delete d.style;
  return d;
}

// ---- save and load ---------------------------------------------------------------------

const ORDER = {
  top: ["schema", "id", "title", "grid_cm", "style", "elements", "ports", "nets", "wires", "junctions", "groups", "labels", "annotations", "modules"],
  element: ["id", "type", "at", "rotation", "mirror", "label", "level", "params"],
  port: ["id", "dir", "at", "label", "side"],
  wire: ["id", "from", "to", "via", "route", "first", "arrow", "bus", "level"],
  junction: ["id", "on", "at"],
  label: ["text", "at", "side"],
};

function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  if (v && typeof v === "object") {
    const e = Object.entries(v);
    return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }` : "{}";
  }
  return JSON.stringify(v);
}

function ordered(obj, keys) {
  const o = {};
  for (const k of keys) if (obj[k] !== undefined) o[k] = obj[k];
  return o;
}

function block(items) {
  return items.length ? `[\n${items.map((s) => `    ${s}`).join(",\n")}\n  ]` : "[]";
}

/** Canonical text of a document, with its nets derived. The same document always gives the same bytes. */
export function serialize(doc, pack) {
  const el = (e) => {
    const o = ordered(e, ORDER.element);
    if (!o.rotation) delete o.rotation;
    if (!o.mirror) delete o.mirror;
    if (e.type === BLOCK && o.params) { try { o.params = canonicalParams(o.params); } catch { /* lint says why; saved as it is */ } }
    return inline(o);
  };
  const wire = (w) => {
    const o = ordered(w, ORDER.wire);
    if (!o.via?.length) delete o.via;
    if (o.arrow === "none") delete o.arrow;
    if (o.bus === undefined || o.bus === null) delete o.bus;
    return inline(o);
  };
  const nets = deriveNets(doc, pack);
  const parts = {
    // circuit/0.3 whenever the file needs it: straight wire legs, editor data (annotations) or buses kept apart from it
    schema: JSON.stringify(doc.modules && Object.keys(doc.modules).length ? SCHEMA_04 : doc.wires.some((w) => w.route?.includes("straight")) || (doc.groups && Object.keys(doc.groups).length) || doc.buses ? SCHEMA : doc.schema),
    id: JSON.stringify(doc.id),
    title: doc.title !== undefined ? JSON.stringify(doc.title) : undefined,
    grid_cm: JSON.stringify(doc.grid_cm),
    style: doc.style && Object.keys(doc.style).length ? inline(orderedStyle(doc.style)) : undefined,
    elements: block(doc.elements.map(el)),
    ports: doc.ports.length ? block(doc.ports.map((p) => inline(ordered(p, ORDER.port)))) : undefined,
    nets: Object.keys(nets).length
      ? `{\n${Object.entries(nets).map(([k, v]) => `    ${JSON.stringify(k)}: ${inline(v)}`).join(",\n")}\n  }` : "{}",
    wires: doc.wires.length ? block(doc.wires.map(wire)) : undefined,
    junctions: doc.junctions.length ? block(doc.junctions.map((j) => inline(ordered(j, ORDER.junction)))) : undefined,
    groups: doc.buses && Object.keys(doc.buses).length   // buses, in the schema's sense
      ? `{\n${Object.entries(doc.buses).map(([k, v]) => `    ${JSON.stringify(k)}: ${inline(v)}`).join(",\n")}\n  }` : undefined,
    annotations: doc.groups && Object.keys(doc.groups).length   // the editor's own data, one object per tool (annotations.js)
      ? `{\n${Object.entries(annotationsFor(doc.groups)).map(([tool, data]) => `    ${JSON.stringify(tool)}: {\n${Object.entries(data).map(([k, v]) => `      ${JSON.stringify(k)}: ${inline(v)}`).join(",\n")}\n    }`).join(",\n")}\n  }` : undefined,
    labels: doc.labels.length ? block(doc.labels.map((l) => inline(ordered(l, ORDER.label)))) : undefined,
    // Hierarchy is carried, not edited (F22.1a): written back exactly as read.
    modules: doc.modules && Object.keys(doc.modules).length ? JSON.stringify(doc.modules, null, 2).replaceAll("\n", "\n  ") : undefined,
  };
  const body = ORDER.top.filter((k) => parts[k] !== undefined).map((k) => `  ${JSON.stringify(k)}: ${parts[k]}`);
  return `{\n${body.join(",\n")}\n}\n`;
}

/** Read a circuit/0.2, 0.3 or 0.4 file. Throws with a readable message if it is not one. Returns {doc, nets}: nets as the file had them. */
export function parse(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw new Error(`not JSON: ${e.message}`); }
  const fail = (msg) => { throw new Error(msg); };
  const point = (p, where) => (Array.isArray(p) && p.length === 2 && p.every(Number.isInteger)) ? p : fail(`${where}: expected [x, y] in whole grid steps`);
  const only = (o, keys, where) => { for (const k of Object.keys(o)) if (!keys.includes(k)) fail(`${where}: unknown field "${k}"`); };
  const id = (v, where) => (typeof v === "string" && ID.test(v)) ? v : fail(`${where}: bad id ${JSON.stringify(v)}`);
  const end = (v, where) => Array.isArray(v) ? point(v, where) : (typeof v === "string" && REF.test(v)) ? v : fail(`${where}: bad end ${JSON.stringify(v)}`);

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("not a circuit file: expected one JSON object with a \"schema\" field");
  if (![LEGACY_SCHEMA, SCHEMA, SCHEMA_04].includes(raw.schema)) fail(`schema is ${JSON.stringify(raw.schema)}; this editor reads "${LEGACY_SCHEMA}", "${SCHEMA}" and "${SCHEMA_04}"`);
  if (raw.grid_cm !== 0.25) fail(`grid_cm is ${raw.grid_cm}; expected 0.25`);
  // In memory, editor data is doc.groups and buses are doc.buses; in the file they sit where annotations.js says.
  const buses = busesOf(raw);
  { const data = editorDataOf(raw); raw = { ...raw }; delete raw.annotations; delete raw.groups; if (Object.keys(data).length) raw.groups = data; }
  only(raw, ORDER.top, "file");
  for (const k of ["elements", "ports", "wires", "junctions", "labels"]) if (raw[k] !== undefined && !Array.isArray(raw[k])) fail(`${k} must be a list`);
  const doc = {
    schema: raw.schema, id: id(raw.id, "id"), grid_cm: 0.25,
    elements: raw.elements ?? fail("no elements"), ports: raw.ports ?? [], wires: raw.wires ?? [],
    junctions: raw.junctions ?? [], labels: raw.labels ?? [],
  };
  if (raw.title !== undefined) doc.title = String(raw.title);
  if (raw.modules !== undefined) {
    if (raw.schema !== SCHEMA_04) fail("modules need schema circuit/0.4");
    if (!raw.modules || typeof raw.modules !== "object" || Array.isArray(raw.modules)) fail("modules must be an object");
    for (const name of Object.keys(raw.modules)) id(name, "modules");
    doc.modules = structuredClone(raw.modules);
  }
  if (raw.groups !== undefined) {
    if (!raw.groups || typeof raw.groups !== "object" || Array.isArray(raw.groups)) fail("groups must be an object");
    const taps = raw.groups.port_taps;
    if (taps !== undefined) {
      if (!taps || typeof taps !== "object" || Array.isArray(taps)) fail("groups.port_taps must be an object");
      for (const [port, wire] of Object.entries(taps)) { id(port, "groups.port_taps"); id(wire, `groups.port_taps.${port}`); }
    }
    const portLevels = raw.groups.port_levels;
    if (portLevels !== undefined) {
      if (!portLevels || typeof portLevels !== "object" || Array.isArray(portLevels)) fail("groups.port_levels must be an object");
      for (const [port, level] of Object.entries(portLevels)) {
        id(port, "groups.port_levels");
        if (!LEVEL_VALUES.includes(level)) fail(`groups.port_levels.${port}: invalid level`);
      }
    }
    const crossings = raw.groups.solder_crossings;
    if (crossings !== undefined) {
      if (!Array.isArray(crossings)) fail("groups.solder_crossings must be a list");
      crossings.forEach((crossing, i) => {
        const where = `groups.solder_crossings[${i}]`;
        if (!crossing || typeof crossing !== "object" || Array.isArray(crossing)) fail(`${where} must be an object`);
        point(crossing.at, `${where}.at`);
        if (!Array.isArray(crossing.wires) || crossing.wires.length < 2) fail(`${where}.wires must contain at least two wire ids`);
        crossing.wires.forEach((wire) => id(wire, `${where}.wires`));
      });
    }
    doc.groups = { ...raw.groups };
    if (raw.groups.backdrop !== undefined) doc.groups.backdrop = checkedBackdrop(raw.groups.backdrop);
  }
  if (buses) doc.buses = structuredClone(buses);   // a circuit/0.3 file's groups: buses, kept as they are
  if (raw.style !== undefined) doc.style = checkStyle(raw.style, fail);
  const seen = new Set();
  const unique = (v, where) => { if (seen.has(v)) fail(`${where}: id "${v}" used twice`); seen.add(v); };
  doc.elements.forEach((e, i) => {
    const w = `elements[${i}]`;
    only(e, ORDER.element, w); unique(id(e.id, w), w);
    if (typeof e.type !== "string") fail(`${w}: no type`);
    point(e.at, w);
    if (e.rotation !== undefined && ![0, 90, 180, 270].includes(e.rotation)) fail(`${w}: rotation must be 0, 90, 180 or 270`);
    if (e.mirror !== undefined && typeof e.mirror !== "boolean") fail(`${w}: mirror must be true or false`);
    if (e.level !== undefined && !LEVEL_VALUES.includes(e.level)) fail(`${w}: level must be "0", "1", "X" or "Z" (as a string)`);
    if (e.type === BLOCK) { try { normalizeBlock(e.params); } catch (err) { fail(`${w}: ${err.message}`); } }
    else if (e.params !== undefined && (typeof e.params !== "object" || Array.isArray(e.params))) fail(`${w}: params must be an object`);
  });
  doc.ports.forEach((p, i) => {
    const w = `ports[${i}]`;
    only(p, ORDER.port, w); unique(id(p.id, w), w); point(p.at, w);
    if (!["in", "out"].includes(p.dir)) fail(`${w}: dir must be "in" or "out"`);
  });
  doc.wires.forEach((x, i) => {
    const w = `wires[${i}]`;
    only(x, raw.schema === LEGACY_SCHEMA ? ORDER.wire.filter((k) => k !== "route") : ORDER.wire, w); unique(id(x.id, w), w);
    end(x.from, `${w}.from`); end(x.to, `${w}.to`);
    (x.via ?? []).forEach((p, k) => point(p, `${w}.via[${k}]`));
    if (x.route !== undefined) {
      if (!Array.isArray(x.route) || x.route.length !== (x.via?.length ?? 0) + 1) fail(`${w}.route must have one mode for each leg`);
      if (x.route.some((mode) => !["auto", "straight"].includes(mode))) fail(`${w}.route entries must be "auto" or "straight"`);
    }
    if (x.first !== undefined && !["h", "v"].includes(x.first)) fail(`${w}: first must be "h" or "v"`);
    if (x.level !== undefined && !LEVEL_VALUES.includes(x.level)) fail(`${w}: level must be "0", "1", "X" or "Z" (as a string)`);
    if (x.arrow !== undefined && !ARROWS.includes(x.arrow)) fail(`${w}: arrow must be "none", "start", "end" or "both"`);
    if (x.bus !== undefined && typeof x.bus !== "string") fail(`${w}: bus must be text, such as "N" or "4"`);
  });
  doc.junctions.forEach((j, i) => {
    const w = `junctions[${i}]`;
    only(j, ORDER.junction, w); unique(id(j.id, w), w); id(j.on, `${w}.on`); point(j.at, w);
  });
  doc.labels.forEach((l, i) => { only(l, ORDER.label, `labels[${i}]`); point(l.at, `labels[${i}]`); });
  for (const j of doc.junctions) if (!doc.wires.some((w) => w.id === j.on)) fail(`junction ${j.id} is on wire ${j.on}, which does not exist`);
  return { doc: structuredClone(doc), nets: raw.nets ?? {} };
}

/** Do the file's nets say the same as the drawing? (Lint: the drawing realises the nets.) */
export function netsMatch(a, b) {
  const canon = (n) => JSON.stringify(Object.values(n).map((r) => [...r].sort()).sort());
  return canon(a) === canon(b);
}

// ---- dragging a wire segment (F6) ------------------------------------------------------

/**
 * Slide one run of a wire sideways by `d` grid steps (positive d is up for a horizontal run, right for a vertical one).
 * The neighbouring runs stretch to follow; the wire's ends stay where they are. An end on a pin, port or junction keeps
 * a one-step stub along the run, so the wire still leaves its anchor the same way, and the jog comes after the stub.
 * A free end simply moves with the run. Junctions sitting on the moving part of the run go with it, and the wires that
 * end on them follow. Returns a new document; throws if the run is too short to move (not enough room for the stubs).
 * The corners are written to `via`; straight-route wires cannot be reshaped one run at a time.
 */
export function moveWireSegment(doc, pack, wireId, index, d) {
  doc = clone(doc);
  const w = doc.wires.find((x) => x.id === wireId);
  const c = w && wireCorners(doc, pack, w);
  if (!c) throw new Error(`no wire ${wireId}`);
  if (w.route?.includes("straight")) throw new Error("a wire with straight legs cannot be reshaped one run at a time");
  if (!Number.isInteger(index) || index < 0 || index >= c.length - 1) throw new Error(`wire ${wireId} has no run ${index}`);
  if (!Number.isInteger(d)) throw new Error("the shift must be a whole number of grid steps");
  if (d === 0) return doc;
  const A = c[index], B = c[index + 1], n = c.length;
  const horizontal = A[1] === B[1];
  const s = horizontal ? [0, d] : [d, 0];
  const along = horizontal ? 0 : 1;
  const sign = Math.sign(B[along] - A[along]);
  const u = horizontal ? [sign, 0] : [0, sign];
  const startStub = index === 0 && !isPoint(w.from), endStub = index === n - 2 && !isPoint(w.to);
  const room = Math.abs(B[along] - A[along]) - (startStub ? 1 : 0) - (endStub ? 1 : 0);
  if (room < 1) throw new Error("this run is too short to move");

  const pts = [];
  if (index > 0) pts.push(...c.slice(0, index), add(A, s));
  else if (startStub) pts.push(A, add(A, u), add(add(A, u), s));
  else pts.push(add(A, s));
  if (index + 1 < n - 1) pts.push(add(B, s), ...c.slice(index + 2));
  else if (endStub) pts.push(add(add(B, [-u[0], -u[1]]), s), add(B, [-u[0], -u[1]]), B);
  else pts.push(add(B, s));

  const clean = pts.filter((p, i) => i === 0 || !same(p, pts[i - 1]));
  if (isPoint(w.from)) w.from = [...clean[0]];
  if (isPoint(w.to)) w.to = [...clean[clean.length - 1]];
  const via = clean.slice(1, -1);
  if (via.length) w.via = via.map((p) => [...p]); else delete w.via;
  delete w.route;
  delete w.first;

  // The junctions on the part of the run that moved go with it (the stubs stay where they are).
  const lo = Math.min(A[along], B[along]) + ((sign > 0 ? startStub : endStub) ? 1 : 0);
  const hi = Math.max(A[along], B[along]) - ((sign > 0 ? endStub : startStub) ? 1 : 0);
  for (const j of doc.junctions) {
    if (j.on !== wireId || !onSegment(j.at, A, B)) continue;
    if (j.at[along] >= lo && j.at[along] <= hi) j.at = add(j.at, s);
  }
  return normalize(doc, pack);
}

/** An element's own point (grid steps) in the document frame: its origin plus the point turned by its rotation and mirror. */
export function placeAt(el, p) {
  const [x, y] = orient(p, el.rotation ?? 0, el.mirror ?? false);
  return [el.at[0] + x, el.at[1] + y];
}
