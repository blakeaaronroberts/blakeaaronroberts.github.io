// The document: a circuit-schema v0.2 object, edited by pure functions. No DOM.
//
// Every edit takes a document and returns a new one (the input is never changed),
// which is what makes snapshot undo (history.js) safe. Wire corners, junction
// counts, joints and nets are derived, never stored (proposal section 1).

import { elementBox, pinOf } from "./geometry.js";
import { directionProblems, onPolyline, route, snapOntoPolyline } from "./router.js";

export const SCHEMA = "circuit/0.2";
const ID = /^[A-Za-z][A-Za-z0-9_]*$/;
const REF = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_+-]+)?$/;

export const clone = (doc) => structuredClone(doc);
export const isPoint = (end) => Array.isArray(end);
const same = (p, q) => p[0] === q[0] && p[1] === q[1];
const key = (p) => `${p[0]},${p[1]}`;
const add = (p, d) => [p[0] + d[0], p[1] + d[1]];

export function newDoc(id = "figure") {
  return { schema: SCHEMA, id, grid_cm: 0.25, elements: [], ports: [], wires: [], junctions: [], labels: [] };
}

// ---- ids ---------------------------------------------------------------------------

const PREFIX = {
  and_gate: "and", or_gate: "or", not_gate: "not", nand_gate: "nand", nor_gate: "nor", xor_gate: "xor",
  d_flipflop: "dff", d_latch: "latch", mux2: "mux", decoder2to4: "dec", full_adder: "fa",
  resistor: "R", capacitor: "C", inductor: "L", voltage_source: "V", switch: "SW", ground: "gnd",
  diode: "D", npn_bjt: "Q", nmos: "M", vdd: "vdd",
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
    const def = el && pack.def(el.type);
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
  return a && b ? route(a, b, w.via ?? [], w.first ?? null) : null;
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

export function addElement(doc, pack, type, at, rotation = 0) {
  if (!pack.def(type)) throw new Error(`no element "${type}" in the symbol pack`);
  doc = clone(doc);
  const id = nextId(doc, prefixFor(type));
  const el = { id, type, at: [...at] };
  if (rotation) el.rotation = rotation;
  doc.elements.push(el);
  return { doc, id };
}

/**
 * Move a selection by d grid steps. Wire ends on pins follow their pins and the router
 * redraws the first and last legs. A wire's own corners (via) and free ends move only
 * when the whole wire moves: it is selected, or both its ends are on moving things.
 */
export function moveSelection(doc, pack, sel, d) {
  doc = clone(doc);
  const els = new Set(sel.elements ?? []);
  const whole = new Set(sel.wires ?? []);
  const junctionWire = new Map(doc.junctions.map((j) => [j.id, j.on]));
  const endMoves = (end) => {
    if (isPoint(end)) return false;
    const dot = end.indexOf(".");
    if (dot > 0) return els.has(end.slice(0, dot));
    return junctionWire.has(end) && whole.has(junctionWire.get(end));
  };
  for (let grew = true; grew;) {              // a junction on a moving wire moves, which can move more wires
    grew = false;
    for (const w of doc.wires) {
      if (!whole.has(w.id) && endMoves(w.from) && endMoves(w.to)) { whole.add(w.id); grew = true; }
    }
  }
  for (const el of doc.elements) if (els.has(el.id)) el.at = add(el.at, d);
  for (const w of doc.wires) {
    if (!whole.has(w.id)) continue;
    if (w.via) w.via = w.via.map((p) => add(p, d));
    if (isPoint(w.from)) w.from = add(w.from, d);
    if (isPoint(w.to)) w.to = add(w.to, d);
  }
  for (const j of doc.junctions) if (whole.has(j.on)) j.at = add(j.at, d);
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
  const before = doc;
  doc = clone(doc);
  for (const w of doc.wires) {
    for (const side of ["from", "to"]) {
      const end = w[side];
      if (!isPoint(end) && end.includes(".") && els.has(end.slice(0, end.indexOf(".")))) {
        const e = endpoint(before, pack, end);
        if (e) w[side] = [...e.at];
      }
    }
  }
  doc.elements = doc.elements.filter((e) => !els.has(e.id));
  doc.wires = doc.wires.filter((w) => !ws.has(w.id));
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

/** Add a wire from target to target through clicked corners. Returns {doc, id} (id null if it would have no length). */
export function addWire(doc, pack, from, to, via = []) {
  doc = clone(doc);
  const a = endFor(doc, pack, from), b = endFor(doc, pack, to);
  const pa = endpoint(doc, pack, a)?.at, pb = endpoint(doc, pack, b)?.at;
  via = via.filter((p, i) => !same(p, pa) && !same(p, pb) && (i === 0 || !same(p, via[i - 1])));
  if (!pa || !pb || (same(pa, pb) && !via.length)) return { doc: normalize(doc, pack), id: null };
  const id = nextId(doc, "w");
  const w = { id, from: a, to: b };
  if (via.length) w.via = via.map((p) => [...p]);
  doc.wires.push(w);
  return { doc: normalize(doc, pack), id };
}

// ---- copy and paste --------------------------------------------------------------------

/** The selected elements, the wires between them (or selected), and their junctions. Ends leaving the fragment become free ends. */
export function extractFragment(doc, pack, sel) {
  const els = new Set(sel.elements ?? []);
  const ws = new Set(sel.wires ?? []);
  const js = new Set();
  const inside = (end) => {
    if (isPoint(end)) return false;
    const dot = end.indexOf(".");
    return dot > 0 ? els.has(end.slice(0, dot)) : js.has(end);
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
  return {
    elements: doc.elements.filter((e) => els.has(e.id)).map(clone),
    wires,
    junctions: doc.junctions.filter((j) => js.has(j.id)).map(clone),
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
  for (const j of frag.junctions) doc.junctions.push({ id: map.get(j.id), on: map.get(j.on), at: add(j.at, d) });
  return {
    doc: normalize(doc, pack),
    selection: { elements: frag.elements.map((e) => map.get(e.id)), wires: frag.wires.map((w) => map.get(w.id)) },
  };
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
export function deriveNets(doc, pack) {
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const node = (x) => { if (!parent.has(x)) parent.set(x, x); return x; };
  const union = (a, b) => { const ra = find(node(a)), rb = find(node(b)); if (ra !== rb) parent.set(ra, rb); };
  const refNode = (end) => (isPoint(end) ? `@${key(end)}` : `#${end}`);

  const members = new Set();
  for (const el of doc.elements) {
    const def = pack.def(el.type);
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
  for (const j of doc.junctions) union(`#${j.id}`, `~${j.on}`);

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
    if (!pack.def(el.type)) out.push(`${el.id}: "${el.type}" is not in the symbol pack, so it is not drawn`);
    else if (el.mirror && !pack.mirrorable(el.type)) out.push(`${el.id}: mirrored, but the pack does not mark ${el.type} mirrorable (its text would print backwards)`);
  }
  for (const w of doc.wires) {
    const a = endpoint(doc, pack, w.from), b = endpoint(doc, pack, w.to);
    if (!a || !b) { out.push(`${w.id}: ends on ${!a ? JSON.stringify(w.from) : JSON.stringify(w.to)}, which does not exist`); continue; }
    const c = route(a, b, w.via ?? [], w.first ?? null);
    for (const msg of directionProblems(c, a, b)) out.push(`${w.id} ${msg}`);
    for (const el of els) {
      const def = pack.def(el.type);
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

// ---- save and load ---------------------------------------------------------------------

const ORDER = {
  top: ["schema", "id", "title", "grid_cm", "elements", "ports", "nets", "wires", "junctions", "groups", "labels"],
  element: ["id", "type", "at", "rotation", "mirror", "label", "params"],
  port: ["id", "dir", "at", "label", "side"],
  wire: ["id", "from", "to", "via", "first"],
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
    return inline(o);
  };
  const wire = (w) => { const o = ordered(w, ORDER.wire); if (!o.via?.length) delete o.via; return inline(o); };
  const nets = deriveNets(doc, pack);
  const parts = {
    schema: JSON.stringify(doc.schema),
    id: JSON.stringify(doc.id),
    title: doc.title !== undefined ? JSON.stringify(doc.title) : undefined,
    grid_cm: JSON.stringify(doc.grid_cm),
    elements: block(doc.elements.map(el)),
    ports: doc.ports.length ? block(doc.ports.map((p) => inline(ordered(p, ORDER.port)))) : undefined,
    nets: Object.keys(nets).length
      ? `{\n${Object.entries(nets).map(([k, v]) => `    ${JSON.stringify(k)}: ${inline(v)}`).join(",\n")}\n  }` : "{}",
    wires: doc.wires.length ? block(doc.wires.map(wire)) : undefined,
    junctions: doc.junctions.length ? block(doc.junctions.map((j) => inline(ordered(j, ORDER.junction)))) : undefined,
    groups: doc.groups && Object.keys(doc.groups).length
      ? `{\n${Object.entries(doc.groups).map(([k, v]) => `    ${JSON.stringify(k)}: ${inline(v)}`).join(",\n")}\n  }` : undefined,
    labels: doc.labels.length ? block(doc.labels.map((l) => inline(ordered(l, ORDER.label)))) : undefined,
  };
  const body = ORDER.top.filter((k) => parts[k] !== undefined).map((k) => `  ${JSON.stringify(k)}: ${parts[k]}`);
  return `{\n${body.join(",\n")}\n}\n`;
}

/** Read a circuit/0.2 file. Throws with a readable message if it is not one. Returns {doc, nets}: nets as the file had them. */
export function parse(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw new Error(`not JSON: ${e.message}`); }
  const fail = (msg) => { throw new Error(msg); };
  const point = (p, where) => (Array.isArray(p) && p.length === 2 && p.every(Number.isInteger)) ? p : fail(`${where}: expected [x, y] in whole grid steps`);
  const only = (o, keys, where) => { for (const k of Object.keys(o)) if (!keys.includes(k)) fail(`${where}: unknown field "${k}"`); };
  const id = (v, where) => (typeof v === "string" && ID.test(v)) ? v : fail(`${where}: bad id ${JSON.stringify(v)}`);
  const end = (v, where) => Array.isArray(v) ? point(v, where) : (typeof v === "string" && REF.test(v)) ? v : fail(`${where}: bad end ${JSON.stringify(v)}`);

  if (!raw || typeof raw !== "object") fail("not a circuit file");
  if (raw.schema !== SCHEMA) fail(`schema is ${JSON.stringify(raw.schema)}; this editor reads "${SCHEMA}"`);
  if (raw.grid_cm !== 0.25) fail(`grid_cm is ${raw.grid_cm}; expected 0.25`);
  only(raw, ORDER.top, "file");
  for (const k of ["elements", "ports", "wires", "junctions", "labels"]) if (raw[k] !== undefined && !Array.isArray(raw[k])) fail(`${k} must be a list`);
  const doc = {
    schema: SCHEMA, id: id(raw.id, "id"), grid_cm: 0.25,
    elements: raw.elements ?? fail("no elements"), ports: raw.ports ?? [], wires: raw.wires ?? [],
    junctions: raw.junctions ?? [], labels: raw.labels ?? [],
  };
  if (raw.title !== undefined) doc.title = String(raw.title);
  if (raw.groups !== undefined) doc.groups = raw.groups;
  const seen = new Set();
  const unique = (v, where) => { if (seen.has(v)) fail(`${where}: id "${v}" used twice`); seen.add(v); };
  doc.elements.forEach((e, i) => {
    const w = `elements[${i}]`;
    only(e, ORDER.element, w); unique(id(e.id, w), w);
    if (typeof e.type !== "string") fail(`${w}: no type`);
    point(e.at, w);
    if (e.rotation !== undefined && ![0, 90, 180, 270].includes(e.rotation)) fail(`${w}: rotation must be 0, 90, 180 or 270`);
    if (e.mirror !== undefined && typeof e.mirror !== "boolean") fail(`${w}: mirror must be true or false`);
  });
  doc.ports.forEach((p, i) => {
    const w = `ports[${i}]`;
    only(p, ORDER.port, w); unique(id(p.id, w), w); point(p.at, w);
    if (!["in", "out"].includes(p.dir)) fail(`${w}: dir must be "in" or "out"`);
  });
  doc.wires.forEach((x, i) => {
    const w = `wires[${i}]`;
    only(x, ORDER.wire, w); unique(id(x.id, w), w);
    end(x.from, `${w}.from`); end(x.to, `${w}.to`);
    (x.via ?? []).forEach((p, k) => point(p, `${w}.via[${k}]`));
    if (x.first !== undefined && !["h", "v"].includes(x.first)) fail(`${w}: first must be "h" or "v"`);
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
