// Orthogonal wire routing. A line-for-line port of route() in the toolbox's
// manimations/toolbox/wire.py, in integer grid steps. No DOM.
//
// A wire LEAVES a pin along the pin's direction and ARRIVES at a pin along that
// pin's axis. Between stops it uses one corner (L), or, when both ends are
// horizontal (or both vertical), a Z whose middle leg sits on the grid halfway.
// test/router.test.js checks this port against fixtures made by the Python route().

const axisOf = (d) => (d == null ? null : Math.abs(d[0]) >= Math.abs(d[1]) ? "h" : "v");

/** Python's round(): halves go to the even neighbour (the toolbox's style.snap). */
export function roundHalfEven(v) {
  const f = Math.floor(v), r = v - f;
  if (r > 0.5) return f + 1;
  if (r < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

function leg(p, q, axisOut, axisIn) {
  if (p[0] === q[0] || p[1] === q[1]) return [q];
  axisOut = axisOut || (axisIn === "h" ? "v" : "h");
  if (axisIn == null || axisIn !== axisOut) {                 // L: one corner
    return [axisOut === "h" ? [q[0], p[1]] : [p[0], q[1]], q];
  }
  if (axisOut === "h") {                                       // Z: h, v, h
    const mx = roundHalfEven((p[0] + q[0]) / 2);
    return [[mx, p[1]], [mx, q[1]], q];
  }
  const my = roundHalfEven((p[1] + q[1]) / 2);                 // Z: v, h, v
  return [[p[0], my], [q[0], my], q];
}

const cross = (u, v) => u[0] * v[1] - u[1] * v[0];

function simplify(pts) {
  const out = [pts[0]];
  for (const p of pts.slice(1)) {
    const last = out[out.length - 1];
    if (p[0] === last[0] && p[1] === last[1]) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      if (cross([last[0] - a[0], last[1] - a[1]], [p[0] - last[0], p[1] - last[1]]) === 0) {
        out[out.length - 1] = p;                               // collinear: drop the middle point
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/**
 * Corners of a wire from `start` to `end`, each {at: [x, y], dir: [dx, dy] | null}
 * (dir is a pin's outward direction; null for ports, junctions and free ends).
 */
export function route(start, end, via = [], first = null) {
  const stops = [...via.map((v) => [v[0], v[1]]), [end.at[0], end.at[1]]];
  const pts = [[start.at[0], start.at[1]]];
  let axisOut = first || axisOf(start.dir);
  stops.forEach((q, i) => {
    const axisIn = i === stops.length - 1 ? axisOf(end.dir) : null;
    pts.push(...leg(pts[pts.length - 1], q, axisOut, axisIn));
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    axisOut = b[1] - a[1] === 0 ? "v" : "h";                   // turn at each waypoint
  });
  return simplify(pts);
}

/** The toolbox's direction_problems(): wires that pass through their own pins' elements. */
export function directionProblems(corners, start, end) {
  if (corners.length < 2) return [];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
  const [c0, c1] = corners, [cm, cn] = corners.slice(-2);
  const problems = [];
  if (start.dir && dot([c1[0] - c0[0], c1[1] - c0[1]], start.dir) < 0) problems.push("leaves its start pin backwards, through the element");
  if (end.dir && dot([cn[0] - cm[0], cn[1] - cm[1]], end.dir) > 0) problems.push("enters its end pin from behind, through the element");
  return problems;
}

/** Is p on the axis-aligned segment a-b (ends included)? */
export function onSegment(p, a, b) {
  if (cross([b[0] - a[0], b[1] - a[1]], [p[0] - a[0], p[1] - a[1]]) !== 0) return false;
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) &&
         Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}

export function onPolyline(p, corners) {
  for (let i = 0; i + 1 < corners.length; i++) if (onSegment(p, corners[i], corners[i + 1])) return true;
  return false;
}

/** Nearest point on the polyline to p, and its distance. Not rounded. */
export function nearestOnPolyline(p, corners) {
  let best = { at: corners[0], d: Infinity, segment: 0 };
  for (let i = 0; i + 1 < corners.length; i++) {
    const [a, b] = [corners[i], corners[i + 1]];
    const q = [Math.min(Math.max(p[0], Math.min(a[0], b[0])), Math.max(a[0], b[0])),
               Math.min(Math.max(p[1], Math.min(a[1], b[1])), Math.max(a[1], b[1]))];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.d) best = { at: q, d, segment: i };
  }
  return best;
}

/** Nearest integer grid point that lies on the polyline (corners are integers, segments axis-aligned). */
export function snapOntoPolyline(p, corners) {
  const { at, segment } = nearestOnPolyline(p, corners);
  const [a, b] = [corners[segment], corners[segment + 1] ?? corners[segment]];
  return a[0] === b[0] ? [a[0], Math.round(at[1])] : [Math.round(at[0]), a[1]];
}
