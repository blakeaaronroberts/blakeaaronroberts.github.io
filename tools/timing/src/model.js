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
    if (c === undefined || c === "." || c === "|") out.push({ value: prev, held: true, gap: c === "|" });
    else { prev = c === "2" ? "=" : c; out.push({ value: prev, held: false }); }
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

/** Set one step of a signal to any wave character (see WAVE), or "." to continue the step before. */
export function setCell(v, si, step, value, label) {
  const d = clone(v), sig = lanes(d)[si];
  if (!sig) return d;
  const n = stepCount(d);
  const before = [...(sig.data ?? [])];
  const wasData = dataIndex(sig, step), startedData = /[=2-9]/.test(sig.wave[step] ?? "");
  const w = pad(sig.wave, n).split("");
  w[step] = value;
  sig.wave = w.join("");
  // Keep `data` in step with the "=" characters: insert or remove this step's label.
  const isData = /^[=2-9]$/.test(value);
  if (startedData && !isData) before.splice(wasData, 1);
  if (isData && !startedData) before.splice(dataIndex(sig, step), 0, label ?? "");
  else if (isData && label !== undefined) before[dataIndex(sig, step)] = label;
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

/** Every wave character the editor offers, with what it means (WaveDrom's set). */
export const WAVE = [
  ["0", "low"], ["1", "high"], ["x", "unknown"], ["z", "high impedance"],
  ["h", "high, sharp edges"], ["l", "low, sharp edges"], ["u", "weak pull-up"], ["d", "weak pull-down"],
  ["=", "data"], ["3", "data, colour 3"], ["4", "data, colour 4"], ["5", "data, colour 5"], ["6", "data, colour 6"], ["7", "data, colour 7"], ["8", "data, colour 8"], ["9", "data, colour 9"],
  ["p", "clock, rising first"], ["n", "clock, falling first"], ["P", "clock with rising-edge arrow"], ["N", "clock with falling-edge arrow"],
  ["|", "gap (the step before continues)"], [".", "hold (the step before continues)"],
];
Object.assign(LABEL, { h: "H", l: "L", u: "U", d: "D", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", n: "nclk", P: "clk↑", N: "clk↓", "|": "‖" });

/** Set a signal's period, phase, group or delay (empty or zero removes it). */
export function setProp(v, si, key, val) {
  const d = clone(v), sig = lanes(d)[si];
  if (!sig || !["period", "phase", "group", "delay"].includes(key)) return d;
  if (key === "group") { const g = String(val ?? "").trim().slice(0, 40); if (g) sig.group = g; else delete sig.group; return d; }
  const x = Math.round((Number(val) || 0) * 100) / 100;
  if (key === "period" ? x > 0 && x !== 1 : x !== 0) sig[key] = key === "period" ? Math.max(0.25, x) : x; else delete sig[key];
  return d;
}

/** Put a node letter on a step of a signal (null removes it). Edges join nodes by letter. */
export function setNode(v, si, step, letter) {
  const d = clone(v), sig = lanes(d)[si];
  if (!sig) return d;
  const n = Math.max(stepCount(d), step + 1), node = (sig.node ?? "").padEnd(n, ".").split("");
  node[step] = letter ?? ".";
  const s = node.join("").replace(/\.+$/, "");
  if (s) sig.node = s; else delete sig.node;
  return d;
}

/** Every node letter in use, in order. */
export const nodeLetters = (v) => lanes(v).flatMap((s) => [...(s.node ?? "")].filter((c) => c !== "." && c !== " "));

/** The first letter not yet used as a node (a to z, then A to Z). */
export function nextLetter(v) {
  const used = new Set(nodeLetters(v));
  return [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"].find((c) => !used.has(c)) ?? null;
}

/** Edge shapes WaveDrom draws: straight, curved, square, with heads at either end. */
export const EDGE_OPS = [["->", "straight, arrow"], ["<->", "straight, both"], ["-", "straight, no head"], ["~>", "curve, arrow"], ["<~>", "curve, both"], ["~", "curve, no head"], ["-|>", "square (across, then up or down)"], ["|->", "square (up or down, then across)"], ["-|->", "square (across, up or down, across)"]];
const OP_DRAW = { "->": "->", "<->": "<->", "-": "-", "~>": "~>", "<~>": "<~>", "~": "~", "-|>": "-|>", "|->": "|->", "-|->": "-|->" };

export const edgesOf = (v) => (Array.isArray(v?.edge) ? v.edge : []).map((s) => {
  const m = /^\s*([^\s<>\-~|])([<>\-~|]+)([^\s<>\-~|])\s*(.*)$/.exec(String(s));
  return m ? { from: m[1], op: m[2], to: m[3], label: m[4] } : { from: "", op: "->", to: "", label: "" };
});
const edgeText = (e) => `${e.from}${OP_DRAW[e.op] ?? e.op}${e.to}${e.label ? ` ${e.label}` : ""}`;

export function addEdge(v, e) { const d = clone(v); d.edge = [...(d.edge ?? []), edgeText(e)]; return d; }
export function setEdge(v, i, patch) { const d = clone(v), es = edgesOf(d); if (!es[i]) return d; es[i] = { ...es[i], ...patch }; d.edge = es.map(edgeText); return d; }
export function removeEdge(v, i) { const d = clone(v); d.edge = (d.edge ?? []).filter((_, k) => k !== i); if (!d.edge.length) delete d.edge; return d; }

/** Add an empty lane (a spacer). */
export function addSpacer(v) { const d = clone(v ?? empty()); d.signal = [...lanes(d), {}]; return d; }

/** Set the head or the foot: text, tick (the first step-edge number, or blank for none), tock (yes or no), every. */
export function setBand(v, which, patch) {
  const d = clone(v), b = { ...(d[which] ?? {}), ...patch };
  if (!b.text) delete b.text;
  if (b.tick === "" || b.tick === null || b.tick === undefined) delete b.tick; else b.tick = Number(b.tick) || 0;
  if (b.tock === true) b.tock = 0; else if (b.tock === false || b.tock === undefined) delete b.tock;
  if (!(Number(b.every) > 1)) delete b.every; else b.every = Math.round(Number(b.every));
  if (Object.keys(b).length) d[which] = b; else delete d[which];
  return d;
}

export function setHscale(v, x) {
  const d = clone(v), k = Math.round((Number(x) || 1) * 100) / 100;
  d.config = { ...(d.config ?? {}) };
  if (k > 0 && k !== 1) d.config.hscale = Math.min(8, k); else delete d.config.hscale;
  return d;
}

export const textSizeOf = (v) => Math.min(24, Math.max(8, Number(v?.config?.fontSize) || 12));
export function setTextSize(v, x) {
  const d = clone(v), k = Math.round(Math.max(8, Math.min(24, Number(x) || 12)));
  d.config = { ...(d.config ?? {}) };
  if (k === 12) delete d.config.fontSize; else d.config.fontSize = k;
  return d;
}

export const lineWidthOf = (v) => Math.min(4, Math.max(0.5, Number(v?.config?.lineWidth) || 1.6));
export function setLineWidth(v, x) {
  const d = clone(v), k = Math.round(Math.max(0.5, Math.min(4, Number(x) || 1.6)) * 10) / 10;
  d.config = { ...(d.config ?? {}) };
  if (k === 1.6) delete d.config.lineWidth; else d.config.lineWidth = k;
  return d;
}

const isHexColour = (value) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
const setColour = (v, key, colour) => {
  const d = clone(v);
  d.config = { ...(d.config ?? {}) };
  if (isHexColour(colour)) d.config[key] = colour.toUpperCase(); else delete d.config[key];
  if (!Object.keys(d.config).length) delete d.config;
  return d;
};
export const signalLineColourOf = (v, fallback) =>
  isHexColour(v?.config?.signalLineColour) ? v.config.signalLineColour : fallback;
export const setSignalLineColour = (v, colour) => setColour(v, "signalLineColour", colour);
/** The seven user-overridable fills for WaveDrom's data values 3 through 9. */
export const dataColoursOf = (v, defaults = []) => Array.from({ length: 7 }, (_, i) =>
  isHexColour(v?.config?.dataColours?.[i]) ? v.config.dataColours[i] : defaults[i] ?? null);
export function setDataColour(v, index, colour) {
  const d = clone(v);
  if (!Number.isInteger(index) || index < 0 || index > 6) return d;
  const colours = [...(d.config?.dataColours ?? [])];
  if (isHexColour(colour)) colours[index] = colour.toUpperCase(); else delete colours[index];
  if (colours.some(isHexColour)) d.config = { ...(d.config ?? {}), dataColours: colours };
  else if (d.config) { delete d.config.dataColours; }
  return d;
}
export const edgeLineWidthOf = (v, lineWidth = lineWidthOf(v)) => {
  const width = Number(v?.config?.edgeLineWidth);
  return Number.isFinite(width) ? Math.min(4, Math.max(0.25, width)) : lineWidth / 1.6;
};
export function setEdgeLineWidth(v, x) {
  const d = clone(v), k = Math.round(Math.max(0.25, Math.min(4, Number(x) || 1)) * 100) / 100;
  d.config = { ...(d.config ?? {}) };
  const defaultWidth = Math.round((lineWidthOf(v) / 1.6) * 100) / 100;
  if (k === defaultWidth) delete d.config.edgeLineWidth; else d.config.edgeLineWidth = k;
  return d;
}
export const arrowHeadSizeOf = (v) => Math.min(16, Math.max(2, Number(v?.config?.arrowHeadSize) || 6));
export function setArrowHeadSize(v, x) {
  const d = clone(v), k = Math.round(Math.max(2, Math.min(16, Number(x) || 6)) * 10) / 10;
  d.config = { ...(d.config ?? {}) };
  if (k === 6) delete d.config.arrowHeadSize; else d.config.arrowHeadSize = k;
  return d;
}
export const edgeLineColourOf = (v, fallback) =>
  isHexColour(v?.config?.edgeLineColour) ? v.config.edgeLineColour : fallback;
export const arrowHeadColourOf = (v, fallback) =>
  isHexColour(v?.config?.arrowHeadColour) ? v.config.arrowHeadColour : fallback;
export const setEdgeLineColour = (v, colour) => setColour(v, "edgeLineColour", colour);
export const setArrowHeadColour = (v, colour) => setColour(v, "arrowHeadColour", colour);
export function resetTimingColours(v) {
  const d = clone(v);
  if (d.config) {
    delete d.config.dataColours;
    delete d.config.signalLineColour;
    delete d.config.edgeLineColour;
    delete d.config.arrowHeadColour;
    if (!Object.keys(d.config).length) delete d.config;
  }
  return d;
}

export const showNamesOf = (v) => v?.config?.showNames !== false;
export function setShowNames(v, show) {
  const d = clone(v);
  d.config = { ...(d.config ?? {}) };
  if (show) delete d.config.showNames; else d.config.showNames = false;
  return d;
}

/** The diagram as WaveDrom writes it: signals with the same `group` side by side become a named group array. */
export function toWaveDrom(v) {
  const out = [];
  for (const s of lanes(v)) {
    const { group, ...rest } = s;
    const lastItem = out[out.length - 1];
    if (group && Array.isArray(lastItem) && lastItem[0] === group) lastItem.push(rest);
    else out.push(group ? [group, rest] : rest);
  }
  const w = { ...clone(v), signal: out };
  return w;
}

/** A WaveDrom source made flat for the editor: a signal inside a named group array gets that group's name as `group`. */
export function fromWaveDrom(v) {
  const flat = [];
  const walk = (x, path) => {
    if (Array.isArray(x)) {
      const named = typeof x[0] === "string";
      for (const y of named ? x.slice(1) : x) walk(y, named ? [...path, x[0]] : path);
    } else if (x && typeof x === "object") flat.push(path.length && !x.group ? { ...x, group: path.join(" / ") } : { ...x });
  };
  for (const x of lanes(v)) walk(x, []);
  return { ...clone(v), signal: flat };
}

/** How far an edge leans, in px: 0 draws square, vertical edges; 5 is WaveDrom's slanted look (the default). */
export function setSlant(v, x) {
  const d = clone(v), k = Math.round(Math.max(0, Math.min(12, Number(x) || 0)) * 10) / 10;
  d.config = { ...(d.config ?? {}) };
  if (x === "" || x === null || k === 5) delete d.config.slant; else d.config.slant = k;
  return d;
}
export const slantOf = (v) => (v?.config?.slant === undefined ? 5 : Number(v.config.slant) || 0);
