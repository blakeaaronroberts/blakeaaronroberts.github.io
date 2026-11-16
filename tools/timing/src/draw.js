// Our own timing-diagram drawing: WaveDrom's source format in, a vector SVG out. DOM-free.
//
// The size is a layout input, not a scale: the step width comes from the width and the lane height from the
// height, and every point is recomputed, so lines keep their weight and the shapes keep their slopes.
//
// WaveDrom features drawn:
// - wave characters: 0 1 (levels), h l (levels with sharp edges), u d (weak pull-up and pull-down, dashed),
//   z (high impedance), x (unknown, hatched), = and 2 (data), 3 to 9 (data in colours), p n (clocks), P N (clocks with
//   an arrow on the active edge), . (the step before continues), | (a gap mark; the step before continues);
// - per signal: name, wave, data (labels for the data steps), period, phase, node (letters that edges join);
//   and our own `delay` (a fine offset in steps) and `group` (a flat way to write a group);
// - groups (an array whose first item is the group's name) and spacers ({});
// - head and foot: text, tick (numbered step edges), tock (numbered step middles), every (number every Nth);
// - edge: arrows between nodes, straight (-), curved (~) or square (-| |- -|-), with < and > heads and a label;
// - config.hscale (step width in the natural size); our config.slant (how far an edge leans, in px; 0 is square, 5 is WaveDrom's).

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n2 = (v) => String(Math.round(v * 100) / 100);
const n4 = (v) => String(Math.round(v * 10000) / 10000);
const FONT = 12, FAMILY = "'STIX Two Text', 'Times New Roman', serif";
const GROUP_W = 18;

/** The lanes of a source, in order: groups flattened (each lane carries its group path), spacers kept. */
export function lanesOf(value) {
  const out = [];
  const lane = (x, path) => {
    const data = Array.isArray(x.data) ? x.data.map(String) : typeof x.data === "string" ? x.data.split(/\s+/).filter(Boolean) : [];
    const groups = typeof x.group === "string" && x.group.trim() ? [...path, x.group.trim()] : path;
    out.push({
      name: typeof x.name === "string" ? x.name : "", wave: typeof x.wave === "string" ? x.wave : "", data,
      phase: Number(x.phase) || 0, delay: Number(x.delay) || 0, period: Math.max(0.25, Number(x.period) || 1),
      node: typeof x.node === "string" ? x.node : "", groups, spacer: !x.name && !x.wave,
    });
  };
  const walk = (x, path) => {
    if (Array.isArray(x)) {
      const named = typeof x[0] === "string";
      const p = named ? [...path, x[0]] : path;
      for (const y of named ? x.slice(1) : x) walk(y, p);
    } else if (x && typeof x === "object") lane(x, path);
  };
  for (const x of Array.isArray(value?.signal) ? value.signal : []) walk(x, []);
  return out;
}

/** Each step's state: {c, isNew, gap}; "." and "|" repeat the character before ("|" also marks a gap). */
export function stepsOf(wave) {
  const out = []; let prev = null;
  for (const ch of wave) {
    if ((ch === "." || ch === "|") && prev) out.push({ c: prev, isNew: false, gap: ch === "|" });
    else { prev = ch === "." || ch === "|" ? "x" : ch; out.push({ c: prev, isNew: true, gap: false }); }
  }
  return out;
}

const LEVEL = { 0: "lo", l: "lo", d: "lo", 1: "hi", h: "hi", u: "hi", z: "mid" };
const SHARP = new Set(["h", "l"]), WEAK = new Set(["u", "d"]);
const BOX = /^[=2-9x]$/;
const isHexColour = (value) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
const groupDepth = (lanes) => Math.max(0, ...lanes.map((l) => l.groups.length));
const labelWidth = (lanes, fontSize = FONT, nameTypeset = null) => Math.ceil(Math.max(0, ...lanes.map((l) => {
  const parsed = nameTypeset?.get(l.name);
  return parsed?.ok ? parsed.width * fontSize : l.name.length * fontSize * 0.6;
}))) + 8 + groupDepth(lanes) * GROUP_W;
const stepCount = (lanes) => Math.max(1, ...lanes.map((l) => Math.ceil(l.wave.length * l.period)));
const textOf = (t) => (typeof t === "string" ? t : Array.isArray(t) ? t.filter((x) => typeof x === "string" || Array.isArray(x)).map(textOf).join(" ") : "");
const bandHeight = (b, fontSize = FONT) => (b && textOf(b.text) ? fontSize * 1.5 : 0) + (b && (b.tick !== undefined || b.tock !== undefined) ? fontSize * 14 / FONT : 0);

