// Our own timing-diagram drawing: WaveDrom's source format in, a vector SVG out. DOM-free.
//
// The size is a layout input, not a scale: the step width comes from the width and the lane height from the
// height, and every point is recomputed, so lines keep their weight and the shapes keep their slopes.
// Wave characters: 0 1 l h d u (levels), z (high-Z, mid line), x (unknown, hatched), = 2-9 (data boxes, labelled
// from `data`), p P n N (clocks), . and | (the previous state continues).

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n2 = (v) => String(Math.round(v * 100) / 100);
const FONT = 12, FAMILY = "'STIX Two Text', 'Times New Roman', serif";

/** The lanes of a source: [{name, wave, data, phase, period}], groups flattened. */
export function lanesOf(value) {
  const out = [];
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach((y) => { if (typeof y !== "string") walk(y); });
    else if (x && typeof x === "object") {
      const data = Array.isArray(x.data) ? x.data.map(String) : typeof x.data === "string" ? x.data.split(/\s+/).filter(Boolean) : [];
      out.push({ name: typeof x.name === "string" ? x.name : "", wave: typeof x.wave === "string" ? x.wave : "", data, phase: Number(x.phase) || 0, delay: Number(x.delay) || 0, period: Math.max(1, Number(x.period) || 1) });
    }
  };
  walk(value?.signal ?? []);
  return out;
}

/** Each step's state: {c, isNew}; "." and "|" repeat the previous character. */
export function stepsOf(wave) {
  const out = []; let prev = null;
  for (const ch of wave) {
    if ((ch === "." || ch === "|") && prev) out.push({ c: prev, isNew: false });
    else { prev = ch === "." || ch === "|" ? "x" : ch; out.push({ c: prev, isNew: true }); }
  }
  return out;
}

const LEVEL = { 0: "lo", l: "lo", d: "lo", 1: "hi", h: "hi", u: "hi", z: "mid" };
const BOX = /^[=2-9x]$/;
const labelWidth = (lanes) => Math.ceil(Math.max(0, ...lanes.map((l) => l.name.length)) * FONT * 0.6) + 8;
const stepCount = (lanes) => Math.max(1, ...lanes.map((l) => Math.ceil(l.wave.length * l.period)));

/** The size a source gets by default: 40 px a step (times hscale), 30 px a lane. */
export function naturalSize(value, hscale = Number(value?.config?.hscale) || 1) {
  const lanes = lanesOf(value);
  return { w: Math.round(labelWidth(lanes) + 12 + stepCount(lanes) * 40 * hscale + 10), h: Math.max(1, lanes.length) * 30 + 10 };
}

/**
 * The SVG for a source at width x height px. Options: ink, accent (the step marker), marker (a step index or null).
 * Returns {svg, natural, geometry: {x0, stepW, laneH, steps}}.
 */
