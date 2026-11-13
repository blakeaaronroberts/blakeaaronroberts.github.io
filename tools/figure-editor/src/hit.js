// What is under the pointer, in grid steps. No DOM.

import { elementBox, pinOf } from "./geometry.js";
import { allCorners } from "./doc.js";
import { nearestOnPolyline, snapOntoPolyline } from "./router.js";

const NEAR_POINT = 0.9;   // grid steps: how close counts as "on" a pin tip, junction or port
const NEAR_WIRE = 0.7;    // grid steps: how close counts as "on" a wire

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Things under p, most specific first:
 * pins, junctions and ports (wire targets), then wires, then element bodies.
 */
export function hitTest(doc, pack, p, corners = allCorners(doc, pack)) {
  const hits = [];
  for (const el of [...doc.elements].reverse()) {
    const def = pack.def(el.type);
    if (!def) continue;
    for (const name of Object.keys(def.pins)) {
      const { at } = pinOf(el, def, name);
      if (dist(at, p) <= NEAR_POINT) hits.push({ kind: "pin", ref: `${el.id}.${name}`, at, d: dist(at, p) });
    }
  }
  for (const j of doc.junctions) if (dist(j.at, p) <= NEAR_POINT) hits.push({ kind: "junction", id: j.id, at: j.at, d: dist(j.at, p) });
  for (const port of doc.ports) if (dist(port.at, p) <= NEAR_POINT) hits.push({ kind: "port", id: port.id, at: port.at, d: dist(port.at, p) });
  hits.sort((a, b) => a.d - b.d);
  const wires = [];
  for (const [id, c] of corners) {
    const n = nearestOnPolyline(p, c);
    if (n.d <= NEAR_WIRE) wires.push({ kind: "wire", id, at: snapOntoPolyline([Math.round(p[0]), Math.round(p[1])], c), d: n.d });
  }
  wires.sort((a, b) => a.d - b.d);
  const bodies = [];
  for (const el of [...doc.elements].reverse()) {
    const def = pack.def(el.type);
    if (!def) continue;
    const { min, max } = elementBox(el, def);
    if (p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1]) bodies.push({ kind: "element", id: el.id });
  }
  return [...hits, ...wires, ...bodies];
}

/** Elements and wires wholly inside a box (grid steps). */
export function inBox(doc, pack, box, corners = allCorners(doc, pack)) {
  const inside = ([x, y]) => x >= box.min[0] && x <= box.max[0] && y >= box.min[1] && y <= box.max[1];
  const elements = doc.elements.filter((el) => {
    const def = pack.def(el.type);
    if (!def) return false;
    const b = elementBox(el, def);
    return inside(b.min) && inside(b.max);
  }).map((el) => el.id);
  const wires = [...corners].filter(([, c]) => c.every(inside)).map(([id]) => id);
  return { elements, wires };
}
