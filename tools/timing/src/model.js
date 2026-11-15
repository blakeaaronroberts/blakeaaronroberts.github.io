// The timing diagram as data, and every edit the step editor makes. DOM-free.
//
// The source keeps WaveDrom's format ({signal: [{name, wave, data, delay}], config}), so files stay readable by
// WaveDrom, but nobody has to type it: the step editor sets one step at a time. A wave has one character per step:
// 0 1 x z (levels), = (a data value, labelled from `data`), p (a clock) and . (the step before continues).

export const empty = () => ({ signal: [], config: { steps: 8 } });

/** The value cycle a click steps through. */
export const CYCLE = ["0", "1", "x", "z", "="];
export const LABEL = { 0: "0", 1: "1", x: "X", z: "Z", "=": "=", p: "clk" };

const clone = (v) => structuredClone(v);
const lanes = (v) => (Array.isArray(v?.signal) ? v.signal : []);

/** The number of steps: the longest wave, or config.steps for a diagram with no waves yet. */
export function stepCount(v) {
  const n = Math.max(0, ...lanes(v).map((s) => (typeof s?.wave === "string" ? s.wave.length : 0)));
  return n || Math.max(1, Number(v?.config?.steps) || 8);
}

/** A signal's steps as the editor shows them: {value, held} per step (held: a "." continuing the step before). */
export function cellsOf(sig, n) {
  const out = [];
  let prev = "x";
  for (let i = 0; i < n; i++) {
    const c = sig.wave?.[i];
    if (c === undefined || c === "." || c === "|") out.push({ value: prev, held: true });
    else { prev = /[2-9]/.test(c) ? "=" : c; out.push({ value: prev, held: false }); }
  }
  return out;
}

const pad = (wave, n) => (wave.length >= n ? wave.slice(0, n) : wave + ".".repeat(n - wave.length));
const isClock = (sig) => /^[pPnN]/.test(sig?.wave ?? "");

/** Add a signal (a clock if `clock`): starts low, or as a clock, for every step. Names already present are skipped. */
export function addSignal(v, name, { clock = false } = {}) {
  const d = clone(v ?? empty()), n = stepCount(d);
  d.signal = lanes(d);
  if (d.signal.some((s) => s?.name === name)) return d;
  d.signal.push({ name, wave: clock ? pad("p", n) : pad("0", n) });
  return d;
}

export const removeSignal = (v, i) => { const d = clone(v); d.signal = lanes(d).filter((_, k) => k !== i); return d; };

export function moveSignal(v, i, by) {
  const d = clone(v), s = lanes(d), j = i + by;
  if (s[i] && j >= 0 && j < s.length) [s[i], s[j]] = [s[j], s[i]];
  return d;
}

/** Change the number of steps: every wave is padded with "." or cut. */
export function setSteps(v, n) {
  const d = clone(v), m = Math.max(1, Math.min(64, Math.round(n)));
  d.config = { ...(d.config ?? {}), steps: m };
  for (const s of lanes(d)) if (typeof s.wave === "string") s.wave = pad(s.wave, m);
  return d;
}

/** The index into `data` of the data value that step i shows (or starts), for a signal. */
function dataIndex(sig, i) {
  let k = -1;
  for (let j = 0; j <= i && j < sig.wave.length; j++) if (/[=2-9]/.test(sig.wave[j])) k++;
  return k;
}

/** Set one step of a signal to a value ("0" "1" "x" "z" "=", or "." to continue the step before). A clock becomes a plain signal. */
export function setCell(v, si, step, value, label) {
  const d = clone(v), sig = lanes(d)[si];
  if (!sig) return d;
  const n = stepCount(d);
  if (isClock(sig)) sig.wave = pad("0", n);
  const before = [...(sig.data ?? [])];
  const wasData = dataIndex(sig, step), startedData = /[=2-9]/.test(sig.wave[step] ?? "");
  const w = pad(sig.wave, n).split("");
  w[step] = value;
  sig.wave = w.join("");
  // Keep `data` in step with the "=" characters: insert or remove this step's label.
  if (startedData && value !== "=") before.splice(wasData, 1);
  if (value === "=" && !startedData) before.splice(dataIndex(sig, step), 0, label ?? "");
  else if (value === "=" && label !== undefined) before[dataIndex(sig, step)] = label;
  if (before.some((x) => x !== "")) sig.data = before; else delete sig.data;
  return d;
}

/** The next value in the click cycle after a step's current one (backwards with `back`). */
export function nextValue(current, back = false) {
  const i = CYCLE.indexOf(current);
  return CYCLE[(i + (back ? CYCLE.length - 1 : 1) + CYCLE.length) % CYCLE.length] ?? "0";
}

export function setClock(v, si, on) {
  const d = clone(v), sig = lanes(d)[si], n = stepCount(d);
  if (!sig) return d;
  sig.wave = on ? pad("p", n) : pad("0", n);
  delete sig.data;
  return d;
}

export function setDelay(v, si, delay) {
  const d = clone(v), sig = lanes(d)[si], x = Number(delay) || 0;
  if (!sig) return d;
  if (x) sig.delay = Math.round(x * 100) / 100; else delete sig.delay;
  return d;
}

/** The label of the data value at a step (or ""). */
export function dataAt(sig, step) {
  const k = dataIndex(sig, step);
  return k >= 0 ? (sig.data?.[k] ?? "") : "";
}

export { isClock };