/** The size a source gets by default: 40 px a step (times hscale), 30 px a lane, plus the head and foot. */
export function naturalSize(value, hscale = Number(value?.config?.hscale) || 1, { fontSize = FONT, nameTypeset = null, showNames = true } = {}) {
  const lanes = lanesOf(value);
  const laneHeight = Math.max(30, fontSize * 2.5);
  const labelW = showNames ? labelWidth(lanes, fontSize, nameTypeset) : groupDepth(lanes) * GROUP_W;
  return { w: Math.round(labelW + 12 + stepCount(lanes) * 40 * hscale + 10), h: Math.max(1, lanes.length) * laneHeight + 10 + bandHeight(value?.head, fontSize) + bandHeight(value?.foot, fontSize) };
}

/** Parse one edge string: "a->b label". Returns {from, to, op, label} or null. */
export function parseEdge(s) {
  const m = /^\s*([^\s<>\-~|])([<>\-~|]+)([^\s<>\-~|])\s*(.*)$/.exec(String(s ?? ""));
  return m ? { from: m[1], op: m[2], to: m[3], label: m[4] } : null;
}

/**
 * The SVG for a source at width x height px. Options include ink, accent (the step marker), marker (a step index or null),
 * levelColour (lines coloured by level, like the schematic nets), dataFills (theme fills for data 3 to 9), levelFills
 * (theme backgrounds for X and Z), signalLineColour, edge-line and arrowhead styles, nameTypeset and edgeLabelTypeset
 * (outlined TeX), and paper (behind edge labels; none if not given).
 * A source's config.dataColours can override the seven data fills.
 * Returns {svg, natural, geometry: {x0, stepW, laneH, steps, top}}.
 */
