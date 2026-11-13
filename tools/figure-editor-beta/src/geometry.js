// Units and element transforms. No DOM.
//
// The document (circuit schema v0.2) and the pack JSON use integer GRID STEPS (0.25 cm), y UP.
// The pack SVGs, the canvas and the export use MODULES (0.5 cm), y DOWN.
// toSvg / fromSvg below are the only place the two frames meet (proposal section 10.1).

export const STEPS_PER_MODULE = 2;   // checked against theme.json geometry.grid_steps_per_module at load
export const MODULE_CM = 0.5;        // checked against theme.json geometry.module_cm at load

const z = (v) => (v === 0 ? 0 : v);  // no negative zero in saved files

/** Grid steps (y up) to SVG modules (y down). */
export const toSvg = ([x, y]) => [z(x / STEPS_PER_MODULE), z(-y / STEPS_PER_MODULE)];
/** SVG modules (y down) to grid steps (y up). */
export const fromSvg = ([X, Y]) => [z(X * STEPS_PER_MODULE), z(-Y * STEPS_PER_MODULE)];

export const DIRECTIONS = { left: [-1, 0], right: [1, 0], up: [0, 1], down: [0, -1] };

/**
 * An element's own frame to the document frame, both in grid steps, y up.
 * Mirror first (x negated in the element's own coordinates), then rotate
 * counter-clockwise about the origin, then translate to `at`. (circuit-model
 * DECISIONS.md, "Meaning of mirror", confirmed by Blake 2026-11-12.)
 */
export function orient([x, y], rotation = 0, mirror = false) {
  if (mirror) x = -x;
  switch (rotation) {
    case 0: return [z(x), z(y)];
    case 90: return [z(-y), z(x)];
    case 180: return [z(-x), z(-y)];
    case 270: return [z(y), z(-x)];
    default: throw new Error(`rotation ${rotation}: use 0, 90, 180 or 270`);
  }
}

export function place(el, p) {
  const [x, y] = orient(p, el.rotation ?? 0, el.mirror ?? false);
  return [z(el.at[0] + x), z(el.at[1] + y)];
}

/** A pin's tip (grid steps) and outward direction vector, after the element's transform. */
export function pinOf(el, def, name) {
  const pin = def.pins[name];
  if (!pin) return null;
  return { at: place(el, pin.tip), dir: orient(DIRECTIONS[pin.direction], el.rotation ?? 0, el.mirror ?? false) };
}

/** SVG transform attribute that puts a pack SVG (modules, y down) where `el` is. */
export function svgTransform(el) {
  const [X, Y] = toSvg(el.at);
  let t = `translate(${fmt(X)} ${fmt(Y)})`;
  // y-up counter-clockwise rotation is a negative angle in the y-down frame.
  if (el.rotation) t += ` rotate(${-el.rotation})`;
  if (el.mirror) t += " scale(-1 1)";   // applied first: SVG transform lists act right to left
  return t;
}

/** Axis-aligned box {min, max} of points. */
export function boxOf(points) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}

/** The element's pack bbox (grid steps) in the document frame. */
export function elementBox(el, def) {
  const { min, max } = def.bbox;
  return boxOf([[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]].map((p) => place(el, p)));
}

/** The element's SVG viewBox (modules, y down) in the drawing frame, for export bounds. */
export function elementSvgBox(el, def) {
  const [vx, vy, vw, vh] = def.svg.viewBox;
  const corners = [[vx, vy], [vx + vw, vy], [vx + vw, vy + vh], [vx, vy + vh]].map((q) => toSvg(place(el, fromSvg(q))));
  return boxOf(corners);
}

/** Short decimal for SVG output: at most 5 places, no trailing zeros, no "-0". */
export function fmt(v) {
  const s = (Math.round(v * 1e5) / 1e5).toFixed(5).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}
