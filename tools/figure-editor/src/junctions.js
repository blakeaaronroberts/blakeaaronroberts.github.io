// Junction dots and line-end joints, as the toolbox draws them. No DOM.
//
// Dots (toolbox wire.py, Junction): a tap counts 2 (the tapped wire continues on both
// sides) and each wire that ends on the junction adds 1. The dot is drawn at
// theme.json junction.min_wires (4) or more, so a T-junction (3) has none. Wires that
// merely cross share no junction, so they are not connected and get no dot.
//
// Joints (toolbox circuit.py, Circuit._line_end): lines have flat ends. Where two line
// ends meet at an angle, a round joint one line width across fills the notch; where
// they meet in a straight line, a smaller patch only covers the hairline seam.

import { pinOf } from "./geometry.js";
import { isPoint } from "./doc.js";

/** Straight joints: dot diameter as a fraction of the line width (toolbox wire.py Joint.SEAM_PATCH). */
export const SEAM_PATCH = 0.6;

/** Wires meeting at each junction: 2 for the tap plus one per wire end on it. */
export function junctionCounts(doc) {
  const counts = new Map(doc.junctions.map((j) => [j.id, 2]));
  for (const w of doc.wires) {
    for (const end of [w.from, w.to]) if (!isPoint(end) && counts.has(end)) counts.set(end, counts.get(end) + 1);
  }
  return counts;
}

export function dots(doc, pack) {
  const min = pack.theme.junction.min_wires;
  const counts = junctionCounts(doc);
  return doc.junctions.filter((j) => counts.get(j.id) >= min).map((j) => ({ id: j.id, at: j.at, wires: counts.get(j.id) }));
}

const unit = (v) => { const n = Math.hypot(v[0], v[1]); return [v[0] / n, v[1] / n]; };

/** Every line end: pin leads (pointing into the lead) and both ends of every wire (pointing into the wire). */
export function lineEnds(doc, pack, corners) {
  const ends = [];
  for (const el of doc.elements) {
    const def = pack.def(el.type);
    if (!def) continue;
    for (const name of Object.keys(def.pins)) {
      const { at, dir } = pinOf(el, def, name);
      ends.push({ at, into: [-dir[0], -dir[1]], owner: `${el.id}.${name}` });
    }
  }
  for (const [id, c] of corners) {
    if (c.length < 2) continue;
    const n = c.length;
    ends.push({ at: c[0], into: unit([c[1][0] - c[0][0], c[1][1] - c[0][1]]), owner: id });
    ends.push({ at: c[n - 1], into: unit([c[n - 2][0] - c[n - 1][0], c[n - 2][1] - c[n - 1][1]]), owner: id });
  }
  return ends;
}

/**
 * Joints where two or more line ends meet: {at, straight}. Ends that all point the same
 * way (the same line twice) need nothing. If every end lies on one axis the joint is a
 * straight seam patch; otherwise it is a full round joint.
 */
export function joints(doc, pack, corners) {
  const byPoint = new Map();
  for (const e of lineEnds(doc, pack, corners)) {
    const k = `${e.at[0]},${e.at[1]}`;
    if (!byPoint.has(k)) byPoint.set(k, []);
    byPoint.get(k).push(e);
  }
  const out = [];
  for (const ends of byPoint.values()) {
    if (ends.length < 2) continue;
    const d0 = ends[0].into;
    const dot = (e) => e.into[0] * d0[0] + e.into[1] * d0[1];
    if (ends.every((e) => dot(e) > 0.99)) continue;
    out.push({ at: ends[0].at, straight: ends.every((e) => Math.abs(dot(e)) > 0.99) });
  }
  return out;
}