export function drawTiming(value, { width, height, ink = "#000000", accent = "#0072B2", marker = null } = {}) {
  const lanes = lanesOf(value);
  const nat = naturalSize(value);
  const W = Math.max(100, width ?? nat.w), H = Math.max(40, height ?? nat.h);
  const labelW = labelWidth(lanes), x0 = labelW + 12;
  const steps = stepCount(lanes);
  const stepW = Math.max(4, (W - x0 - 10) / steps);
  const laneH = Math.max(12, (H - 10) / Math.max(1, lanes.length));
  const slope = Math.min(5, stepW * 0.15), lw = 1.6;
  const stroke = `clip-path="url(#plot)" fill="none" stroke="${ink}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"`;
  const out = [];
  lanes.forEach((lane, li) => {
    const top = 5 + li * laneH, yh = top + laneH * 0.17, yl = top + laneH * 0.83, ym = (yh + yl) / 2;
    const yOf = { hi: yh, lo: yl, mid: ym };
    if (lane.name) out.push(`<text x="${n2(labelW)}" y="${n2(ym + FONT * 0.35)}" text-anchor="end" font-size="${FONT}" font-family="${FAMILY}" fill="${ink}">${esc(lane.name)}</text>`);
    const st = stepsOf(lane.wave), w = stepW * lane.period;
    const xAt = (i) => x0 + (i - lane.phase + lane.delay) * w;   // delay (in steps, may be fractional) shifts the lane right
    const d = [];
    let level = null, run = null, di = 0, prevBox = false;
    const line = (x, y) => d.push(`${d.length ? "L" : "M"} ${n2(x)} ${n2(y)}`);
    const endPath = () => { if (d.length) out.push(`<path d="${d.join(" ")}" ${stroke}/>`); d.length = 0; };
    const flush = () => {
      if (!run) return;
      const xl = Math.max(x0, xAt(run.from)), xr = xAt(run.to), hatch = run.c === "x";
      const pts = [[xl, ym], [xl + slope, yh], [xr - slope, yh], [xr, ym], [xr - slope, yl], [xl + slope, yl]];
      out.push(`<path clip-path="url(#plot)" d="M ${pts.map((p) => `${n2(p[0])} ${n2(p[1])}`).join(" L ")} Z" fill="${hatch ? "url(#hatch)" : ink}" fill-opacity="${hatch ? 1 : 0.08}" stroke="${ink}" stroke-width="${lw}" stroke-linejoin="round"/>`);
      if (!hatch && run.label) out.push(`<text x="${n2((xl + xr) / 2)}" y="${n2(ym + FONT * 0.35)}" text-anchor="middle" font-size="${FONT}" font-family="${FAMILY}" fill="${ink}">${esc(run.label)}</text>`);
      run = null;
    };
    if (lane.delay > 0 && st.length) {   // before a delayed lane changes, it holds its first level
      const c0 = st[0].c, k0 = /^[pPnN]$/.test(c0) ? (c0 === "p" || c0 === "P" ? "lo" : "hi") : LEVEL[c0];
      if (k0) { line(x0, yOf[k0]); level = k0; }
    }
    for (let i = 0; i < st.length; i++) {
      const { c, isNew } = st[i], xl = xAt(i), xr = xAt(i + 1);
      if (xr <= x0) continue;
      const wasBox = prevBox; prevBox = BOX.test(c);
      const a = Math.max(xl, x0);
      if (/^[pPnN]$/.test(c)) {
        flush();
        const hi = c === "p" || c === "P", y1 = hi ? yh : yl, y2 = hi ? yl : yh, mid = (xl + xr) / 2;
        line(xl, level ? yOf[level] : y2); line(xl + slope, y1); line(mid, y1); line(mid + slope, y2); line(xr, y2);
        level = hi ? "lo" : "hi";
      } else if (LEVEL[c]) {
        flush();
        const k = LEVEL[c], y = yOf[k];
        if (isNew || !d.length) { if (level && yOf[level] !== y) { line(xl, yOf[level]); line(xl + slope, y); } else line(wasBox ? a - slope : a, y); }
        line(xr, y); level = k;
      } else if (BOX.test(c)) {
        if (isNew || !run) {
          flush();
          if (level && d.length) { line(xl + (level === "mid" ? 0 : slope), yOf[level]); endPath(); }
          run = { from: i, to: i + 1, c, label: c === "x" ? "" : lane.data[di++] ?? "" };
        } else run.to = i + 1;
        level = null;
      } else level = null;
    }
    flush();
    endPath();
  });
  if (marker !== null && marker >= 0 && marker < steps) {
    out.push(`<rect class="td-marker" x="${n2(x0 + marker * stepW)}" y="2" width="${n2(stepW)}" height="${n2(H - 4)}" rx="6" ry="6" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-width="1.2"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(W)}" height="${n2(H)}" viewBox="0 0 ${n2(W)} ${n2(H)}">` +
    `<defs><clipPath id="plot"><rect x="${n2(x0 - 2)}" y="0" width="${n2(W - x0 - 8)}" height="${n2(H)}"/></clipPath><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${ink}" stroke-width="1"/></pattern></defs>` +
    out.join("") + `</svg>`;
  return { svg, natural: nat, geometry: { x0, stepW, laneH, steps } };
}
