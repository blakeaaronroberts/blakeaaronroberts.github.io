// The built-in "block" element: a configurable labelled box that is not in the symbol pack (circuit-schema C5).
// No DOM.
//
// params = { shape: rect | chevron | triangle | circle, w, h (whole modules), label?, pins?: {left, right, top, bottom} }.
// A pin is a name, or { name, label }.
//
// Pin rule (C5): the pins on a side are one module apart and centred on that side; a side is at least
// (pins + 1) modules long, so w and h are raised to that minimum here. The block's origin is its centre.
// Its half-width is w grid steps and its half-height is h grid steps (a module is two steps), so every
// pin tip lands on a whole grid step. Pins are in drawing order: left and right top to bottom, top and
// bottom left to right.
//
// Geometry is in the element's own frame: grid steps, y up (the same frame as the pack's pin JSON).
// blockNodes() turns it into drawn nodes (modules, y down), coloured by the theme it is given.

import { fmt, toSvg } from "./geometry.js";

export const BLOCK = "block";
export const SHAPES = ["rect", "chevron", "triangle", "circle"];
export const BLOCK_SIDES = ["left", "right", "top", "bottom"];
const OUTWARD = { left: [-1, 0], right: [1, 0], top: [0, 1], bottom: [0, -1] };
const DIRECTION_NAME = { left: "left", right: "right", top: "up", bottom: "down" };
const PIN_NAME = /^[A-Za-z0-9_+-]+$/;

/** How deep the chevron's notch is, in grid steps (one module), never more than the half-width. */
const notchDepth = (w) => Math.min(2, w);
/** How far inside the outline a pin's label starts, in grid steps, beyond the label gap. */
const LABEL_INSET = 0.3;

// ---- reading and checking params ---------------------------------------------------------

/** A pin as {name, label?}. */
function readPin(raw, where) {
  const p = typeof raw === "string" ? { name: raw } : raw;
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error(`${where}: a pin is a name, or an object with a name and an optional label`);
  for (const k of Object.keys(p)) if (k !== "name" && k !== "label") throw new Error(`${where}: unknown field "${k}" on a pin`);
  if (typeof p.name !== "string" || !PIN_NAME.test(p.name)) throw new Error(`${where}: ${JSON.stringify(p.name)} is not a pin name (letters, digits, _, + and - only)`);
  if (p.label !== undefined && typeof p.label !== "string") throw new Error(`${where}: the pin label must be text`);
  return p.label ? { name: p.name, label: p.label } : { name: p.name };
}

/** The smallest w and h the pin rule allows for these pins (whole modules). */
export function minSize(pins) {
  const n = (s) => (pins?.[s] ?? []).length;
  return { w: Math.max(1, Math.max(n("top"), n("bottom")) + 1), h: Math.max(1, Math.max(n("left"), n("right")) + 1) };
}

/**
 * Check block params and return them in canonical form (keys in schema order, every pin as {name, label?},
 * w and h raised to the pin rule's minimum). Throws an Error saying what is wrong.
 */
export function normalizeBlock(params) {
  const fail = (msg) => { throw new Error(msg); };
  if (!params || typeof params !== "object" || Array.isArray(params)) fail("a block needs params: { shape, w, h }");
  for (const k of Object.keys(params)) if (!["shape", "w", "h", "label", "pins"].includes(k)) fail(`block params: unknown field "${k}"`);
  if (!SHAPES.includes(params.shape)) fail(`block shape must be ${SHAPES.join(", ")} (not ${JSON.stringify(params.shape)})`);
  for (const k of ["w", "h"]) if (!Number.isInteger(params[k]) || params[k] < 1) fail(`block ${k} must be a whole number of modules, 1 or more`);
  if (params.label !== undefined && typeof params.label !== "string") fail("block label must be text");
  const raw = params.pins ?? {};
  if (typeof raw !== "object" || Array.isArray(raw)) fail("block pins must be an object with left, right, top and bottom lists");
  const pins = {}, seen = new Set();
  for (const k of Object.keys(raw)) if (!BLOCK_SIDES.includes(k)) fail(`block pins: unknown side "${k}" (left, right, top, bottom)`);
  for (const side of BLOCK_SIDES) {
    const list = raw[side] ?? [];
    if (!Array.isArray(list)) fail(`block pins.${side} must be a list`);
    pins[side] = list.map((p, i) => {
      const pin = readPin(p, `block pins.${side}[${i}]`);
      if (seen.has(pin.name)) fail(`block pin name "${pin.name}" is used twice`);
      seen.add(pin.name);
      return pin;
    });
  }
  const min = minSize(pins);
  return { shape: params.shape, w: Math.max(params.w, min.w), h: Math.max(params.h, min.h), label: params.label ?? "", pins };
}

/** Params as saved: canonical key order; empty label and empty sides left out; a pin with no label is just its name. */
export function canonicalParams(params) {
  const p = normalizeBlock(params);
  const out = { shape: p.shape, w: p.w, h: p.h };
  if (p.label) out.label = p.label;
  const pins = {};
  for (const side of BLOCK_SIDES) if (p.pins[side].length) pins[side] = p.pins[side].map((x) => (x.label ? { name: x.name, label: x.label } : x.name));
  if (Object.keys(pins).length) out.pins = pins;
  return out;
}

