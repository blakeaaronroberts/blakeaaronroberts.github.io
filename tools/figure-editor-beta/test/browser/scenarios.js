// The browser scenarios. Each returns a list of [passed, message].

/**
 * What is really painted: a screenshot of the page, decoded in the page, with the pixels counted.
 * Pure black (every channel <= 8) cannot come from a dark-mode palette, so any such pixel is a black stroke or fill.
 * Reported by region: the canvas, and the palette tiles.
 */
const PIXELS = (b64) => `(async () => {
  const img = new Image(); img.src = "data:image/png;base64,${b64}"; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const area = (el) => { const r = el.getBoundingClientRect(); return { x0: Math.max(0, Math.floor(r.left)), y0: Math.max(0, Math.floor(r.top)), x1: Math.min(c.width, Math.ceil(r.right)), y1: Math.min(c.height, Math.ceil(r.bottom)) }; };
  const count = (a) => {
    const w = a.x1 - a.x0, h = a.y1 - a.y0; if (w <= 0 || h <= 0) return { black: 0, pixels: 0 };
    const d = x.getImageData(a.x0, a.y0, w, h).data; let black = 0, white = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] === 255 && d[i] <= 8 && d[i + 1] <= 8 && d[i + 2] <= 8) black++; if (d[i] >= 252 && d[i + 1] >= 252 && d[i + 2] >= 252) white++; }
    return { black, white, pixels: w * h };
  };
  const canvas = document.querySelector("svg.fe-canvas"), palette = document.querySelector(".fe-palette");
  return { canvas: count(area(canvas)), palette: count(area(palette)), page: count({ x0: 0, y0: 0, x1: c.width, y1: c.height }), size: [c.width, c.height] };
})()`;

/** The shapes in the scene (the drawing itself, not the palette's definitions), against the canvas colour. */
const SCENE = String.raw`(() => {
  const svg = document.querySelector("svg.fe-canvas");
  const rgb = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const [r, g, b] = m[1].split(",").map(Number); return { r, g, b }; };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const contrast = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const paper = rgb(getComputedStyle(svg.querySelector(".fe-paper")).fill);
  const out = { canvas: document.querySelector(".fe-mount").dataset.canvas, paper, strokes: 0, minStroke: 99, black: [], low: [] };
  for (const el of svg.querySelectorAll(".fe-scene path, .fe-scene circle")) {
    const cs = getComputedStyle(el), s = cs.stroke !== "none" ? rgb(cs.stroke) : null;
    if (!s || !(parseFloat(cs.strokeWidth) > 0)) continue;
    out.strokes++;
    const c = contrast(s, paper); if (!Number.isFinite(c)) { (out.bad ??= []).push(el.tagName + ":" + cs.stroke + " on " + JSON.stringify(paper) + " raw " + getComputedStyle(svg.querySelector(".fe-paper")).fill); continue; }
    out.minStroke = Math.min(out.minStroke, c);
    const tag = (el.closest("[data-el]")?.dataset.el ?? "wire") + ":" + cs.stroke;
    if (s.r < 64 && s.g < 64 && s.b < 64) out.black.push(tag);
    if (c < 3) out.low.push(tag);
  }
  return out;
})()`;

/** A figure holding every element type in the pack, so the check covers all of them. */
const ALL_ELEMENTS = `(async () => {
  const idx = await (await fetch("./symbol-pack/index.json")).json();
  const els = idx.elements.map((e, i) => ({ id: "e" + (i + 1), type: e.type, at: [(i % 6) * 14, Math.floor(i / 6) * 14] }));
  window.figureEditor.load(JSON.stringify({ schema: "circuit/0.2", id: "all_elements", grid_cm: 0.25, elements: els, nets: {} }));
  return els.length;
})()`;

const ready = "!!window.figureEditor";
let nextPort = 9400;

async function measure({ launch, url, out }, scheme) {
  const page = await launch({ scheme, port: nextPort++ });
  try {
    await page.goto(url + "?open=examples/full-adder-levels.json");
    await page.waitFor(ready);
    await page.sleep(1500);
    await page.shot(`${out}/beta-${scheme}-sample.png`);
    const sceneSample = await page.eval(SCENE);
    const pixelsSample = await page.eval(PIXELS(await page.shotData()));
    const n = await page.eval(ALL_ELEMENTS);
    await page.sleep(1500);
    await page.shot(`${out}/beta-${scheme}-all.png`);
    const sceneAll = await page.eval(SCENE);
    const pixelsAll = await page.eval(PIXELS(await page.shotData()));
    return { sceneSample, pixelsSample, sceneAll, pixelsAll, n, errors: page.errors };
  } finally { await page.close(); }
}

