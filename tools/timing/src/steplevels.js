// A signal's level in each step of the diagram, as drawn: for the editor's frames and for calculating timing. No DOM.
//
// Steps are the diagram's unit steps. A lane's characters are `period` steps wide, and the drawing shifts it left by
// `phase` and right by `delay`, both in units of its period (draw.js). A pulse character (p, P, n, N) is high for the
// first half of its width and low for the second (n and N: low, then high).
// - Period 1, no shift: each step is one character; a pulse step is level 1 (n, N: 0) and flagged as a pulse.
// - A whole-number period, and a shift of a whole number of steps: each step still has one level (a pulse character
//   then spans an even number of steps: high steps, then low steps).
// - Otherwise a level changes inside a step. Those steps are X and `exact` is false: a frame holds one level per step.

const LEVEL = { 0: "0", l: "0", d: "0", n: "0", N: "0", 1: "1", h: "1", u: "1", p: "1", P: "1", x: "X", z: "Z" };
const isPulse = (c) => /^[pPnN]$/.test(c);
const near = (x) => Math.abs(x - Math.round(x)) < 1e-9;

/** `steps` is stepsOf(lane.wave): [{ c }, ...]. Returns { levels, pulses, exact }, one entry per step. */
export function stepLevels(steps, period = 1, phase = 0, delay = 0) {
  const n = Math.ceil(steps.length * period - 1e-9);
  const shift = (phase - delay) * period;   // steps the drawing is shifted left
  const evenPulses = !steps.some((s) => isPulse(s.c)) || period === 1 || (near(period) && Math.round(period) % 2 === 0);
  const exact = near(period) && near(shift) && evenPulses;
  const level = (s) => LEVEL[s?.c] ?? null;
  if (!exact) {
    // As before R1.4: the levels a step covers, X where they differ; no shift.
    const levels = Array.from({ length: n }, (_, i) => {
      const start = Math.floor(i / period), end = Math.min(steps.length, Math.ceil((i + 1) / period));
      const values = [...new Set(steps.slice(start, end).map(level))];
      return values.length === 1 ? values[0] : "X";
    });
    return { levels, pulses: levels.map(() => false), exact };
  }
  const p = Math.round(period), s = Math.round(shift);
  const levels = [], pulses = [];
  for (let j = 0; j < n; j++) {
    const u = Math.max(0, j + s);   // before a delayed lane changes, it holds its first level
    if (u >= n) { levels.push(null); pulses.push(false); continue; }
    const step = steps[Math.floor(u / p)], c = step?.c;
    if (isPulse(c) && p > 1) {
      const first = (u % p) < p / 2, high = /[pP]/.test(c) ? first : !first;
      levels.push(high ? "1" : "0"); pulses.push(false);
    } else { levels.push(level(step)); pulses.push(p === 1 && isPulse(c)); }
  }
  return { levels, pulses, exact };
}