export function drawTiming(value, { width, height, ink = "#000000", accent = "#0072B2", marker = null, levelColour = null, dataFills = [], levelFills = {}, signalLineColour = ink, paper = null, fontSize = FONT, lineWidth = 1.6, edgeLineWidth = lineWidth / 1.6, edgeLineColour = null, arrowHeadSize = 6, arrowHeadColour = null, nameTypeset = null, edgeLabelTypeset = nameTypeset, showNames = true } = {}) {
  const lanes = lanesOf(value);
  const nat = naturalSize(value, Number(value?.config?.hscale) || 1, { fontSize, nameTypeset, showNames });
  const W = Math.max(100, width ?? nat.w), H = Math.max(40, height ?? nat.h);
  const labelW = showNames ? labelWidth(lanes, fontSize, nameTypeset) : groupDepth(lanes) * GROUP_W, x0 = labelW + 12, gw = groupDepth(lanes) * GROUP_W;
  const steps = stepCount(lanes);
  const stepW = Math.max(4, (W - x0 - 10) / steps);
  const headH = bandHeight(value?.head, fontSize), footH = bandHeight(value?.foot, fontSize);
  const top0 = 5 + headH;
  const laneH = Math.max(12, (H - 10 - headH - footH) / Math.max(1, lanes.length));
  const cfgSlant = value?.config?.slant, slant = cfgSlant === undefined ? 5 : Math.min(12, Math.max(0, Number(cfgSlant) || 0));   // config.slant: 0 is square edges, 5 is WaveDrom's look
  const slope = Math.min(slant, stepW * 0.15), lw = lineWidth, small = fontSize * 10 / FONT;
  const edgeWidth = Math.max(0.25, Math.min(4, Number(value?.config?.edgeLineWidth) || Number(edgeLineWidth) || lw / 1.6));
  const edgeColour = isHexColour(value?.config?.edgeLineColour) ? value.config.edgeLineColour : edgeLineColour ?? ink;
  const headColour = isHexColour(value?.config?.arrowHeadColour) ? value.config.arrowHeadColour : arrowHeadColour ?? ink;
  const signalColour = isHexColour(signalLineColour) ? signalLineColour : ink;
  const headSize = Math.max(2, Math.min(16, Number(value?.config?.arrowHeadSize) || Number(arrowHeadSize) || 6));
  const stroke = `clip-path="url(#plot)" fill="none" stroke="${signalColour}" stroke-width="${n2(lw)}" stroke-linecap="round" stroke-linejoin="round"`;
  const out = [], nodes = new Map();
  const text = (x, y, s, anchor = "middle", size = fontSize, extra = "") => `<text x="${n2(x)}" y="${n2(y)}" text-anchor="${anchor}" font-size="${n2(size)}" font-family="${FAMILY}" fill="${ink}"${extra}>${esc(s)}</text>`;
  const mathText = (x, y, parsed, anchor = "end", size = fontSize, className = "td-name-math", ariaLabel = "typeset label") => {
    const width = parsed.width * size, left = anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x;
    const nodesSvg = (nodes) => nodes.map((node) => `<${node.tag}${node.attrs.map(([k, v]) => ` ${k}="${esc(v)}"`).join("")}>${nodesSvg(node.children)}</${node.tag}>`).join("");
    return `<g class="${className}" aria-label="${esc(ariaLabel)}" color="${ink}" transform="translate(${n2(left)} ${n2(y)}) scale(${n4(size / 1000)}) translate(${n2(-parsed.left * 1000)} 0)">${nodesSvg(parsed.nodes)}</g>`;
  };

  // Head and foot: text, then numbered step edges (tick) or step middles (tock), every Nth.
  const band = (b, yText, yNum) => {
    if (!b) return;
    if (textOf(b.text)) out.push(text(x0 + (steps * stepW) / 2, yText, textOf(b.text), "middle", fontSize, ' font-weight="bold"'));
    const every = Math.max(1, Number(b.every) || 1);
    const labels = (v, n) => (typeof v === "string" && /\s/.test(v.trim()) ? v.trim().split(/\s+/) : Array.from({ length: n }, (_, i) => String((Number(v) || 0) + i)));
    if (b.tick !== undefined) {
      const ls = labels(b.tick, steps + 1);
      for (let i = 0; i <= steps; i += every) {
        out.push(text(x0 + i * stepW, yNum, ls[i] ?? "", "middle", small));
        out.push(`<line x1="${n2(x0 + i * stepW)}" y1="${n2(top0)}" x2="${n2(x0 + i * stepW)}" y2="${n2(top0 + lanes.length * laneH)}" stroke="${ink}" stroke-opacity="0.18" stroke-width="${n2(lw * 0.5)}" stroke-dasharray="2 3"/>`);
      }
    }
    if (b.tock !== undefined) {
      const ls = labels(b.tock, steps);
      for (let i = 0; i < steps; i += every) out.push(text(x0 + (i + 0.5) * stepW, yNum, ls[i] ?? "", "middle", small));
    }
  };
  if (value?.head) band(value.head, 5 + fontSize * 13 / FONT, 5 + (textOf(value.head.text) ? fontSize * 18 / FONT : 0) + small);
  const lanesBottom = top0 + lanes.length * laneH;
  if (value?.foot) band(value.foot, lanesBottom + (value.foot.tick !== undefined || value.foot.tock !== undefined ? small * 1.4 : 0) + small * 1.4, lanesBottom + small * 1.1);

  // Group brackets, outermost at the left, with the group's name turned up the bracket.
  for (let depth = 0; depth < groupDepth(lanes); depth++) {
    let i = 0;
    while (i < lanes.length) {
      const key = lanes[i].groups.slice(0, depth + 1).join("\u0001");
      if (lanes[i].groups.length <= depth) { i++; continue; }
      let j = i;
      while (j + 1 < lanes.length && lanes[j + 1].groups.slice(0, depth + 1).join("\u0001") === key) j++;
      const x = 14 + depth * GROUP_W, y1 = top0 + i * laneH + 3, y2 = top0 + (j + 1) * laneH - 3;
      out.push(`<path d="M ${n2(x + 4)} ${n2(y1)} L ${n2(x)} ${n2(y1)} L ${n2(x)} ${n2(y2)} L ${n2(x + 4)} ${n2(y2)}" fill="none" stroke="${ink}" stroke-width="${n2(lw / 1.6)}"/>`);
      out.push(text(x - 5, (y1 + y2) / 2, lanes[i].groups[depth], "middle", small, ` transform="rotate(-90 ${n2(x - 5)} ${n2((y1 + y2) / 2)})"`));
      i = j + 1;
    }
  }

  lanes.forEach((lane, li) => {
    const top = top0 + li * laneH, yh = top + laneH * 0.17, yl = top + laneH * 0.83, ym = (yh + yl) / 2;
    const yOf = { hi: yh, lo: yl, mid: ym };
    if (showNames && lane.name) {
      const parsed = nameTypeset?.get(lane.name);
      out.push(parsed?.ok ? mathText(labelW, ym + fontSize * 0.35, parsed) : text(labelW, ym + fontSize * 0.35, lane.name, "end"));
    }
    if (lane.spacer) return;
    const st = stepsOf(lane.wave), w = stepW * lane.period;
    const xAt = (i) => x0 + (i - lane.phase + lane.delay) * w;   // phase shifts left, delay (fine, in steps) shifts right
    for (let i = 0; i < lane.node.length; i++) {
      const ch = lane.node[i];
      if (ch !== "." && ch !== " " && !nodes.has(ch)) nodes.set(ch, [xAt(i) + (st[i]?.isNew && i > 0 ? slope / 2 : 0), ym]);
    }
    const d = [];
    let level = null, run = null, di = 0, prevBox = false;
    let cur = null, dashed = false, last = [0, 0];   // the colour and dash of the path being built
    const line = (x, y) => { last = [x, y]; d.push(`${d.length ? "L" : "M"} ${n2(x)} ${n2(y)}`); };
    const endPath = () => {
      if (d.length) out.push(`<path d="${d.join(" ")}" ${cur ? stroke.replace(`stroke="${signalColour}"`, `stroke="${cur}"`) : stroke}${dashed ? ` stroke-dasharray="${n2(lw * 2)} ${n2(lw * 2)}"` : ""}/>`);
      d.length = 0;
    };
    const paint = (k, weak = false) => {   // start a new path when the colour (levelColour option) or the dash (u, d) changes
      const c = levelColour && k ? levelColour({ lo: "0", hi: "1", mid: "Z" }[k]) ?? null : null;
      if (c === cur && weak === dashed) return;
      const p = last, had = d.length;
      endPath(); cur = c; dashed = weak;
      if (had) line(p[0], p[1]);
    };
    const flush = () => {
      if (!run) return;
      const xl = Math.max(x0, xAt(run.from)), xr = xAt(run.to), hatch = run.c === "x";
      const pts = [[xl, ym], [xl + slope, yh], [xr - slope, yh], [xr, ym], [xr - slope, yl], [xl + slope, yl]];
      const colourIndex = /[3-9]/.test(run.c) ? +run.c - 3 : -1;
      const colour = colourIndex >= 0
        ? (isHexColour(value?.config?.dataColours?.[colourIndex]) ? value.config.dataColours[colourIndex] : dataFills[colourIndex])
        : null;
      const shape = `M ${pts.map((p) => `${n2(p[0])} ${n2(p[1])}`).join(" L ")} Z`;
      if (hatch && isHexColour(levelFills.unknown)) {
        out.push(`<path clip-path="url(#plot)" d="${shape}" fill="${levelFills.unknown}" fill-opacity="0.35"/>`);
        out.push(`<path clip-path="url(#plot)" d="${shape}" fill="url(#hatch)" stroke="${signalColour}" stroke-width="${lw}" stroke-linejoin="round"/>`);
      } else {
        out.push(`<path clip-path="url(#plot)" d="${shape}" fill="${hatch ? "url(#hatch)" : colour ?? signalColour}" fill-opacity="${hatch ? 1 : colour ? 0.35 : 0.08}" stroke="${signalColour}" stroke-width="${lw}" stroke-linejoin="round"/>`);
      }
      if (!hatch && run.label) out.push(text((xl + xr) / 2, ym + fontSize * 0.35, run.label));
      run = null;
    };
    const gapMark = (x) => out.push(`<path clip-path="url(#plot)" d="M ${n2(x - 3)} ${n2(yl + 2)} L ${n2(x + 1)} ${n2(yh - 2)} M ${n2(x + 1)} ${n2(yl + 2)} L ${n2(x + 5)} ${n2(yh - 2)}" fill="none" stroke="${ink}" stroke-width="${n2(lw / 1.6)}"/>`);
    const arrow = (x, y, up) => out.push(`<path clip-path="url(#plot)" d="M ${n2(x - 3.5)} ${n2(y + (up ? 4 : -4))} L ${n2(x)} ${n2(y)} L ${n2(x + 3.5)} ${n2(y + (up ? 4 : -4))} Z" fill="${ink}"/>`);
    if (lane.delay > 0 && st.length) {   // before a delayed lane changes, it holds its first level
      const c0 = st[0].c, k0 = /^[pPnN]$/.test(c0) ? (c0 === "p" || c0 === "P" ? "lo" : "hi") : LEVEL[c0];
      if (k0) { paint(k0, WEAK.has(c0)); line(x0, yOf[k0]); level = k0; }
    }
    for (let i = 0; i < st.length; i++) {
      const { c, isNew, gap } = st[i], xl = xAt(i), xr = xAt(i + 1);
      if (gap) gapMark(xl);
      if (xr <= x0) continue;
      const wasBox = prevBox; prevBox = BOX.test(c);
      const a = Math.max(xl, x0);
      if (c === "z" && isHexColour(levelFills.floating)) {
        const x1 = Math.max(xl, x0), mid = (yh + yl) / 2, zSlope = Math.min(slope, (xr - x1) / 4);
        const pts = [[x1, mid], [x1 + zSlope, yh], [xr - zSlope, yh], [xr, mid], [xr - zSlope, yl], [x1 + zSlope, yl]];
        out.push(`<path clip-path="url(#plot)" d="M ${pts.map((p) => `${n2(p[0])} ${n2(p[1])}`).join(" L ")} Z" fill="${levelFills.floating}" fill-opacity="0.35"/>`);
      }
      if (/^[pPnN]$/.test(c)) {
        flush();
        paint(null);
        const hi = c === "p" || c === "P", y1 = hi ? yh : yl, y2 = hi ? yl : yh, mid = (xl + xr) / 2;
        line(xl, level ? yOf[level] : y2); line(xl + slope, y1); line(mid, y1); line(mid + slope, y2); line(xr, y2);
        if (c === "P") arrow(xl + slope / 2, ym, true);
        if (c === "N") arrow(xl + slope / 2, ym, false);
        level = hi ? "lo" : "hi";
      } else if (LEVEL[c]) {
        flush();
        const k = LEVEL[c], y = yOf[k], s = SHARP.has(c) ? 0 : WEAK.has(c) ? slope * 2 : slope;
        if (isNew && level && yOf[level] !== y) { paint(level, dashed); line(xl, yOf[level]); paint(k, WEAK.has(c)); line(xl + s, y); }
        else { paint(k, WEAK.has(c)); if (isNew || !d.length) line(wasBox ? a - slope : a, y); }
        line(xr, y); level = k;
      } else if (BOX.test(c)) {
        if (isNew || !run) {
          flush();
          if (level && d.length) { line(xl + (level === "mid" ? 0 : slope), yOf[level]); endPath(); }
          cur = null; dashed = false;
          run = { from: i, to: i + 1, c, label: c === "x" ? "" : lane.data[di++] ?? "" };
        } else run.to = i + 1;
        level = null;
      } else level = null;
    }
    flush();
    endPath();
  });

  // Edges between nodes: straight, curved or square, with heads and a label.
  const head = (p, q) => {   // an arrowhead at p, pointing away from q
    const dx = p[0] - q[0], dy = p[1] - q[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, s = headSize;
    return `<path d="M ${n2(p[0])} ${n2(p[1])} L ${n2(p[0] - ux * s - uy * s * 0.45)} ${n2(p[1] - uy * s + ux * s * 0.45)} L ${n2(p[0] - ux * s + uy * s * 0.45)} ${n2(p[1] - uy * s - ux * s * 0.45)} Z" fill="${headColour}"/>`;
  };
  for (const raw of Array.isArray(value?.edge) ? value.edge : []) {
    const e = parseEdge(raw), a = e && nodes.get(e.from), b = e && nodes.get(e.to);
    if (!a || !b) continue;
    const op = e.op.replace(/[<>]/g, "");
    let dpath, mid, aDir = b, bDir = a;
    if (op.includes("~")) {
      const dx = Math.max(20, Math.abs(b[0] - a[0]) * 0.5);
      const c1 = [a[0] + dx, a[1]], c2 = [b[0] - dx, b[1]];
      dpath = `M ${n2(a[0])} ${n2(a[1])} C ${n2(c1[0])} ${n2(c1[1])} ${n2(c2[0])} ${n2(c2[1])} ${n2(b[0])} ${n2(b[1])}`;
      mid = [(a[0] + 3 * c1[0] + 3 * c2[0] + b[0]) / 8, (a[1] + 3 * c1[1] + 3 * c2[1] + b[1]) / 8];
      aDir = c1; bDir = c2;
    } else if (op === "-|-") {
      const mx = (a[0] + b[0]) / 2;
      dpath = `M ${n2(a[0])} ${n2(a[1])} L ${n2(mx)} ${n2(a[1])} L ${n2(mx)} ${n2(b[1])} L ${n2(b[0])} ${n2(b[1])}`;
      mid = [mx, (a[1] + b[1]) / 2]; aDir = [mx, a[1]]; bDir = [mx, b[1]];
    } else if (op === "-|") {
      dpath = `M ${n2(a[0])} ${n2(a[1])} L ${n2(b[0])} ${n2(a[1])} L ${n2(b[0])} ${n2(b[1])}`;
      mid = [b[0], (a[1] + b[1]) / 2]; aDir = [b[0], a[1]]; bDir = [b[0], a[1]];
    } else if (op === "|-") {
      dpath = `M ${n2(a[0])} ${n2(a[1])} L ${n2(a[0])} ${n2(b[1])} L ${n2(b[0])} ${n2(b[1])}`;
      mid = [a[0], (a[1] + b[1]) / 2]; aDir = [a[0], b[1]]; bDir = [a[0], b[1]];
    } else {
      dpath = `M ${n2(a[0])} ${n2(a[1])} L ${n2(b[0])} ${n2(b[1])}`;
      mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }
    out.push(`<path d="${dpath}" fill="none" stroke="${edgeColour}" stroke-width="${n2(edgeWidth)}"/>`);
    if (e.op.endsWith(">")) out.push(head(b, bDir));
    if (e.op.startsWith("<")) out.push(head(a, aDir));
    if (e.label) {   // on a small patch of the paper colour, so it reads over the lines
      const parsed = edgeLabelTypeset?.get(e.label);
      const tw = (parsed?.ok ? parsed.width * small : e.label.length * small * 0.55) + 4;
      if (paper) out.push(`<rect x="${n2(mid[0] - tw / 2)}" y="${n2(mid[1] - 4 - small)}" width="${n2(tw)}" height="${n2(small + 3)}" fill="${paper}"/>`);
      out.push(parsed?.ok
        ? mathText(mid[0], mid[1] - 4, parsed, "middle", small, "td-edge-label-math", e.label)
        : text(mid[0], mid[1] - 4, e.label, "middle", small));
    }
  }

  if (marker !== null && marker >= 0 && marker < steps) {
    out.push(`<rect class="td-marker" x="${n2(x0 + marker * stepW)}" y="2" width="${n2(stepW)}" height="${n2(H - 4)}" rx="6" ry="6" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-width="${n2(lw * 0.75)}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(W)}" height="${n2(H)}" viewBox="0 0 ${n2(W)} ${n2(H)}">` +
    `<defs><clipPath id="plot"><rect x="${n2(x0 - 2)}" y="0" width="${n2(W - x0 - 8)}" height="${n2(H)}"/></clipPath><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${signalColour}" stroke-width="${n2(lw / 1.6)}"/></pattern></defs>` +
    out.join("") + `</svg>`;
  return { svg, natural: nat, geometry: { x0, stepW, laneH, steps, top: top0, groupWidth: gw } };
}