export const scenarios = {
  /** The whole editor follows the site's dark setting, with zero black strokes or fills (bodies and legs). */
  async dark(ctx) {
    const res = [];
    const dark = await measure(ctx, "dark");
    const light = await measure(ctx, "light");
    res.push([dark.sceneAll.canvas === "dark", `dark mode: the canvas follows the site (data-canvas=${dark.sceneAll.canvas})`]);
    res.push([light.sceneAll.canvas === "light", `light mode: the canvas stays light (data-canvas=${light.sceneAll.canvas})`]);
    // The detector must see black where black belongs, or "zero" proves nothing.
    res.push([light.pixelsAll.canvas.black > 500, `detector sanity: light canvas has ${light.pixelsAll.canvas.black} pure-black pixels (ink in light mode)`]);
    for (const [name, scene, px] of [["sample figure", dark.sceneSample, dark.pixelsSample], [`all ${dark.n} elements`, dark.sceneAll, dark.pixelsAll]]) {
      res.push([scene.strokes > 20 && !scene.bad, `dark ${name}: ${scene.strokes} stroked shapes measured${scene.bad ? ", unreadable colours: " + scene.bad.slice(0, 3).join(", ") : ""}`]);
      res.push([scene.black.length === 0, `dark ${name}: zero black strokes in the scene (found ${scene.black.length}: ${scene.black.slice(0, 4).join(", ")})`]);
      res.push([scene.low.length === 0, `dark ${name}: every stroke has at least 3:1 contrast with the canvas (min ${Number(scene.minStroke).toFixed(2)})`]);
      res.push([px.canvas.black === 0, `dark ${name}: zero pure-black pixels on the canvas (${px.canvas.black} of ${px.canvas.pixels})`]);
      res.push([px.palette.black === 0, `dark ${name}: zero pure-black pixels in the palette (${px.palette.black} of ${px.palette.pixels})`]);
      res.push([px.canvas.white === 0, `dark ${name}: zero pure-white pixels on the canvas (${px.canvas.white})`]);
    }
    res.push([dark.errors.length === 0, `dark: no page errors${dark.errors.length ? ": " + dark.errors[0] : ""}`]);
    return res;
  },
};

/** Flip the site's own light/dark toggle after the page has loaded, both ways, with the whole pack on the canvas. */
scenarios.toggle = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(ctx.url + "?open=examples/full-adder-levels.json");
    await page.waitFor(ready);
    await page.eval(ALL_ELEMENTS);
    await page.sleep(1200);
    const flip = () => page.eval(`(() => { const t = document.querySelector(".quarto-color-scheme-toggle"); if (!t) return false; t.click(); return true; })()`);
    const state = async (label) => {
      await page.sleep(1500);
      const scene = await page.eval(SCENE), px = await page.eval(PIXELS(await page.shotData()));
      return { label, scene, px };
    };
    const a = await state("light at load");
    res.push([a.scene.canvas === "light" && a.px.canvas.black > 500, `toggle: light at load (canvas ${a.scene.canvas}, ${a.px.canvas.black} black pixels)`]);
    res.push([await flip(), "toggle: the site's colour toggle exists on the page"]);
    const b = await state("dark after toggle");
    await page.shot(`${ctx.out}/beta-toggled-dark.png`);
    res.push([b.scene.canvas === "dark", `toggle: canvas follows to dark (data-canvas=${b.scene.canvas})`]);
    res.push([b.scene.black.length === 0 && b.px.canvas.black === 0 && b.px.palette.black === 0, `toggle: dark after the switch has zero black strokes (scene ${b.scene.black.length}, canvas pixels ${b.px.canvas.black}, palette pixels ${b.px.palette.black})`]);
    await flip();
    const c = await state("light after toggle back");
    res.push([c.scene.canvas === "light" && c.px.canvas.black > 500, `toggle: back to light (canvas ${c.scene.canvas}, ${c.px.canvas.black} black pixels)`]);
    res.push([page.errors.length === 0, `toggle: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

/** The dark colour list with contrast ratios against the dark canvas (ink and text 4.5:1, level colours and accents 3:1). */
scenarios.colours = async (ctx) => {
  const page = await ctx.launch({ scheme: "dark", port: nextPort++ });
  const res = [];
  try {
    await page.goto(ctx.url);
    await page.waitFor(ready);
    const rows = await page.eval(String.raw`(async () => {
      const theme = await (await fetch("./symbol-pack/theme.json")).json();
      const mount = document.querySelector(".fe-mount"), style = getComputedStyle(mount), cx = document.createElement("canvas").getContext("2d");
      const hex = (raw) => { cx.fillStyle = "#000"; cx.fillStyle = raw; return cx.fillStyle; };
      const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (h) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
      const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const bg = hex(style.getPropertyValue("--fig-dark-background").trim());
      const site = hex(style.getPropertyValue("--role-background").trim());
      return { bg, site, rows: Object.keys(theme.roles).map((name) => { const raw = style.getPropertyValue("--fig-dark-" + name).trim(); const h = raw ? hex(raw) : null; return { name, light: theme.roles[name], dark: h, ratio: h ? +ratio(h, bg).toFixed(2) : null }; }) };
    })()`);
    console.log(`canvas ${rows.bg} (site background ${rows.site})`);
    console.log("role        light    dark     contrast vs canvas");
    for (const r of rows.rows) console.log(`${r.name.padEnd(11)} ${r.light}  ${r.dark ?? "(none)"}  ${r.ratio ?? "-"}`);
    const need = { ink: 4.5, low: 4.5, high: 3, unknown: 3, floating: 3, flow: 3, accent: 3, highlight: 3, debug: 3, debug_bad: 3 };
    for (const r of rows.rows) if (need[r.name]) res.push([r.dark && r.ratio >= need[r.name], `${r.name}: ${r.dark} is ${r.ratio}:1 (needs ${need[r.name]}:1)`]);
  } finally { await page.close(); }
  return res;
};