/** The pins of a side as text for one edit field: "A, B: $B_1$, Cin". Names and labels are split at the first colon. */
export function formatPins(list) {
  return (list ?? []).map((p) => {
    const x = typeof p === "string" ? { name: p } : p;
    return x.label ? `${x.name}: ${x.label}` : x.name;
  }).join(", ");
}

/** Text from formatPins back to a list. Commas inside {} or between $ signs belong to a label. Throws on a bad name. */
export function parsePins(text) {
  const parts = [];
  let depth = 0, math = false, cur = "";
  for (const ch of String(text ?? "")) {
    if (ch === "$") math = !math;
    else if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0 && !math) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((s) => s.trim()).filter(Boolean).map((s) => {
    const i = s.indexOf(":");
    const name = (i < 0 ? s : s.slice(0, i)).trim(), label = i < 0 ? "" : s.slice(i + 1).trim();
    return readPin(label ? { name, label } : { name }, `pin "${s}"`);
  });
}

// ---- geometry ----------------------------------------------------------------------------

/** The outline as {kind: "polygon", points} or {kind: "ellipse", rx, ry}, in grid steps y up, about the centre. */
function outlineOf(p) {
  const W = p.w, H = p.h;
  switch (p.shape) {
    case "rect": return { kind: "polygon", points: [[-W, H], [W, H], [W, -H], [-W, -H]] };
    case "chevron": return { kind: "polygon", points: [[-W, H], [W, H], [W, -H], [-W, -H], [-W + notchDepth(W), 0]] };
    case "triangle": return { kind: "polygon", points: [[-W, H], [W, 0], [-W, -H]] };
    default: return { kind: "ellipse", rx: W, ry: H };
  }
}

/** Where a ray from `from` along unit `dir` first meets the outline (t >= 0): {t, tangent} or null. */
function firstHit(outline, from, dir) {
  const eps = 1e-9;
  let best = null;
  const take = (t, tangent) => { if (t >= -eps && (!best || t < best.t)) best = { t: Math.max(t, 0), tangent }; };
  if (outline.kind === "polygon") {
    const pts = outline.points;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const s = [b[0] - a[0], b[1] - a[1]];
      const den = dir[0] * s[1] - dir[1] * s[0];
      if (Math.abs(den) < eps) continue;                       // parallel
      const q = [a[0] - from[0], a[1] - from[1]];
      const t = (q[0] * s[1] - q[1] * s[0]) / den;
      const u = (q[0] * dir[1] - q[1] * dir[0]) / den;
      if (u >= -eps && u <= 1 + eps) take(t, s);
    }
  } else {
    const { rx, ry } = outline;
    const A = (dir[0] / rx) ** 2 + (dir[1] / ry) ** 2;
    const B = 2 * (from[0] * dir[0] / rx ** 2 + from[1] * dir[1] / ry ** 2);
    const C = (from[0] / rx) ** 2 + (from[1] / ry) ** 2 - 1;
    const disc = B * B - 4 * A * C;
    if (disc >= -eps) {
      const r = Math.sqrt(Math.max(disc, 0));
      for (const t of [(-B - r) / (2 * A), (-B + r) / (2 * A)]) {
        const x = from[0] + t * dir[0], y = from[1] + t * dir[1];
        take(t, [-y * rx / ry, x * ry / rx]);                  // tangent of the ellipse at that point
      }
    }
  }
  return best;
}

/** Where the label in the middle of the block is centred, in grid steps. */
function centreOf(p) {
  if (p.shape === "chevron") return [notchDepth(p.w) / 2, 0];
  if (p.shape === "triangle") return [-p.w / 3, 0];
  return [0, 0];
}

/**
 * Everything about a block that does not depend on the theme: its size after the pin rule, outline, pins and
 * label anchors. Pins have the pack's own fields (tip, direction, lead) plus `side`, `label`, and where the label goes.
 */
export function blockGeometry(params) {
  const p = normalizeBlock(params);
  const outline = outlineOf(p);
  const pins = {};
  for (const side of BLOCK_SIDES) {
    const list = p.pins[side], n = list.length;
    list.forEach((pin, i) => {
      const off = (n - 1) - 2 * i;                              // one module (2 steps) apart, centred; left/right top to bottom
      const tip = side === "left" ? [-p.w, off] : side === "right" ? [p.w, off] : side === "top" ? [-off, p.h] : [-off, -p.h];
      const out = OUTWARD[side], into = [-out[0], -out[1]];
      const hit = firstHit(outline, tip, into);
      const length = hit ? hit.t : 0;
      const end = [tip[0] + into[0] * length, tip[1] + into[1] * length];
      pins[pin.name] = {
        tip, direction: DIRECTION_NAME[side], side, label: pin.label ?? null,
        lead: { from: end, length, tangent: hit?.tangent ?? null },
        labelAt: [end[0] + into[0] * LABEL_INSET, end[1] + into[1] * LABEL_INSET], labelDir: into,
      };
    });
  }
  return { params: p, outline, pins, centre: centreOf(p), bbox: { min: [-p.w, -p.h], max: [p.w, p.h] } };
}

