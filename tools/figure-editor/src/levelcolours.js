// Level colours chosen by the user (F17). No DOM.
//
// A figure may carry style.levels (circuit/0.2, schema model-v0.3.1): for each logic level "0", "1", "X", "Z" an optional
// light and an optional dark colour, #RRGGBB. An absent key, or an absent light or dark colour, means the theme's default.
// Defaults live in the theme files; nothing here holds a colour of its own except what the user picked. A choice is applied
// as an override of the theme role that colours that level, for whichever canvas (light or dark) is drawn or exported.

import { LEVELS } from "./pack.js";

export const HEX = /^#[0-9A-Fa-f]{6}$/;
const KEYS = LEVELS.map((l) => l.value);

/** The levels object as saved, repaired: only known levels, only light and dark, only #RRGGBB (upper-cased). */
export function cleanLevels(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of KEYS) {
    const v = raw[k];
    if (!v || typeof v !== "object") continue;
    const c = {};
    for (const mode of ["light", "dark"]) if (typeof v[mode] === "string" && HEX.test(v[mode])) c[mode] = v[mode].toUpperCase();
    if (Object.keys(c).length) out[k] = c;
  }
  return out;
}

/** The figure's chosen colours as theme-role overrides for the light or the dark canvas ({low, high, unknown, floating}). */
export function levelRoles(levels, dark) {
  const out = {};
  for (const l of LEVELS) { const c = levels?.[l.value]?.[dark ? "dark" : "light"]; if (c) out[l.role] = c; }
  return out;
}

/** The levels with one colour set (hex) or cleared (null). */
export function withLevelColour(levels, level, mode, hex) {
  const next = structuredClone(levels ?? {});
  if (hex === null) {
    if (next[level]) { delete next[level][mode]; if (!Object.keys(next[level]).length) delete next[level]; }
  } else next[level] = { ...(next[level] ?? {}), [mode]: hex.toUpperCase() };
  return cleanLevels(next);
}

// ---- contrast and colour-blind safety --------------------------------------------------------------------------

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => { const [r, g, b] = rgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/** WCAG contrast ratio of two #RRGGBB colours (1 to 21). */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Colour-vision-deficiency simulation (Machado et al. 2009, severity 1), applied in linear RGB.
const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const toLab = (hex) => {
  const [r, g, b] = rgb(hex).map(lin);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
const simulate = (hex, m) => {
  const v = rgb(hex).map(lin), out = m.map((row) => Math.min(1, Math.max(0, row[0] * v[0] + row[1] * v[1] + row[2] * v[2])));
  const enc = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  return `#${out.map((c) => Math.round(enc(c) * 255).toString(16).padStart(2, "0")).join("")}`;
};
/** CIE76 colour difference between two colours as a viewer with the given vision (or normal vision) sees them. */
export function difference(a, b, vision = null) {
  const [p, q] = vision ? [simulate(a, CVD[vision]), simulate(b, CVD[vision])] : [a, b];
  const [l1, a1, b1] = toLab(p), [l2, a2, b2] = toLab(q);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export const MIN_CONTRAST = 3;      // WCAG 2.1 for graphical objects
export const MIN_DIFFERENCE = 20;   // below this, two level colours are hard to tell apart

/**
 * Warnings for the colours in force on one canvas. `colours` is {level: hex} for every level that has a colour; `background` the
 * canvas colour. Contrast against the background, and any pair that is close for normal vision or for protan, deutan or tritan viewers.
 */
export function warnings(colours, background) {
  const out = [], names = Object.fromEntries(LEVELS.map((l) => [l.value, `${l.value} (${l.name})`]));
  const keys = KEYS.filter((k) => colours[k]);
  for (const k of keys) {
    const c = contrast(colours[k], background);
    if (c < MIN_CONTRAST) out.push(`Level ${names[k]} has contrast ${c.toFixed(1)}:1 with the background; at least ${MIN_CONTRAST}:1 is needed to see a line.`);
  }
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = colours[keys[i]], b = colours[keys[j]];
    if (difference(a, b) < MIN_DIFFERENCE) { out.push(`Levels ${names[keys[i]]} and ${names[keys[j]]} look alike.`); continue; }
    const hard = Object.keys(CVD).filter((v) => difference(a, b, v) < MIN_DIFFERENCE);
    if (hard.length) out.push(`Levels ${names[keys[i]]} and ${names[keys[j]]} are hard to tell apart with ${hard.join(", ")}.`);
  }
  return out;
}
