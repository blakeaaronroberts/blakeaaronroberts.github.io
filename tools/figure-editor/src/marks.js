// Wire marks: arrowheads and bus slashes (circuit-schema C5). No DOM.
//
// Everything is sized from the theme's line width, so the marks follow the line weight and the editor
// carries no size of its own. Points are in SVG modules (y down) unless a name says grid steps.
//
// Arrowhead: a filled, sharp triangle with no stroke of its own, so its tip is exactly the point it
// points at (a stroked miter would overshoot the tip). The wire's line is shortened to end inside the head,
// where the head is wider than the line, so no square line end pokes past the tip and no seam shows at
// the head's base.
//
// Bus mark: a short slash across the wire, with the label beside its upper end.

import { fromSvg, toSvg } from "./geometry.js";

/** Proportions, in line widths. A 0.077-module line gives a head 0.7 module long and 0.46 wide. */
export const HEAD_LENGTH = 9, HEAD_HALF_WIDTH = 3, SLASH_HALF = 4, SLASH_LEAN = 2.4;
/** How far the line runs into the head, as a fraction of the head's length (it ends where the head is wide). */
const RUN_INTO_HEAD = 0.8;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);

/** Which ends carry a head: {start, end} from the schema's "none", "start", "end" or "both". */
export const headsOf = (arrow) => ({ start: arrow === "start" || arrow === "both", end: arrow === "end" || arrow === "both" });

/** One head at `tip`, on a line arriving from `from`: {tip, a, b} (the base corners) and the point the line should end at. */
function head(tip, from, headLen, lw) {
  const v = sub(tip, from), seg = len(v);
  const L = Math.min(headLen, seg), u = [v[0] / seg, v[1] / seg], n = [-u[1], u[0]];
  const half = HEAD_HALF_WIDTH * lw * (L / (HEAD_LENGTH * lw));
  const base = [tip[0] - u[0] * L, tip[1] - u[1] * L];
  return {
    head: { tip: [...tip], a: [base[0] + n[0] * half, base[1] + n[1] * half], b: [base[0] - n[0] * half, base[1] - n[1] * half] },
    lineEnd: [tip[0] - u[0] * L * RUN_INTO_HEAD, tip[1] - u[1] * L * RUN_INTO_HEAD],
  };
}

/**
 * The wire's polyline (modules) with its line shortened at each arrowhead, and the heads: {points, heads}.
 * A head is never longer than its last run, and two heads on one run share it.
 */
export function withArrows(points, arrow, lw) {
  const want = headsOf(arrow);
  if (points.length < 2 || (!want.start && !want.end)) return { points, heads: [] };
  const out = points.map((p) => [...p]), heads = [];
  const n = out.length;
  const headLen = HEAD_LENGTH * lw;
  const shared = n === 2 && want.start && want.end;                  // both heads on one run: each gets at most half of it
  const cap = shared ? len(sub(points[1], points[0])) / 2 : Infinity;
  if (want.end) {
    const h = head(points[n - 1], points[n - 2], Math.min(headLen, cap), lw);
    heads.push(h.head); out[n - 1] = h.lineEnd;
  }
  if (want.start) {
    const h = head(points[0], points[1], Math.min(headLen, cap), lw);
    heads.push(h.head); out[0] = h.lineEnd;
  }
  return { points: out, heads };
}

/** Where a wire's middle mark (a bus slash or a level tag) goes: the middle of its longest run, with its label above (horizontal) or to its right (vertical). Grid steps, y up. */
export function tagAnchor(corners) {
  let best = { len: -1, a: corners[0], b: corners[0] };
  for (let i = 0; i + 1 < corners.length; i++) {
    const l = Math.abs(corners[i + 1][0] - corners[i][0]) + Math.abs(corners[i + 1][1] - corners[i][1]);
    if (l > best.len) best = { len: l, a: corners[i], b: corners[i + 1] };
  }
  const horizontal = best.a[1] === best.b[1];
  return { at: [(best.a[0] + best.b[0]) / 2, (best.a[1] + best.b[1]) / 2], dir: horizontal ? [0, 1] : [1, 0] };
}

/**
 * The bus mark of a wire: a slash through the middle of its longest run ("/" leaning right, whichever way the run goes),
 * and where its label sits: just past the slash's upper end, above a horizontal run or to the right of a vertical one.
 * Returns {slash: [p, q] in modules, label: {at, dir} in grid steps y up}.
 */
export function busMark(corners, lw) {
  const { at, dir } = tagAnchor(corners);
  const [mx, my] = toSvg(at);
  const p = [mx - SLASH_LEAN * lw, my + SLASH_HALF * lw], q = [mx + SLASH_LEAN * lw, my - SLASH_HALF * lw];
  return { slash: [p, q], label: { at: fromSvg(q), dir } };
}