const geometryCache = new WeakMap();
/** blockGeometry for an element's params, or null if they are not valid (lint says why). Cached per params object. */
export function geometryOf(params) {
  if (params && typeof params === "object") {
    if (geometryCache.has(params)) return geometryCache.get(params);
    let g = null;
    try { g = blockGeometry(params); } catch { g = null; }
    geometryCache.set(params, g);
    return g;
  }
  return null;
}

/** The block as a pack-style element definition: what pinOf, elementBox and the router read. Null if the params are invalid. */
export function blockDef(params) {
  const g = geometryOf(params);
  if (!g) return null;
  const { w, h, shape } = g.params;
  const pad = 0.15;                                             // modules of room for the line width
  return {
    type: BLOCK, description: `Block: ${shape}, ${w} by ${h} modules.`, mirrorable: true,
    svg: { viewBox: [-w / 2 - pad, -h / 2 - pad, w + 2 * pad, h + 2 * pad] },
    bbox: g.bbox,
    pins: Object.fromEntries(Object.entries(g.pins).map(([name, q]) => [name, { tip: q.tip, direction: q.direction, lead: q.lead }])),
    label: null, parameters: [], block: g,
  };
}

// ---- resize handles ---------------------------------------------------------------------------

/** The eight resize handles of a block, in its own frame (grid steps): where each sits and which edges it moves. */
export function handlesOf(params) {
  const g = geometryOf(params);
  if (!g) return [];
  const { w, h } = g.params;
  const xs = { w: -w, "": 0, e: w }, ys = { n: h, "": 0, s: -h };
  const out = [];
  for (const v of ["n", "", "s"]) for (const hz of ["w", "", "e"]) {
    if (!v && !hz) continue;
    out.push({ id: `${v}${hz}`, at: [xs[hz], ys[v]], x: hz, y: v });
  }
  return out;
}

// ---- drawing --------------------------------------------------------------------------------

const modules = (p) => toSvg(p);
const pathOf = (pts, close) => pts.map(([x, y], i) => `${i ? "L" : "M"} ${fmt(x)} ${fmt(y)}`).join(" ") + (close ? " Z" : "");

/** The outline path data, in modules y down. */
export function outlinePath(g) {
  if (g.outline.kind === "polygon") return pathOf(g.outline.points.map(modules), true);
  const rx = g.outline.rx / 2, ry = g.outline.ry / 2;
  return `M ${fmt(-rx)} 0 A ${fmt(rx)} ${fmt(ry)} 0 1 1 ${fmt(rx)} 0 A ${fmt(rx)} ${fmt(ry)} 0 1 1 ${fmt(-rx)} 0 Z`;
}

/**
 * The block drawn as nodes in the element's own frame (modules, y down), the same kind of nodes the pack's
 * symbols give. One closed path for the outline (so a corner or the chevron's notch is one round join, never
 * two butted lines), and one lead per pin that reaches into the outline far enough to leave no gap at a slant.
 * `body` colours the outline; `leads` maps pin name to a lead colour (default the theme's ink).
 */
export function blockNodes(params, pack, { body = null, leads = {} } = {}) {
  const g = geometryOf(params);
  if (!g) return [];
  const { roles, line } = pack.theme;
  const lw = line.width_module;
  const stroke = (colour) => [["fill", "none"], ["stroke", colour], ["stroke-width", fmt(lw)], ["stroke-linecap", line.cap], ["stroke-linejoin", line.join]];
  const nodes = [{ tag: "path", attrs: [["d", outlinePath(g)], ...stroke(body ?? roles.ink)], children: [] }];
  for (const [name, q] of Object.entries(g.pins)) {
    if (!(q.lead.length > 1e-9)) continue;                       // the tip is on the outline: no lead to draw
    const into = [-OUTWARD[q.side][0], -OUTWARD[q.side][1]];
    const s = q.lead.tangent, sl = s ? Math.hypot(s[0], s[1]) : 0;
    const cos = s ? Math.abs(into[0] * s[0] + into[1] * s[1]) / sl : 0, sin = s ? Math.abs(into[0] * s[1] - into[1] * s[0]) / sl : 1;
    // A slanted outline would leave a sliver beside a lead that stops on its centre line: run it on by half a line width over the slope.
    const run = sin > 1e-6 ? Math.min((lw / 2) * (cos / sin) + lw * 0.05, lw * 1.2) : 0;
    const end = modules([q.lead.from[0] + (into[0] * run * 2), q.lead.from[1] + (into[1] * run * 2)]);   // run is in modules; the frame is steps
    const node = { tag: "path", attrs: [["d", pathOf([modules(q.tip), end], false)], ...stroke(leads[name] ?? roles.ink)], children: [] };
    node.pin = name;
    nodes.push(node);
  }
  return nodes;
}
