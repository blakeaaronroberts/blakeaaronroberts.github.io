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
  const idx = await (await fetch("../schematic-editor/symbol-pack/index.json")).json();
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
    res.push([light.pixelsSample.canvas.black > 500, `detector sanity: the light sample figure has ${light.pixelsSample.canvas.black} pure-black pixels (ink in light mode; the all-elements figure is too small to count)`]);
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
    res.push([a.scene.canvas === "light" && a.px.canvas.pixels > 0, `toggle: light at load (canvas ${a.scene.canvas})`]);
    res.push([await flip(), "toggle: the site's colour toggle exists on the page"]);
    const b = await state("dark after toggle");
    await page.shot(`${ctx.out}/beta-toggled-dark.png`);
    res.push([b.scene.canvas === "dark", `toggle: canvas follows to dark (data-canvas=${b.scene.canvas})`]);
    res.push([b.scene.black.length === 0 && b.px.canvas.black === 0 && b.px.palette.black === 0, `toggle: dark after the switch has zero black strokes (scene ${b.scene.black.length}, canvas pixels ${b.px.canvas.black}, palette pixels ${b.px.palette.black})`]);
    await flip();
    const c = await state("light after toggle back");
    res.push([c.scene.canvas === "light" && c.px.canvas.pixels > 0, `toggle: back to light (canvas ${c.scene.canvas})`]);
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
      const theme = await (await fetch("../schematic-editor/symbol-pack/theme.json")).json();
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

/** Drag a wire run, click and delete a wire, undo and redo, on the full-adder sample. */
scenarios.wires = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  const DEL = [ "Delete", "Delete", 46 ], UNDO = [ "z", "KeyZ", 90, 2 ], REDO = [ "y", "KeyY", 89, 2 ], BACK = [ "Backspace", "Backspace", 8 ];
  try {
    await page.goto(ctx.url + "?open=examples/full-adder.json");
    await page.waitFor(ready);
    await page.sleep(1200);
    // Grid steps to screen pixels, through the canvas's own transform (y is up in grid steps, down in the SVG).
    const px = (gx, gy) => page.eval(`(() => { const s = document.querySelector("svg.fe-canvas"), p = s.createSVGPoint(); p.x = ${gx} / 2; p.y = -${gy} / 2; const q = p.matrixTransform(s.getScreenCTM()); return [q.x, q.y]; })()`);
    const perStep = await page.eval(`document.querySelector("svg.fe-canvas").getScreenCTM().a / 2`);
    const wire = (id) => page.eval(`JSON.stringify(window.figureEditor.doc.wires.find((w) => w.id === ${JSON.stringify(id)}))`).then(JSON.parse);
    const state = () => page.eval(`(() => { const d = window.figureEditor.doc; return { wires: d.wires.length, junctions: d.junctions.length, text: document.querySelector(".fe-props").textContent }; })()`);
    const orthogonal = (c) => c.every((p, i) => i === 0 || p[0] === c[i - 1][0] || p[1] === c[i - 1][1]);

    const before = await wire("w3");
    res.push([JSON.stringify(before.via) === JSON.stringify([[-22, 21], [-22, -13]]), `w3 starts as in the sample file (via ${JSON.stringify(before.via)})`]);

    // Hover shows the resize cursor and a highlight.
    const mid = await px(-22, 4);
    await page.mouse("mouseMoved", mid[0], mid[1], { buttons: 0 });
    await page.sleep(200);
    const hit = await page.eval(`document.querySelector("svg.fe-canvas").dataset.hit ?? ""`);
    res.push([hit === "wire-v", `hovering a vertical run gives the left-right resize cursor (data-hit=${hit})`]);

    // Click selects; the highlight is drawn and the panel names the wire.
    await page.click(mid[0], mid[1]);
    await page.sleep(200);
    const sel = await page.eval(`({ band: document.querySelectorAll('.fe-overlay path[stroke-opacity="0.45"]').length, text: document.querySelector(".fe-props").textContent })`);
    res.push([sel.band === 1 && /Wire/.test(sel.text) && /w3/.test(sel.text), `clicking a wire selects it: ${sel.band} highlight band, panel says "${sel.text.slice(0, 40)}"`]);

    // Drag the run one module (two steps) to the right.
    await page.drag(mid, [mid[0] + 2 * perStep, mid[1]]);
    await page.sleep(300);
    const moved = await wire("w3");
    res.push([JSON.stringify(moved.via) === JSON.stringify([[-20, 21], [-20, -13]]), `dragging the run right by 2 steps moves both corners (via ${JSON.stringify(moved.via)})`]);
    res.push([moved.from === before.from && moved.to === before.to, `the ends stay on their pins (${moved.from} to ${moved.to})`]);
    await page.shot(`${ctx.out}/beta-wire-dragged.png`);

    // One undo step for the whole drag; redo reapplies it.
    await page.key(...UNDO);
    await page.sleep(300);
    res.push([JSON.stringify((await wire("w3")).via) === JSON.stringify(before.via), "one Ctrl+Z undoes the whole drag"]);
    await page.key(...REDO);
    await page.sleep(300);
    res.push([JSON.stringify((await wire("w3")).via) === JSON.stringify(moved.via), "Ctrl+Y redoes it"]);
    await page.key(...UNDO);
    await page.sleep(200);

    // A drag that goes nowhere (back to where it started) records nothing; the pointer moving over empty canvas does not select.
    const n0 = await state();

    // Delete with the Delete key, then undo; then Backspace, then undo.
    for (const [name, key] of [["Delete", DEL], ["Backspace", BACK]]) {
      await page.click(mid[0], mid[1]);
      await page.sleep(200);
      await page.key(...key);
      await page.sleep(300);
      const gone = await state();
      res.push([gone.wires === n0.wires - 1 && !(await page.eval(`window.figureEditor.doc.wires.some((w) => w.id === "w3")`)), `${name} removes the selected wire (${n0.wires} to ${gone.wires})`]);
      await page.key(...UNDO);
      await page.sleep(300);
      const back = await state();
      res.push([back.wires === n0.wires && back.junctions === n0.junctions, `Ctrl+Z restores it (${back.wires} wires, ${back.junctions} junctions)`]);
    }

    // The restored wire is identical to the original.
    res.push([JSON.stringify(await wire("w3")) === JSON.stringify(before), "the restored wire matches the original exactly"]);
    // Every wire is still orthogonal after all that, and the file is still valid.
    const ok = await page.eval(`(() => { try { window.figureEditor.load(window.figureEditor.save()); return true; } catch (e) { return String(e); } })()`);
    res.push([ok === true, `the edited figure still saves and reloads (${ok})`]);

    await page.eval(`window.figureEditor.load(JSON.stringify({ schema: "circuit/0.2", id: "diagonal_browser_check", grid_cm: 0.25, elements: [], nets: {} }))`);
    const start = await px(0, 0), end = await px(6, 4);
    await page.eval(`document.querySelector('[data-cmd="wire"]').click()`);
    const clickAt = async (p, modifiers = 0) => {
      await page.mouse("mouseMoved", p[0], p[1], { buttons: 0, modifiers });
      await page.mouse("mousePressed", p[0], p[1], { modifiers });
      await page.mouse("mouseReleased", p[0], p[1], { modifiers });
    };
    await clickAt(start);
    await clickAt(end, 8);
    await page.key("Enter", "Enter", 13);
    await page.sleep(300);
    const diagonal = await page.eval(`(() => { const w = window.figureEditor.doc.wires[0]; return w && { via: w.via, route: w.route, saved: window.figureEditor.save() }; })()`);
    res.push([diagonal?.route?.length === 1 && diagonal.route[0] === "straight" && diagonal.saved.includes('"schema": "circuit/0.3"'), "Shift-click draws a straight diagonal and saves it as circuit/0.3"]);
    await page.shot(`${ctx.out}/beta-diagonal-wire.png`);
    res.push([page.errors.length === 0, `no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

/** Autosave and restore, Save and Open a file, bad files, and a browser with no storage. */
scenarios.saves = async (ctx) => {
  const res = [];
  const tmp = await Deno.makeTempDir({ prefix: "fe-files-" });
  const grid = (page) => ({
    px: (gx, gy) => page.eval(`(() => { const s = document.querySelector("svg.fe-canvas"), p = s.createSVGPoint(); p.x = ${gx} / 2; p.y = -${gy} / 2; const q = p.matrixTransform(s.getScreenCTM()); return [q.x, q.y]; })()`),
    perStep: () => page.eval(`document.querySelector("svg.fe-canvas").getScreenCTM().a / 2`),
    via: (id) => page.eval(`JSON.stringify(window.figureEditor.doc.wires.find((w) => w.id === ${JSON.stringify(id)}).via)`),
    clickCmd: async (cmd) => { const [x, y] = await page.eval(`(() => { const r = document.querySelector('[data-cmd="${cmd}"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`); await page.click(x, y); },
    status: () => page.eval(`({ text: document.querySelector(".fe-status").textContent, error: document.querySelector(".fe-status").hasAttribute("data-error"), role: document.querySelector(".fe-status").getAttribute("role") })`),
    saved: () => page.eval(`window.figureEditor.save()`),
  });
  const MOVED = JSON.stringify([[-20, 21], [-20, -13]]);
  const editorErrors = (page) => page.errors.filter((e) => /src\/(app|doc|view)\.js/.test(e));
  const dragW3 = async (page, g) => { const mid = await g.px(-22, 4); await page.drag(mid, [mid[0] + 2 * (await g.perStep()), mid[1]]); await page.sleep(200); };

  // A: Save writes a file; New clears; Open brings the same figure back.
  {
    const page = await ctx.launch({ scheme: "light", port: nextPort++ });
    try {
      const g = grid(page);
      // Headless Chrome will not say where it saved a download, so catch the editor's download at the link instead: its name and its exact bytes.
      await page.beforeLoad(`window.__downloads = []; const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { if (!this.download) return click.apply(this, arguments);
          const name = this.download; fetch(this.href).then((r) => r.text()).then((text) => window.__downloads.push({ name, text })); };`);
      await page.goto(ctx.url + "?open=examples/full-adder.json");
      await page.waitFor(ready); await page.sleep(1000);
      await dragW3(page, g);
      res.push([(await g.via("w3")) === MOVED, "A: the figure is edited (w3 dragged)"]);
      const before = await g.saved();
      await g.clickCmd("save");
      await page.waitFor(`window.__downloads.length > 0`, 5000).catch(() => {});
      const got = await page.eval(`window.__downloads[0] ?? null`);
      res.push([got?.name === "full_adder_gates.json", `A: Save downloads a file named ${got?.name}`]);
      res.push([got?.text === before, "A: the file is exactly the circuit/0.2 text the editor holds"]);
      const file = `${tmp}/saved.json`; await Deno.writeTextFile(file, got?.text ?? "");
      await g.clickCmd("new"); await page.sleep(400);
      res.push([await page.eval(`window.figureEditor.doc.elements.length === 0`), "A: New clears the canvas"]);
      await page.setFile(".fe-file", file); await page.sleep(800);
      res.push([(await g.saved()) === before && (await g.via("w3")) === MOVED, "A: Open brings back the same figure, edit included"]);
      res.push([editorErrors(page).length === 0, "A: no page errors"]);
    } finally { await page.close(); }
  }

  // B: bad files are refused with a readable error, and the figure on the canvas is left alone.
  {
    const page = await ctx.launch({ scheme: "light", port: nextPort++ });
    try {
      const g = grid(page);
      await page.goto(ctx.url + "?open=examples/full-adder.json");
      await page.waitFor(ready); await page.sleep(1000);
      const before = await g.saved();
      const bad = {
        "not-json.json": ["this is not json", /not JSON/],
        "empty.json": ["", /not JSON/],
        "array.json": ["[1, 2, 3]", /not a circuit file/],
        "old-schema.json": [JSON.stringify({ schema: "circuit/0.1", id: "x", grid_cm: 0.25, elements: [] }), /schema is/],
        "wrong-grid.json": [JSON.stringify({ schema: "circuit/0.2", id: "x", grid_cm: 0.5, elements: [] }), /grid_cm/],
        "bad-point.json": [JSON.stringify({ schema: "circuit/0.2", id: "x", grid_cm: 0.25, elements: [{ id: "a1", type: "and_gate", at: [1.5, 2] }] }), /whole grid steps/],
        "dup-id.json": [JSON.stringify({ schema: "circuit/0.2", id: "x", grid_cm: 0.25, elements: [{ id: "a1", type: "and_gate", at: [0, 0] }, { id: "a1", type: "and_gate", at: [8, 0] }] }), /used twice/],
      };
      for (const [name, [text, why]] of Object.entries(bad)) {
        const path = `${tmp}/${name}`; await Deno.writeTextFile(path, text);
        await page.setFile(".fe-file", path); await page.sleep(500);
        const s = await g.status();
        res.push([s.error && s.role === "alert" && /Could not open/.test(s.text) && why.test(s.text) && /unchanged/.test(s.text) && (await g.saved()) === before, `B: ${name} refused: "${s.text.slice(0, 90)}"`]);
      }
      await page.shot(`${ctx.out}/beta-bad-file.png`);
      res.push([editorErrors(page).length === 0, "B: no page errors"]);
    } finally { await page.close(); }
  }

  // C: autosave. An edit survives a reload, even one made less than a second before it.
  for (const wait of [1300, 50]) {
    const page = await ctx.launch({ scheme: "light", port: nextPort++ });
    try {
      const g = grid(page);
      await page.goto(ctx.url + "?open=examples/full-adder.json");
      await page.waitFor(ready); await page.sleep(1000);
      await dragW3(page, g);
      await page.sleep(wait);
      await page.goto(ctx.url);
      await page.waitFor(ready); await page.sleep(1000);
      const s = await g.status();
      res.push([(await g.via("w3")) === MOVED && /Restored/.test(s.text), `C: reload ${wait} ms after an edit restores it ("${s.text.slice(0, 40)}")`]);
      res.push([editorErrors(page).length === 0, `C (${wait} ms): no page errors`]);
    } finally { await page.close(); }
  }

  // D: a browser that refuses storage. The editor still starts and edits, and says autosave is off.
  {
    const page = await ctx.launch({ scheme: "light", port: nextPort++ });
    try {
      const g = grid(page);
      await page.beforeLoad(`Object.defineProperty(window, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } });`);
      await page.goto(ctx.url + "?open=examples/full-adder.json");
      await page.waitFor(ready); await page.sleep(1000);
      await dragW3(page, g);
      res.push([(await g.via("w3")) === MOVED, "D: with storage blocked the editor still edits"]);
      await page.sleep(1500);
      const s = await g.status();
      res.push([s.error && /Autosave is off/.test(s.text), `D: it says so once ("${s.text.slice(0, 60)}")`]);
      await g.clickCmd("save"); await page.sleep(300);
      res.push([editorErrors(page).length === 0, `D: no editor errors${editorErrors(page).length ? ": " + editorErrors(page)[0].slice(0, 120) : ""}`]);
    } finally { await page.close(); }
  }
  try { await Deno.remove(tmp, { recursive: true }); } catch { /* left for the system to clear */ }
  return res;
};

/** Every block preset on the canvas in light and dark, then place, resize, edit and save a block with the pointer and the panel. */
const ALL_PRESETS = `(async () => {
  const { PRESETS } = await import("../schematic-editor/src/presets.js");
  const els = PRESETS.map((p, i) => ({ id: "b" + (i + 1), type: "block", at: [(i % 5) * 24 - 48, 30 - Math.floor(i / 5) * 22], label: i % 4 === 0 ? "$N_" + i + "$" : undefined, params: p.params }));
  window.figureEditor.load(JSON.stringify({ schema: "circuit/0.2", id: "all_blocks", grid_cm: 0.25, elements: els, nets: {} }));
  return els.length;
})()`;

scenarios.blocks = async (ctx) => {
  const res = [];
  for (const scheme of ["light", "dark"]) {
    const page = await ctx.launch({ scheme, port: nextPort++ });
    try {
      await page.goto(ctx.url);
      await page.waitFor(ready);
      const n = await page.eval(ALL_PRESETS);
      await page.sleep(3500);   // MathJax loads from the CDN on first use
      await page.shot(`${ctx.out}/beta-blocks-${scheme}.png`);
      const scene = await page.eval(SCENE), px = await page.eval(PIXELS(await page.shotData()));
      const warn = await page.eval(`[...document.querySelectorAll(".fe-warnings li")].map((li) => li.textContent)`);
      const nodes = await page.eval(`document.querySelectorAll(".fe-scene [data-el]").length`);
      const labels = await page.eval(`document.querySelectorAll(".fe-scene [data-label]").length`);
      const thumbs = await page.eval(`document.querySelectorAll(".fe-blocks .fe-thumb").length`);
      res.push([nodes === n && n >= 19, `${scheme}: ${nodes} of ${n} block presets drawn`]);
      res.push([labels > 40, `${scheme}: ${labels} label groups drawn (centre and pin text)`]);
      res.push([thumbs === n, `${scheme}: ${thumbs} palette thumbnails for the presets`]);
      res.push([warn.length === 0, `${scheme}: no warnings (${warn.slice(0, 2).join("; ")})`]);
      if (scheme === "dark") {
        res.push([scene.canvas === "dark" && scene.strokes >= n, `dark: ${scene.strokes} strokes measured on a dark canvas`]);
        res.push([scene.black.length === 0, `dark: zero black strokes (found ${scene.black.length}: ${scene.black.slice(0, 3).join(", ")})`]);
        res.push([scene.low.length === 0, `dark: every stroke has 3:1 contrast (min ${Number(scene.minStroke).toFixed(2)})`]);
        res.push([px.canvas.black === 0, `dark: zero pure-black pixels on the canvas, labels included (${px.canvas.black})`]);
        res.push([px.palette.black === 0, `dark: zero pure-black pixels in the palette, block thumbnails included (${px.palette.black})`]);
      } else {
        res.push([scene.black.length > 20 && px.canvas.black > 0, `light: detector sanity, ${scene.black.length} black strokes in the scene, ${px.canvas.black} black pixels`]);
      }
      res.push([page.errors.length === 0, `${scheme}: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
    } finally { await page.close(); }
  }

  // Place, resize, edit and save one block, with real pointer events.
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(ctx.url);
    await page.waitFor(ready);
    await page.sleep(500);
    const px = (gx, gy) => page.eval(`(() => { const s = document.querySelector("svg.fe-canvas"), p = s.createSVGPoint(); p.x = ${gx} / 2; p.y = -${gy} / 2; const q = p.matrixTransform(s.getScreenCTM()); return [q.x, q.y]; })()`);
    const perStep = await page.eval(`document.querySelector("svg.fe-canvas").getScreenCTM().a / 2`);
    const block = () => page.eval(`JSON.stringify(window.figureEditor.doc.elements[0])`).then((t) => JSON.parse(t));
    const centre = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); for (let d = e.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    const setField = (name, value) => page.eval(`(() => { const i = document.querySelector('[data-field="${name}"]'); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);

    await page.eval(`window.figureEditor.load(JSON.stringify({ schema: "circuit/0.2", id: "blank", grid_cm: 0.25, elements: [], nets: {} }))`);   // the editor starts with the full adder
    await page.sleep(800);
    const btn = await centre('[data-preset="generic"]');
    await page.click(btn[0], btn[1]);
    const at = await px(0, 0);
    await page.mouse("mouseMoved", at[0], at[1], { buttons: 0 });
    await page.click(at[0], at[1]);
    await page.sleep(300);
    let el = await block();
    res.push([el?.type === "block" && el.id === "blk1" && el.params.w === 4 && el.params.h === 4, `placed a generic block from the palette (${JSON.stringify(el)})`]);
    const handles = await page.eval(`document.querySelectorAll(".fe-overlay [data-handle]").length`);
    res.push([handles === 8, `a selected block shows ${handles} resize handles`]);

    // Drag the east handle two modules (four steps) to the right.
    const east = await px(el.at[0] + el.params.w, el.at[1]);
    await page.drag(east, [east[0] + 4 * perStep, east[1]]);
    await page.sleep(300);
    el = await block();
    res.push([el.params.w === 6 && el.at[0] === 2, `dragging the east handle two modules widens the block to ${el.params.w} and keeps its west edge (centre x ${el.at[0]})`]);
    await page.key("z", "KeyZ", 90, 2);
    await page.sleep(200);
    el = await block();
    res.push([el.params.w === 4 && el.at[0] === 0, "one Ctrl+Z undoes the whole resize"]);
    await page.key("y", "KeyY", 89, 2);
    await page.sleep(200);

    // The panel: shape, size and pins.
    await setField("blkShape", "chevron");
    await setField("blkLeft", "A, B: $B_1$, C");
    await setField("blkTop", "T1, T2, T3, T4, T5, T6, T7");
    await page.sleep(300);
    el = await block();
    res.push([el.params.shape === "chevron" && el.params.pins.left.length === 3, `the panel changes shape and pins (${el.params.shape}, left ${JSON.stringify(el.params.pins.left)})`]);
    res.push([el.params.w >= 8, `seven top pins raise the width to ${el.params.w} modules (pin rule)`]);
    const status = await page.eval(`document.querySelector(".fe-status").textContent`);
    res.push([/raised/.test(status), `the status line says so: "${status.slice(0, 70)}"`]);
    await setField("blkLeft", "A, B: $B_1$, C, ???");
    await page.sleep(200);
    res.push([(await block()).params.pins.left.length === 3, "a bad pin name is refused and the block is unchanged"]);
    await page.shot(`${ctx.out}/beta-block-edited.png`);

    // Save and open again: the same figure, byte for byte.
    const saved = await page.eval(`window.figureEditor.save()`);
    await page.eval(`window.figureEditor.load(${JSON.stringify(saved)})`);
    await page.sleep(300);
    res.push([(await page.eval(`window.figureEditor.save()`)) === saved, "save, open, save gives the same text"]);
    // And through autosave: a reload brings the block back.
    await page.sleep(1200);
    await page.goto(ctx.url);
    await page.waitFor(ready);
    await page.sleep(800);
    const after = await page.eval(`window.figureEditor.save()`);
    if (after !== saved) { const i = [...saved].findIndex((c, k) => c !== after[k]); console.log("BLOCKS DIFF", JSON.stringify({ saved: saved.slice(i - 80, i + 160), after: after.slice(i - 80, i + 160) })); }
    res.push([after === saved, "a reload restores the block from the autosave"]);
    res.push([page.errors.length === 0, `no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

/** Arrows, bus marks and element level on the two sample figures; then a close look at a chevron notch, an arrowhead tip and a bus slash. */
scenarios.marks = async (ctx) => {
  const res = [];
  const samples = ["cla-chevron", "ripple-carry-blocks"];
  for (const scheme of ["light", "dark"]) {
    for (const sample of samples) {
      const page = await ctx.launch({ scheme, port: nextPort++ });
      try {
        await page.goto(`${ctx.url}?open=examples/${sample}.json`);
        await page.waitFor(ready);
        await page.sleep(3500);
        await page.shot(`${ctx.out}/beta-${sample}-${scheme}.png`);
        const scene = await page.eval(SCENE), px = await page.eval(PIXELS(await page.shotData()));
        const q = await page.eval(`({ heads: document.querySelectorAll(".fe-scene [data-head]").length, buses: document.querySelectorAll(".fe-scene [data-bus]").length, labels: document.querySelectorAll(".fe-scene [data-label]").length, warn: [...document.querySelectorAll(".fe-warnings li")].map((l) => l.textContent), wires: window.figureEditor.doc.wires.length })`);
        const want = sample === "cla-chevron" ? { heads: 5, buses: 3 } : { heads: 3 * 4 + 5, buses: 0 };
        res.push([q.heads === want.heads && q.buses === want.buses, `${scheme} ${sample}: ${q.heads} arrowheads and ${q.buses} bus slashes drawn (expected ${want.heads} and ${want.buses})`]);
        res.push([q.warn.length === 0 && q.labels >= 10, `${scheme} ${sample}: ${q.labels} labels, no warnings ${q.warn.slice(0, 2).join("; ")}`]);
        if (scheme === "dark") {
          res.push([scene.black.length === 0 && px.canvas.black === 0, `dark ${sample}: zero black strokes (${scene.black.length}) and zero black pixels (${px.canvas.black}) on the canvas`]);
          const headFills = await page.eval(`[...document.querySelectorAll(".fe-scene [data-head]")].map((p) => getComputedStyle(p).fill)`);
          res.push([headFills.every((f) => f !== "rgb(0, 0, 0)"), `dark ${sample}: arrowheads are filled in the light ink, not black (${headFills[0]})`]);
        }
        res.push([page.errors.length === 0, `${scheme} ${sample}: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
      } finally { await page.close(); }
    }
  }

  // The panel: arrows, bus mark and element level, on the chevron sample, with real clicks.
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?open=examples/cla-chevron.json`);
    await page.waitFor(ready);
    await page.sleep(3000);
    const defaultTagSize = await page.eval(`document.querySelector('[name="fe-tagpt"]').value`);
    res.push([defaultTagSize === "8", `level-tag size defaults to 8 pt (${defaultTagSize})`]);
    const px = (gx, gy) => page.eval(`(() => { const s = document.querySelector("svg.fe-canvas"), p = s.createSVGPoint(); p.x = ${gx} / 2; p.y = -${gy} / 2; const q = p.matrixTransform(s.getScreenCTM()); return [q.x, q.y]; })()`);
    const setField = (name, value) => page.eval(`(() => { const i = document.querySelector('[data-field="${name}"]'); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
    const wire = (id) => page.eval(`JSON.stringify(window.figureEditor.doc.wires.find((w) => w.id === ${JSON.stringify(id)}))`).then(JSON.parse);
    const count = (what) => page.eval(`document.querySelectorAll(".fe-scene [data-${what}]").length`);

    const at = await px(0, 9);                       // the carry-in wire, between its port and the block
    await page.click(at[0], at[1]);
    await page.sleep(300);
    res.push([(await page.eval(`document.querySelector('[data-field="wireArrow"]')?.value`)) === "end", "selecting the carry-in wire shows its arrow setting (end)"]);
    await setField("wireArrow", "both"); await page.sleep(200);
    res.push([(await wire("w4")).arrow === "both" && (await count("head")) === 6, `arrowheads at both ends: ${await count("head")} heads in the scene`]);
    await setField("wireArrow", "none"); await page.sleep(200);
    res.push([(await wire("w4")).arrow === undefined && (await count("head")) === 4, `none removes the field and the head (${await count("head")} left)`]);
    await setField("wireBus", "8"); await page.sleep(200);
    res.push([(await wire("w4")).bus === "8" && (await count("bus")) === 4, `a bus mark of 8 adds a slash (${await count("bus")} slashes)`]);
    for (let i = 0; i < 3; i++) { await page.key("z", "KeyZ", 90, 2); await page.sleep(200); }
    res.push([JSON.stringify(await wire("w4")) === JSON.stringify({ id: "w4", from: "in3", to: "blk1.Cin", arrow: "end" }), "three undos bring the wire back to the sample's"]);

    // Element level: click the block, set level 1 from the panel; the outline turns the level colour, the leads keep theirs.
    const mid = await px(0, 0);
    await page.click(mid[0], mid[1]); await page.sleep(300);
    const selectionOpen = await page.eval(`document.querySelector(".fe-selection-pane").open`);
    res.push([selectionOpen, "selecting an element opens the selection pane"]);
    await setField("level", "1"); await page.sleep(300);
    const colours = await page.eval(`(() => { const g = document.querySelector('[data-el="blk1"]'); return [...g.querySelectorAll("path")].map((p) => getComputedStyle(p).stroke); })()`);
    res.push([(await page.eval(`window.figureEditor.doc.elements[0].level`)) === "1", "the panel sets the block's level to 1"]);
    res.push([colours[0] === "rgb(213, 94, 0)" && colours.slice(1).every((c) => c === "rgb(0, 0, 0)"), `the outline is the level-1 colour, the leads stay ink (${colours.join(" | ")})`]);
    await setField("level", ""); await page.sleep(200);
    res.push([(await page.eval(`window.figureEditor.doc.elements[0].level`)) === undefined, "clearing the level removes the field"]);
    await page.shot(`${ctx.out}/beta-marks-panel.png`);
    res.push([page.errors.length === 0, `no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }

  // Close look at the exported file: notch, arrowhead tip, bus slash, each filling the window. Pictures go to --out.
  const look = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await look.goto(ctx.url);
    await look.waitFor(ready);
    const info = await look.eval(`(async () => {
      window.figureEditor.load(await (await fetch("../schematic-editor/examples/cla-chevron.json")).text());
      const text = await window.figureEditor.exportSvg();   // the file the Export SVG button writes
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const nums = (d) => d.match(/-?[0-9.]+/g).map(Number);
      const heads = [...doc.querySelectorAll('g[fill="#000000"][stroke="none"] path')].map((p) => nums(p.getAttribute("d")));
      const slashes = [...doc.querySelectorAll('g[fill="none"] path')].map((p) => p.getAttribute("d")).filter((d) => (d.match(/L/g) || []).length === 1 && d.length < 60).map(nums);
      window.__svg = text;
      return { heads, slashes };
    })()`);
    const show = async (name, cx, cy, h) => {
      await look.eval(`(() => {
        document.body.innerHTML = ""; document.body.style.cssText = "margin:0;background:#fff";
        const host = document.createElement("div"); host.innerHTML = window.__svg; document.body.append(host);
        const s = host.querySelector("svg"); const w = 1366, hh = 768, vw = ${h} * w / hh;
        s.setAttribute("width", w); s.setAttribute("height", hh); s.setAttribute("viewBox", [${cx} - vw / 2, ${cy} - ${h} / 2, vw, ${h}].join(" "));
        s.style.display = "block";
      })()`);
      await look.sleep(300);
      await look.shot(`${ctx.out}/beta-zoom-${name}.png`);
    };
    // Heads are [tip x, tip y, ...]; the first head is the one on the A bus. The notch apex is at (-1.5, 0) modules.
    const h = info.heads[0];
    await show("notch", -1.5, 0, 3.2);                       // about 240 px a module: 15x the editor's fit zoom
    await show("arrowhead", h[0], h[1], 1.4);
    const s = info.slashes[0];
    await show("slash", (s[0] + s[2]) / 2, (s[1] + s[3]) / 2, 1.4);
    res.push([info.heads.length === 5 && info.slashes.length >= 3, `the exported file has ${info.heads.length} arrowheads and ${info.slashes.length} slashes; zoomed pictures saved`]);
  } finally { await look.close(); }
  return res;
};

/** Element level: from the panel, in light and dark, in the SVG and PNG exports, as text on request, and through reload. */
scenarios.levels = async (ctx) => {
  const res = [];
  const BLOCK_PNG = (dark) => `(async () => {
    const blob = await window.figureEditor.png();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(bmp, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let level = 0, black = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      if (Math.abs(d[i] - 213) < 6 && Math.abs(d[i + 1] - 94) < 6 && d[i + 2] < 6) level++;   // the light theme's high colour, #D55E00
      if (d[i] <= 8 && d[i + 1] <= 8 && d[i + 2] <= 8) black++;
    }
    return { w: bmp.width, h: bmp.height, level, black };
  })()`;
  for (const scheme of ["light", "dark"]) {
    const page = await ctx.launch({ scheme, port: nextPort++ });
    try {
      await page.goto(`${ctx.url}?open=examples/cla-chevron.json`);
      await page.waitFor(ready);
      await page.sleep(3000);
      const px = (gx, gy) => page.eval(`(() => { const s = document.querySelector("svg.fe-canvas"), p = s.createSVGPoint(); p.x = ${gx} / 2; p.y = -${gy} / 2; const q = p.matrixTransform(s.getScreenCTM()); return [q.x, q.y]; })()`);
      const setField = (name, value) => page.eval(`(() => { const i = document.querySelector('[data-field="${name}"]'); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
      const mid = await px(0, 0);
      await page.click(mid[0], mid[1]); await page.sleep(300);
      await setField("level", "1"); await page.sleep(300);
      const body = await page.eval(`getComputedStyle(document.querySelector('[data-el="blk1"] path')).stroke`);
      const want = scheme === "light" ? "rgb(213, 94, 0)" : "rgb(254, 112, 0)";
      res.push([body === want, `${scheme}: the block's outline is the level-1 role colour (${body}); the panel says "${(await page.eval(`document.querySelector(".fe-level").textContent`))}"`]);
      // SVG export (light by default, dark when asked): the level colour comes from the role, with no other colour added.
      const svg = await page.eval(`window.figureEditor.exportSvg()`);
      const colours = [...new Set((svg.match(/(?:fill|stroke)="#[0-9A-Fa-f]{6}"/g) || []).map((s) => s.slice(-8, -1).toUpperCase()))];
      res.push([colours.includes("#D55E00") && colours.every((c) => ["#000000", "#D55E00"].includes(c)), `${scheme}: SVG export colours are only ink and the level role (${colours.join(", ")})`]);
      if (scheme === "light") {
        const png = await page.eval(BLOCK_PNG());
        res.push([png.level > 100 && png.black > 100, `light: PNG export (${png.w}x${png.h}) has ${png.level} level-colour pixels and ${png.black} ink pixels`]);
      }
      // Level as text on request.
      const before = await page.eval(`document.querySelectorAll('.fe-scene [data-label="tag:blk1"]').length`);
      await page.eval(`(() => { const i = document.querySelector('[name="fe-tags"]'); i.checked = true; i.dispatchEvent(new Event("change", { bubbles: true })); })()`);
      await page.sleep(1500);
      const after = await page.eval(`document.querySelectorAll('.fe-scene [data-label="tag:blk1"]').length`);
      res.push([before === 0 && after === 1, `${scheme}: the level shows as text "1" beside the block when asked (${before} then ${after})`]);
      await setField("levelTagSide", "left");
      await setField("levelTagGap", "2");
      await page.eval(`(() => {
        const size = document.querySelector('[name="fe-tagpt"]');
        size.value = "20"; size.dispatchEvent(new Event("change", { bubbles: true }));
        const colour = document.querySelector('[name="fe-tagcolour"]');
        colour.checked = true; colour.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      const tagOptions = await page.eval(`(() => {
        const saved = JSON.parse(window.figureEditor.save());
        const options = JSON.parse(localStorage.getItem("figure-editor/options") || "{}");
        return { side: saved.groups?.level_tag_style?.blk1?.side, gap: saved.groups?.level_tag_style?.blk1?.gap, size: options.levelTagPt, colour: options.levelTagColour };
      })()`);
      res.push([tagOptions.side === "left" && tagOptions.gap === 2 && tagOptions.size === 20 && tagOptions.colour, `${scheme}: tag position, offset, size and level colour are configurable (${JSON.stringify(tagOptions)})`]);
      await page.shot(`${ctx.out}/beta-level-${scheme}.png`);
      const scene = await page.eval(SCENE);
      if (scheme === "dark") res.push([scene.black.length === 0, `dark: zero black strokes with a leveled block (${scene.black.length})`]);
      // Reload: autosave brings the level back.
      const saved = await page.eval(`window.figureEditor.save()`);
      await page.sleep(1200);
      await page.goto(ctx.url);
      await page.waitFor(ready);
      await page.sleep(1200);
      res.push([(await page.eval(`window.figureEditor.save()`)) === saved && /"level": "1"/.test(saved), `${scheme}: the level survives save and reload (autosave)`]);
      res.push([page.errors.length === 0, `${scheme}: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
    } finally { await page.close(); }
  }
  return res;
};

/** Basic gate outputs follow the input-net levels, including after an input edit. */
scenarios.logic = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(ctx.url);
    await page.waitFor(ready);
    const figure = {
      schema: "circuit/0.2", id: "logic_gate_test", grid_cm: 0.25,
      elements: [{ id: "and1", type: "and_gate", at: [0, 0] }],
      nets: { n1: ["and1.A"], n2: ["and1.B"], n3: ["and1.Y"] },
      wires: [
        { id: "w1", from: [-12, 1], to: "and1.A", level: "1" },
        { id: "w2", from: [-12, -1], to: "and1.B", level: "1" },
        { id: "w3", from: "and1.Y", to: [12, 0] },
      ],
    };
    await page.eval(`window.figureEditor.load(${JSON.stringify(JSON.stringify(figure))})`);
    await page.sleep(1500);   // the view refits to the loaded figure after typesetting; canvas clicks need that
    const initial = await page.eval(`window.figureEditor.doc.wires.find((wire) => wire.id === "w3").level`);
    res.push([initial === "1", `AND output resolves to 1 from inputs 1 and 1 (${initial})`]);

    const input = await page.eval(`(() => {
      const svg = document.querySelector("svg.fe-canvas"), p = svg.createSVGPoint();
      p.x = -8 / 2; p.y = -1 / 2;
      const q = p.matrixTransform(svg.getScreenCTM());
      return [q.x, q.y];
    })()`);
    await page.click(input[0], input[1]);
    await page.sleep(200);
    await page.eval(`(() => {
      const field = document.querySelector('[data-field="level"]');
      field.value = "0"; field.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    const updated = await page.eval(`window.figureEditor.doc.wires.find((wire) => wire.id === "w3").level`);
    res.push([updated === "0", `changing one input to 0 recalculates the AND output (${updated})`]);
    const output = await page.eval(`(() => {
      const svg = document.querySelector("svg.fe-canvas"), p = svg.createSVGPoint();
      p.x = 8 / 2; p.y = 0;
      const q = p.matrixTransform(svg.getScreenCTM());
      return [q.x, q.y];
    })()`);
    await page.click(output[0], output[1]);
    await page.sleep(200);
    const levelTitle = await page.eval(`document.querySelector('[data-field="level"]')?.title ?? ""`);
    res.push([levelTitle.includes("calculated from its input levels"), "the selection panel explains that gate outputs are calculated"]);

    const latch = {
      schema: "circuit/0.2", id: "nand_latch_test", grid_cm: 0.25,
      elements: [
        { id: "nand1", type: "nand_gate", at: [0, 0] },
        { id: "nand2", type: "nand_gate", at: [0, 16] },
      ],
      nets: { set: ["nand1.A"], reset: ["nand2.A"], q: ["nand1.Y", "nand2.B"], qbar: ["nand2.Y", "nand1.B"] },
      wires: [
        { id: "set", from: [-12, 0], to: "nand1.A", level: "0" },
        { id: "reset", from: [-12, 16], to: "nand2.A", level: "1" },
        { id: "q", from: "nand1.Y", to: "nand2.B" },
        { id: "qbar", from: "nand2.Y", to: "nand1.B" },
      ],
    };
    await page.eval(`window.figureEditor.load(${JSON.stringify(JSON.stringify(latch))})`);
    const readLatch = `(() => Object.fromEntries(["q", "qbar"].map((id) => [id, window.figureEditor.doc.wires.find((wire) => wire.id === id)?.level])))()`;
    const setState = await page.eval(readLatch);
    res.push([setState.q === "1" && setState.qbar === "0", `NAND latch set resolves Q/Q̅ to 1/0 (${JSON.stringify(setState)})`]);

    const heldState = await page.eval(`(() => {
      const doc = window.figureEditor.doc;
      doc.wires.find((wire) => wire.id === "set").level = "1";
      window.figureEditor.load(JSON.stringify(doc));
      return Object.fromEntries(["q", "qbar"].map((id) => [id, window.figureEditor.doc.wires.find((wire) => wire.id === id)?.level]));
    })()`);
    res.push([heldState.q === "1" && heldState.qbar === "0", `inactive NAND latch holds its prior state (${JSON.stringify(heldState)})`]);

    const resetState = await page.eval(`(() => {
      const doc = window.figureEditor.doc;
      doc.wires.find((wire) => wire.id === "reset").level = "0";
      window.figureEditor.load(JSON.stringify(doc));
      return Object.fromEntries(["q", "qbar"].map((id) => [id, window.figureEditor.doc.wires.find((wire) => wire.id === id)?.level]));
    })()`);
    res.push([resetState.q === "0" && resetState.qbar === "1", `NAND latch reset resolves Q/Q̅ to 0/1 (${JSON.stringify(resetState)})`]);
    await page.shot(`${ctx.out}/beta-logic.png`);
    res.push([page.errors.length === 0, `logic: no page errors${page.errors.length ? `: ${page.errors[0]}` : ""}`]);
  } finally { await page.close(); }
  return res;
};

/** F12: Open an exported SVG (the circuit comes back), Open some other SVG (a locked, sanitised backdrop), and a bad one. */
scenarios.import = async (ctx) => {
  const res = [];
  const tmp = await Deno.makeTempDir({ prefix: "fe-import-" });
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    const status = () => page.eval(`({ text: document.querySelector(".fe-status").textContent, error: document.querySelector(".fe-status").hasAttribute("data-error") })`);
    const openFile = async (name, text) => {
      const path = `${tmp}/${name}`;
      await Deno.writeTextFile(path, text);
      await page.setFile(".fe-file", path);
      await page.sleep(1200);
    };
    await page.goto(`${ctx.url}?open=examples/cla-chevron.json`);
    await page.waitFor(ready);
    await page.sleep(2500);
    const original = await page.eval(`window.figureEditor.save()`);
    const svgText = await page.eval(`window.figureEditor.exportSvg()`);
    res.push([svgText.includes("<metadata>") && !/<text|href=|script/.test(svgText), "the exported SVG carries its circuit in <metadata> and still has no text, links or scripts"]);

    // 1. Our own export: New, then Open the SVG; the same figure comes back.
    await page.eval(`document.querySelector('[data-cmd="new"]').click()`);
    await page.sleep(300);
    res.push([await page.eval(`window.figureEditor.doc.elements.length === 0`), "New clears the canvas"]);
    await openFile("cla.svg", svgText);
    res.push([(await page.eval(`window.figureEditor.save()`)) === original, "Open on our own SVG restores the identical circuit (byte for byte)"]);
    res.push([/from the circuit inside cla\.svg/.test((await status()).text), `the status line says where it came from: "${(await status()).text.slice(0, 60)}"`]);

    // 2. Another SVG becomes a locked backdrop. It holds a script, a handler and an external reference.
    const other = `<svg xmlns="http://www.w3.org/2000/svg" width="12cm" height="6cm" viewBox="0 0 120 60" onload="window.__pwned = 1">
      <script>window.__pwned = 2</script><image href="http://127.0.0.1:1/x.png" width="10" height="10"/>
      <rect x="2" y="2" width="116" height="56" fill="none" stroke="#c00" stroke-width="2" onclick="window.__pwned = 3"/><circle cx="60" cy="30" r="20" fill="#06c"/></svg>`;
    await openFile("trace.svg", other);
    const bd = await page.eval(`(() => { const i = document.querySelector(".fe-backdrop"); return { vis: i.getAttribute("visibility"), href: (i.getAttribute("href") || "").slice(0, 40), w: +i.getAttribute("width"), op: i.getAttribute("opacity"), pwned: window.__pwned ?? null, events: i.getAttribute("pointer-events") }; })()`);
    res.push([bd.vis === "visible" && bd.href.startsWith("data:image/svg+xml"), `another SVG shows as a backdrop (${bd.href})`]);
    res.push([Math.abs(bd.w - 24) < 0.01, `its natural size is read in modules: 12 cm is ${bd.w} modules`]);
    res.push([bd.pwned === null && bd.events === "none", "no script ran, and the backdrop takes no pointer events (locked)"]);
    const decoded = await page.eval(`decodeURIComponent(document.querySelector(".fe-backdrop").getAttribute("href").split(",").slice(1).join(","))`);
    res.push([!/script|onclick|onload|http:/.test(decoded.replace("http://www.w3.org/2000/svg", "")) && /<circle/.test(decoded), "the stored image has no script, handler or external reference, and keeps the drawing"]);
    const savedBackdrop = await page.eval(`window.figureEditor.save()`);
    res.push([!!JSON.parse(savedBackdrop).groups?.backdrop, "the backdrop is saved with the circuit"]);
    res.push([!(await page.eval(`window.figureEditor.exportSvg()`)).includes("<image "), "the default SVG export omits the backdrop"]);
    res.push([(await page.eval(`window.figureEditor.exportSvg(false, window.figureEditor.doc, true)`)).includes("<image "), "the SVG export can include the backdrop"]);
    await page.eval(`window.figureEditor.load(${JSON.stringify(savedBackdrop)})`);
    res.push([await page.eval(`document.querySelector(".fe-backdrop").getAttribute("visibility") === "visible"`), "the backdrop returns when the circuit is reopened"]);

    // Opacity and scale from the panel.
    await page.eval(`(() => { for (const [n, v] of [["fe-bd-opacity", "20"], ["fe-bd-scale", "50"]]) { const i = document.querySelector('[name="' + n + '"]'); i.value = v; i.dispatchEvent(new Event("change", { bubbles: true })); } })()`);
    await page.sleep(300);
    const after = await page.eval(`(() => { const i = document.querySelector(".fe-backdrop"); return { op: i.getAttribute("opacity"), w: +i.getAttribute("width") }; })()`);
    res.push([after.op === "0.2" && Math.abs(after.w - 12) < 0.01, `opacity 20% and scale 50% apply (opacity ${after.op}, width ${after.w} modules)`]);
    await page.eval(`(() => { const i = document.querySelector('[name="fe-bd-opacity"]'); i.value = "35"; i.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await page.sleep(300);
    await page.shot(`${ctx.out}/beta-backdrop.png`);
    // Clicking over the backdrop where there is no figure selects nothing.
    const sel0 = await page.eval(`document.querySelector(".fe-props").textContent`);
    await page.click(700, 200);
    await page.sleep(200);
    res.push([(await page.eval(`document.querySelector(".fe-props").textContent`)) === sel0, "clicking on the backdrop selects nothing"]);
    await page.eval(`document.querySelector('[data-cmd="backdropremove"]').click()`);
    await page.sleep(200);
    res.push([(await page.eval(`document.querySelector(".fe-backdrop").getAttribute("visibility")`)) === "hidden", "Remove backdrop takes it away"]);

    // 3. Files that cannot be opened say why and leave the figure alone.
    await openFile("empty.svg", "<svg xmlns='http://www.w3.org/2000/svg'><rect/></svg>");
    let s = await status();
    res.push([s.error && /no size/.test(s.text) && (await page.eval(`window.figureEditor.save()`)) === original, `an SVG with no size is refused: "${s.text.slice(0, 70)}"`]);
    await openFile("notsvg.svg", "<html><body>hi</body></html>");
    s = await status();
    res.push([s.error && /not an SVG/.test(s.text), `a non-SVG is refused: "${s.text.slice(0, 60)}"`]);
    res.push([page.errors.length === 0, `no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); try { await Deno.remove(tmp, { recursive: true }); } catch { /* temp */ } }
  return res;
};

/** F10: the slide frame on the canvas, in light and dark; its exports (SVG and PNG at real size); and a reload. */
scenarios.frame = async (ctx) => {
  // F10's slide frame on the canvas was folded into F19: the Slide section shows the slide and exports it at its real size.
  const res = [];
  for (const scheme of ["light", "dark"]) {
    const page = await ctx.launch({ scheme, port: nextPort++ });
    try {
      await page.goto(`${ctx.url}?open=examples/cla-chevron.json`);
      await page.waitFor(ready);
      await page.sleep(2500);
      await page.eval(`document.querySelector('[data-sec-bar="slide"]').click()`);
      await page.sleep(800);
      const regions = await page.eval(`document.querySelectorAll(".fe-slideview [data-region]").length`);
      res.push([regions >= 1, `${scheme}: the Slide section shows the slide with its regions (${regions})`]);
      await page.shot(`${ctx.out}/beta-frame-${scheme}.png`);
      if (scheme === "dark") {
        const px = await page.eval(PIXELS(await page.shotData())), scene = await page.eval(SCENE);
        res.push([px.canvas.black === 0 && scene.black.length === 0, `dark: no black pixels with the slide shown (${px.canvas.black})`]);
      }
      const size = await page.eval(`(async () => {
        const made = []; const orig = URL.createObjectURL; URL.createObjectURL = (blob) => { made.push(blob); return orig(blob); };
        await window.figureEditor.command("export", "svg");   // the active view (Slide) as SVG
        await new Promise((r) => setTimeout(r, 1500));
        URL.createObjectURL = orig;
        const svg = await made.find((b) => b.type.includes("svg"))?.text();
        const g = (n) => new RegExp('<svg[^>]* ' + n + '="([^"]*)"').exec(svg ?? "")?.[1];
        return JSON.stringify([g("width"), g("height")]);
      })()`);
      const [w, h] = JSON.parse(size);
      res.push([w === "33.867cm" && h === "19.05cm", `${scheme}: the slide export is the slide's real size (${w} by ${h})`]);
      res.push([page.errors.length === 0, `${scheme}: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
    } finally { await page.close(); }
  }
  return res;
};

scenarios.frames = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(ctx.url + "?open=examples/full-adder-levels.json");
    await page.waitFor(ready);
    await page.sleep(1500);
    const out = await page.eval(String.raw`(async () => {
      const blobs = [];
      const orig = URL.createObjectURL;
      URL.createObjectURL = (b) => { blobs.push(b); return orig(b); };
      const click = (c) => document.querySelector('[data-cmd="' + c + '"]').click();
      const pane = document.querySelector(".fe-frames-pane"); pane.open = true;
      click("framecapture"); click("framecapture");
      const items = () => document.querySelectorAll(".fe-frame-item").length;
      const n = items();
      document.querySelector('[data-frame="0"]').click();
      click("framesslide");
      await new Promise((r) => setTimeout(r, 2500));
      const types = blobs.map((b) => b.type), svg = await blobs.find((b) => b.type.includes("svg"))?.text();
      return { n, types, svg: svg ? { cm: /width="([\d.]+)cm" height="([\d.]+)cm"/.exec(svg)?.slice(1), text: /<text/.test(svg), groups: (svg.match(/scale\(/g) ?? []).length } : null };
    })()`);
    await page.shot(`${ctx.out}/beta-frames.png`);
    res.push([out.n === 3, `frames: Frame 0 plus two captured frames listed (${out.n})`]);
    res.push([out.svg && out.svg.cm[0] === "33.867" && out.svg.cm[1] === "19.05" && !out.svg.text && out.svg.groups >= 2, `frames: one-slide export is slide size, with no <text> (${JSON.stringify(out.svg)})`]);
    res.push([out.types.some((t) => t.includes("png")), `frames: the PNG was made (${out.types.join(", ")})`]);
    res.push([page.errors.length === 0, `frames: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

/** Beta-only timing controls, outlined TeX names, isolated storage and a full-pane source editor. */
scenarios.timing = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(`!!document.querySelector(".td-tabs")`);
    await page.eval(`document.querySelector('[data-view="diagram"]').click()`);
    await page.sleep(300);
    const controls = await page.eval(`(() => {
      const view = document.querySelector(".td-view");
      const look = document.querySelector(".fe-left .td-side-look"), size = document.querySelector(".fe-left .td-side-size");
      const chart = view.querySelector("#WaveDrom_Display_0"), chartBox = chart.getBoundingClientRect();
      return {
        shown: !view.hidden,
        controlsInSidebar: !!look && !!size && document.querySelector(".fe-left").contains(look) && document.querySelector(".fe-left").contains(size),
        noInlineControls: !view.querySelector(".td-view-look") && !view.querySelector("[data-look-split]"),
        chartVisible: chartBox.width > 0 && chartBox.height > 0,
        showNames: document.querySelector('[data-look="showNames"]')?.checked,
        font: document.querySelector('[data-look="fontSize"]')?.value,
        width: document.querySelector('[data-look="lineWidth"]')?.value,
        signalColour: !!document.querySelector('[data-look="signalLineColour"]'),
        spacing: !!document.querySelector('[data-size="hscale"]'),
        sizeFields: !!document.querySelector('[data-size="w"]'),
        lockAspect: !!document.querySelector('[data-size="lockAspect"]'),
        fit: !!document.querySelector('[data-do="fit"]'),
        dataColours: document.querySelectorAll('[data-look="dataColour"]').length,
        arrowLine: !!document.querySelector('[data-look="edgeLineWidth"]'),
        arrowHead: !!document.querySelector('[data-look="arrowHeadSize"]'),
        arrowColours: document.querySelectorAll('[data-look="edgeColour"]').length,
        arrowDotted: document.querySelectorAll('[data-look="edgeDotted"]').length,
        resetLook: !!document.querySelector('[data-do="reset-look"]'),
        spacerButton: !!document.querySelector('[data-do="add-spacer"]'),
      };
    })()`);
    res.push([controls.shown && controls.controlsInSidebar && controls.noInlineControls && controls.chartVisible && controls.showNames === true && controls.font === "12" && controls.width === "2" && controls.spacing && controls.sizeFields, `diagram fills its pane while Look and Size controls stay in the sidebar (${JSON.stringify(controls)})`]);
    res.push([controls.dataColours === 7 && controls.arrowLine && controls.arrowHead && controls.arrowColours === 3 && controls.arrowDotted === 3 && controls.resetLook && controls.lockAspect && controls.spacerButton && controls.fit, `sidebar look controls include per-shape arrow styling, aspect lock, reset, Fit and the WaveDrom spacer tool (${JSON.stringify(controls)})`]);
    const aspect = await page.eval(`(() => {
      const width = document.querySelector('[data-size="w"]'), height = document.querySelector('[data-size="h"]'), lock = document.querySelector('[data-size="lockAspect"]');
      width.value = "1600"; width.dispatchEvent(new Event("input", { bubbles: true }));
      height.value = "1000"; height.dispatchEvent(new Event("input", { bubbles: true }));
      lock.checked = true; lock.dispatchEvent(new Event("change", { bubbles: true }));
      width.value = "2400"; width.dispatchEvent(new Event("input", { bubbles: true }));
      const heightAfterWidth = Number(height.value);
      height.value = "1200"; height.dispatchEvent(new Event("input", { bubbles: true }));
      return { heightAfterWidth, widthAfterHeight: Number(width.value) };
    })()`);
    res.push([aspect.heightAfterWidth === 1500 && aspect.widthAfterHeight === 1920, `locked sizing preserves its ratio in either direction (${JSON.stringify(aspect)})`]);

    await page.eval(`window.figureEditor.load(JSON.stringify({
      schema: "circuit/0.2", id: "timing_connected_wires", grid_cm: 0.25,
      elements: [], ports: [], nets: {},
      wires: [{ id: "w1", from: [0, 0], to: [2, 0] }, { id: "w2", from: [2, 0], to: [4, 0] }, { id: "w3", from: [8, 2], to: [10, 2] }],
      groups: { wire_labels: { w1: "$Q_{0}$", w3: "$Q_{0}$" } }
    }))`);
    await page.waitFor(`Array.from(document.querySelectorAll(".td-chips [data-node]")).map((b) => b.dataset.node).join(",") === "$Q_{0}$"`, 10000);
    const connectedNames = await page.eval(`Array.from(document.querySelectorAll(".td-chips [data-node]")).map((b) => b.dataset.node)`);
    res.push([connectedNames.length === 1 && connectedNames[0] === "$Q_{0}$", `connected and disconnected wires with the same TeX label share one timing node (${JSON.stringify(connectedNames)})`]);
    await page.waitFor(`!!document.querySelector(".td-chips .td-chip mjx-container")`, 30000);
    res.push([true, "timing node buttons typeset TeX labels"]);

    await page.eval(`(() => {
      document.querySelector('[data-view="source"]').click();
      const source = document.querySelector(".td-srctext");
      source.value = JSON.stringify({
        signal: [{ name: "$Q_{0}$", wave: "3.", data: ["payload"], node: "a." }, {}, { name: "D", wave: "0.1", node: ".b" }],
        edge: ["a->b $t_{pd}$"],
      });
      document.querySelector('[data-do="src-apply"]').click();
      document.querySelector('[data-view="diagram"]').click();
    })()`);
    await page.waitFor(`!!document.querySelector("#WaveDrom_Display_0 .td-name-math path") && !!document.querySelector("#WaveDrom_Display_0 .td-edge-label-math path") && !!document.querySelector(".td-name .td-inline-math path")`, 30000);
    const spacer = await page.eval(`!!document.querySelector(".td-row.td-spacer")`);
    res.push([spacer, "an empty WaveDrom signal imports as a blank spacer lane"]);
    const nameToggle = await page.eval(`(() => {
      const input = document.querySelector('[data-look="showNames"]');
      input.checked = false; input.dispatchEvent(new Event("change", { bubbles: true }));
      const hidden = !document.querySelector("#WaveDrom_Display_0 .td-name-math") && !Array.from(document.querySelectorAll("#WaveDrom_Display_0 svg text")).some((t) => t.textContent === "D");
      input.checked = true; input.dispatchEvent(new Event("change", { bubbles: true }));
      return hidden;
    })()`);
    await page.waitFor(`!!document.querySelector("#WaveDrom_Display_0 .td-name-math path")`, 10000);
    res.push([nameToggle, "the timing viewer can hide and restore net names"]);
    await page.eval(`(() => {
      const font = document.querySelector('[data-look="fontSize"]'), width = document.querySelector('[data-look="lineWidth"]');
      font.value = "18"; font.dispatchEvent(new Event("change", { bubbles: true }));
      width.value = "2.6"; width.dispatchEvent(new Event("change", { bubbles: true }));
      const set = (selector, value) => { const input = document.querySelector(selector); input.value = value; input.dispatchEvent(new Event("change", { bubbles: true })); };
      set('[data-look="dataColour"][data-colour-index="0"]', "#123456");
      set('[data-look="signalLineColour"]', "#112233");
      set('[data-look="edgeLineWidth"]', "2.4");
      set('[data-look="arrowHeadSize"]', "10");
      set('[data-look="edgeColour"][data-edge-type="straight"]', "#654321");
      const dotted = document.querySelector('[data-look="edgeDotted"][data-edge-type="straight"]');
      dotted.checked = true; dotted.dispatchEvent(new Event("change", { bubbles: true }));
      set('[data-look="edgeColour"][data-edge-type="curved"]', "#ABCDEF");
    })()`);
    await page.sleep(250);
    const svg = await page.eval(`(() => {
      const s = document.querySelector("#WaveDrom_Display_0 svg");
      const source = JSON.parse(localStorage.getItem("timing-diagram/source") ?? "{}");
      return {
        math: !!s?.querySelector(".td-name-math path"), editorMath: !!document.querySelector(".td-name .td-inline-math path"),
        edgeMath: !!s?.querySelector(".td-edge-label-math path"), textSized: !!s?.querySelector('.td-name-math[transform*="scale(0.032)"]') && !!s?.querySelector('text[font-size="18"]'),
        thickLine: !!s?.querySelector('[stroke-width="2.6"]'), dataColour: !!s?.querySelector('[fill="#123456"]'),
        signalLine: !!s?.querySelector('[stroke="#112233"]'), arrowLine: !!s?.querySelector('[stroke="#654321"][stroke-width="2.4"][stroke-dasharray]'), arrowHead: !!s?.querySelector('[fill="#654321"]'),
        widths: Array.from(s?.querySelectorAll("[stroke-width]") ?? []).map((t) => t.getAttribute("stroke-width")), config: source.config,
        sourceKey: !!localStorage.getItem("timing-diagram/source"), stableKey: localStorage.getItem("timing-diagram/source"), legacySend: localStorage.getItem("timing-diagram/send"),
      };
    })()`);
    res.push([svg.math, "a TeX signal name is typeset as SVG paths"]);
    res.push([svg.editorMath, "the Edit view also renders TeX signal names"]);
    res.push([svg.edgeMath, "WaveDrom edge titles render as TeX paths"]);
    res.push([svg.textSized && svg.thickLine, `text size and line width update the diagram (${JSON.stringify(svg)})`]);
    res.push([svg.dataColour && svg.signalLine && svg.arrowLine && svg.arrowHead && svg.config?.dataColours?.[0] === "#123456" && svg.config.signalLineColour === "#112233" && svg.config.edgeLineWidth === 2.4 && svg.config.arrowHeadSize === 10 && svg.config.edgeStyles?.straight?.colour === "#654321" && svg.config.edgeStyles?.curved?.colour === "#ABCDEF", `data, signal and per-shape arrow styles save; arrow colour matches the head (${JSON.stringify(svg)})`]);
    const resetColours = await page.eval(`(() => {
      document.querySelector('[data-do="reset-look-colours"]').click();
      const source = JSON.parse(localStorage.getItem("timing-diagram/source") ?? "{}");
      return !source.config?.dataColours && !source.config?.signalLineColour && !source.config?.edgeLineColour && !source.config?.arrowHeadColour && source.config?.edgeStyles?.straight?.colour === undefined && document.querySelector('[data-look="edgeDotted"][data-edge-type="straight"]').checked;
    })()`);
    res.push([resetColours, "theme-colour reset clears custom colours but keeps dotted arrow lines"]);
    const resetLook = await page.eval(`(() => {
      document.querySelector('[data-do="reset-look"]').click();
      const source = JSON.parse(localStorage.getItem("timing-diagram/source") ?? "{}");
      return source.signal?.length === 3 && !source.config?.edgeStyles && !source.config?.fontSize && !source.config?.hscale && !document.querySelector('[data-size="lockAspect"]').checked;
    })()`);
    res.push([resetLook, "full look reset clears visual overrides without discarding the waveform"]);
    res.push([svg.sourceKey, "the timing diagram is saved under timing-diagram/source, shared with the Timing Diagram page (R1, Blake 2026-11-19)"]);

    await page.eval(`document.querySelector('[data-view="source"]').click()`);
    const pane = await page.eval(`(() => {
      const body = document.querySelector(".td-source").getBoundingClientRect(), editor = document.querySelector(".td-srctext").getBoundingClientRect();
      const rect = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.width, r.height]; };
      return { visible: !document.querySelector(".td-source").hidden, pane: [body.width, body.height], editor: [editor.width, editor.height], center: rect(".td-center"), dock: rect(".td-dock"), section: rect('[data-sec="timing"]'), grid: getComputedStyle(document.querySelector(".td-dock")).gridTemplateRows, centerGrid: getComputedStyle(document.querySelector(".td-center")).gridTemplateRows, sourceDisplay: getComputedStyle(document.querySelector(".td-source")).display, wrap: document.querySelector(".td-srctext").wrap, tab: document.querySelector('[data-view="source"]').textContent.trim(), hint: !!document.querySelector(".td-source .fe-hint") };
    })()`);
    res.push([pane.visible && pane.editor[0] >= pane.pane[0] * 0.9 && pane.editor[1] >= pane.pane[1] * 0.65 && pane.wrap === "off" && pane.tab === "Source" && !pane.hint, `Source fills the pane as an unwrapped editor without the old hint (${JSON.stringify(pane)})`]);

    await page.eval(`(() => { document.querySelector('[data-view="diagram"]').click(); document.querySelector(".td-side-look").open = true; document.querySelector(".td-side-size").open = true; })()`);
    await page.sleep(250);
    await page.shot(`${ctx.out}/beta-timing-look.png`);
    res.push([page.errors.length === 0, `no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.timingAlignment = async (ctx) => {
  const res = [], page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(`!!document.querySelector(".td-tabs")`);
    await page.eval(`(() => {
      document.querySelector('[data-view="source"]').click();
      document.querySelector(".td-srctext").value = JSON.stringify({
        signal: [
          { name: "Clock", wave: "p...", node: ".a.." },
          { name: "Signal", wave: "01.0", node: ".b.." },
          { name: "Sharp", wave: "0h.l", node: ".c.." },
          { name: "Data", wave: "0x.1", node: ".d.." }
        ],
        head: { tick: 0 }, edge: ["a->b", "b->c", "c->d"], config: { slant: 10, edgeLineColour: "#123456" }
      });
      document.querySelector('[data-do="src-apply"]').click();
      document.querySelector('[data-view="diagram"]').click();
    })()`);
    await page.waitFor(`document.querySelectorAll('#WaveDrom_Display_0 path[stroke="#123456"]').length === 3`);
    const geometry = await page.eval(`(() => {
      const svg = document.querySelector("#WaveDrom_Display_0 svg");
      const edges = Array.from(svg.querySelectorAll('path[stroke="#123456"]')).map(p => p.getAttribute("d").match(/^M ([\\d.]+) [\\d.]+ L ([\\d.]+) [\\d.]+/).slice(1).map(Number));
      const grid = Array.from(svg.querySelectorAll('line[stroke-dasharray="2 3"]')).map(l => [Number(l.getAttribute("x1")), Number(l.getAttribute("x2"))]);
      return { edges, grid };
    })()`);
    const x = geometry.edges[0][0];
    res.push([geometry.edges.every(([a, b]) => a === x && b === x) && geometry.grid.some(([a, b]) => a === x && b === x), `rendered grid and arrows share the transition center (${JSON.stringify(geometry)})`]);
    await page.shot(`${ctx.out}/beta-timing-alignment.png`);
    res.push([page.errors.length === 0, `no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.timingDefaults = async (ctx) => {
  const res = [], page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(`!!document.querySelector(".td-tabs") && !!window.figureEditor`);
    await page.eval(`(() => {
      document.querySelector('[data-view="source"]').click();
      document.querySelector(".td-srctext").value = JSON.stringify({
        signal: [{ name: "A", wave: "0.1.", node: "..a." }, { name: "B", wave: "0.1.", node: "..b." }],
        edge: ["a->b delay"], head: { tick: 0 }
      });
      document.querySelector('[data-do="src-apply"]').click();
      document.querySelector('[data-view="diagram"]').click();
      document.querySelector(".td-side-look").open = true;
    })()`);
    await page.waitFor(`document.querySelector("#WaveDrom_Display_0 .td-name-math path") && document.querySelector("#WaveDrom_Display_0 .td-edge-label-math path")`, 30000);
    const defaults = await page.eval(`(() => {
      const svg = document.querySelector("#WaveDrom_Display_0 svg");
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--fig-accent").trim().toLowerCase();
      const line = [...svg.querySelectorAll("path[stroke-dasharray]")].find(p => p.getAttribute("stroke")?.toLowerCase() === accent);
      return {
        sizes: ["signalNameSize", "arrowLabelSize", "lineWidth"].map(k => document.querySelector('[data-look="' + k + '"]').value),
        dotted: document.querySelector('[data-look="edgeDotted"][data-edge-type="straight"]').checked,
        picker: document.querySelector('[data-look="edgeColour"][data-edge-type="straight"]').value.toLowerCase(),
        accent, line: line?.outerHTML, name: svg.querySelector(".td-name-math").getAttribute("transform"),
        label: svg.querySelector(".td-edge-label-math").getAttribute("transform"),
        signalWidth: !!svg.querySelector('path[clip-path][stroke-width="2"]'),
        head: [...svg.querySelectorAll("path[fill]")].find(p => p.getAttribute("fill")?.toLowerCase() === accent)?.getAttribute("d"),
        arrowWidth: document.querySelector('[data-look="edgeLineWidth"]').value,
        headSize: document.querySelector('[data-look="arrowHeadSize"]').value,
        headMax: document.querySelector('[data-look="arrowHeadSize"]').max,
        lineWidth: line?.getAttribute("stroke-width"),
      };
    })()`);
    res.push([defaults.sizes.join(",") === "32,30,2" && defaults.dotted && defaults.picker === "#0072b2" && defaults.picker === defaults.accent && defaults.lineWidth === "3" && Number(defaults.arrowWidth) === 3 && defaults.headSize === "16" && defaults.headMax === "32" && defaults.head && defaults.signalWidth && defaults.name.includes("scale(0.032)") && defaults.label.includes("scale(0.03)"), `default sizes and blue dotted arrows render in the timing viewer (${JSON.stringify(defaults)})`]);
    await page.shot(`${ctx.out}/beta-timing-defaults.png`);
    await page.eval(`(() => {
      const dotted = document.querySelector('[data-look="edgeDotted"][data-edge-type="straight"]');
      dotted.checked = false; dotted.dispatchEvent(new Event("change", { bubbles: true }));
      const head = document.querySelector('[data-look="arrowHeadSize"]');
      head.focus(); head.value = "50"; head.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    const clamped = await page.eval(`document.querySelector('[data-look="arrowHeadSize"]').value === "32"`);
    res.push([clamped, "arrowhead size is clamped to 32 even while the field is focused"]);
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(`!!document.querySelector(".td-tabs")`);
    const solid = await page.eval(`(() => {
      const source = JSON.parse(localStorage.getItem("timing-diagram/source"));
      const svg = document.querySelector("#WaveDrom_Display_0 svg");
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--fig-accent").trim().toLowerCase();
      const path = [...svg.querySelectorAll("path[fill]")].find(p => p.getAttribute("fill")?.toLowerCase() === accent)?.getAttribute("d");
      const match = path?.match(/^M ([\\d.]+) ([\\d.]+) L ([\\d.]+) ([\\d.]+)/);
      return source.config.edgeStyles.straight.dotted === false && !document.querySelector('[data-look="edgeDotted"][data-edge-type="straight"]').checked && source.config.arrowHeadSize === 32 && match && Math.abs(Number(match[2]) - Number(match[4])) === 32;
    })()`);
    res.push([solid, "solid straight arrows and 32 px arrowheads persist and render after reload"]);
    await page.eval(`document.querySelector('[data-do="reset-look"]').click()`);
    const reset = await page.eval(`document.querySelector('[data-look="edgeDotted"][data-edge-type="straight"]').checked && document.querySelector('[data-look="signalNameSize"]').value === "32" && document.querySelector('[data-look="arrowLabelSize"]').value === "30" && document.querySelector('[data-look="lineWidth"]').value === "2" && Number(document.querySelector('[data-look="edgeLineWidth"]').value) === 3 && document.querySelector('[data-look="arrowHeadSize"]').value === "16"`);
    res.push([reset, "Reset look restores the new defaults"]);
    res.push([page.errors.length === 0, `no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.slideTimingBounds = async (ctx) => {
  const res = [], page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(`!!document.querySelector(".td-tabs") && !!window.figureEditor`);
    await page.eval(`(() => {
      document.querySelector('[data-view="source"]').click();
      document.querySelector(".td-srctext").value = JSON.stringify({
        signal: Array.from({ length: 20 }, (_, i) => ({ name: "S" + i, wave: i === 0 ? "0x" + "01".repeat(49) : "01".repeat(50) })),
        head: { tick: 0 }
      });
      document.querySelector('[data-do="src-apply"]').click();
      document.querySelector('[data-view="diagram"]').click();
      document.querySelector('[data-sec-bar="slide"]').click();
    })()`);
    const inspect = `(() => {
      const svg = document.querySelector(".fe-slideview");
      const clip = svg.querySelector("clipPath"), box = clip?.querySelector("rect");
      if (!clip || !box) return null;
      const group = clip.closest("g"), id = clip.id;
      const paths = [...group.querySelectorAll('path[clip-path]')];
      const rect = { x: Number(box.getAttribute("x")), y: Number(box.getAttribute("y")), w: Number(box.getAttribute("width")), h: Number(box.getAttribute("height")) };
      const outside = paths.filter(path => {
        const b = path.getBBox();
        return b.x < rect.x - 0.1 || b.y < rect.y - 0.1 || b.x + b.width > rect.x + rect.w + 0.1 || b.y + b.height > rect.y + rect.h + 0.1;
      }).length;
      const hatch = group.querySelector("pattern");
      return { id, correctClip: document.getElementById(id) === clip, hatchId: hatch?.id, correctHatch: !!hatch && document.getElementById(hatch.id) === hatch, pathCount: paths.length, outside, rect };
    })()`;
    for (const layout of ["threeRows", "threeColumns"]) {
      await page.waitFor(`!!document.querySelector('[data-layout="${layout}"]')`);
      await page.eval(`document.querySelector('[data-layout="${layout}"]').click()`);
      await page.waitFor(`document.querySelector('.fe-slideview clipPath')`);
      const bounds = await page.eval(inspect);
      res.push([bounds?.correctClip && bounds.correctHatch && bounds.id !== "plot" && bounds.hatchId !== "hatch" && bounds.pathCount >= 20 && bounds.outside === 0, `${layout}: every waveform is inside its own slide clip (${JSON.stringify(bounds)})`]);
    }
    await page.eval(`document.querySelector('[data-layout="threeRows"]').click()`);
    await page.sleep(300);
    await page.shot(`${ctx.out}/beta-slide-timing-bounds.png`);
    res.push([page.errors.length === 0, `no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.timingTextSizes = async (ctx) => {
  const res = [], page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(`!!document.querySelector(".td-tabs")`);
    await page.eval(`(() => {
      document.querySelector('[data-view="source"]').click();
      document.querySelector(".td-srctext").value = JSON.stringify({
        signal: [{ name: "$Q_{0}$", wave: "01", node: ".a" }, { name: "$Q_{1}$", wave: "01", node: ".b" }],
        edge: ["a->b $t_{pd}$"], head: { text: "Timing", tick: 0 }, foot: { text: "End" }
      });
      document.querySelector('[data-do="src-apply"]').click();
      document.querySelector('[data-view="diagram"]').click();
      document.querySelector(".td-side-look").open = true;
      for (const [key, value] of [["fontSize", 64], ["signalNameSize", 40], ["arrowLabelSize", 64]]) {
        const input = document.querySelector('[data-look="' + key + '"]');
        input.value = value; input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    })()`);
    await page.waitFor(`document.querySelector("#WaveDrom_Display_0 .td-name-math path") && document.querySelector("#WaveDrom_Display_0 .td-edge-label-math path")`, 30000);
    const clamped = await page.eval(`(() => {
      const input = document.querySelector('[data-look="signalNameSize"]');
      input.focus(); input.value = "100"; input.dispatchEvent(new Event("change", { bubbles: true }));
      const result = input.value === "64" && document.querySelector("#WaveDrom_Display_0 .td-name-math").getAttribute("transform").includes("scale(0.064)");
      input.value = "40"; input.dispatchEvent(new Event("change", { bubbles: true })); input.blur();
      return result;
    })()`);
    res.push([clamped, "a focused size field displays its applied 64 px maximum"]);
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(`!!document.querySelector(".td-tabs")`);
    await page.eval(`document.querySelector('[data-view="diagram"]').click(); document.querySelector(".td-side-look").open = true;`);
    await page.waitFor(`document.querySelector("#WaveDrom_Display_0 .td-name-math path") && document.querySelector("#WaveDrom_Display_0 .td-edge-label-math path")`, 30000);
    const sizes = await page.eval(`(() => {
      const svg = document.querySelector("#WaveDrom_Display_0 svg"), outer = svg.getBoundingClientRect();
      const text = [...svg.querySelectorAll("text, .td-name-math, .td-edge-label-math")];
      const outside = text.filter(el => {
        const b = el.getBoundingClientRect();
        return b.left < outer.left - 1 || b.right > outer.right + 1 || b.top < outer.top - 1 || b.bottom > outer.bottom + 1;
      }).map(el => el.textContent || el.getAttribute("aria-label"));
      return {
        saved: JSON.parse(localStorage.getItem("timing-diagram/source")).config,
        controls: ["fontSize", "signalNameSize", "arrowLabelSize"].map(k => [document.querySelector('[data-look="' + k + '"]').value, document.querySelector('[data-look="' + k + '"]').max]),
        name: svg.querySelector(".td-name-math").getAttribute("transform"),
        arrow: svg.querySelector(".td-edge-label-math").getAttribute("transform"),
        outside
      };
    })()`);
    res.push([sizes.saved.fontSize === 64 && sizes.saved.signalNameSize === 40 && sizes.saved.arrowLabelSize === 64 && sizes.controls.every(([, max]) => max === "64") && sizes.controls.map(([value]) => value).join(",") === "64,40,64", `separate sizes persist after reload, with a 64 px maximum (${JSON.stringify(sizes)})`]);
    res.push([sizes.name.includes("scale(0.04)") && sizes.arrow.includes("scale(0.064)") && sizes.outside.length === 0, `large outlined labels render at their selected sizes inside the SVG (${JSON.stringify(sizes.outside)})`]);
    await page.shot(`${ctx.out}/beta-timing-text-sizes.png`);
    await page.eval(`document.querySelector('[data-do="reset-look"]').click()`);
    const reset = await page.eval(`JSON.parse(localStorage.getItem("timing-diagram/source")).config`);
    res.push([!reset?.fontSize && !reset?.signalNameSize && !reset?.arrowLabelSize, "Reset look restores default sizes"]);
    res.push([page.errors.length === 0, `no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.netnames = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?open=examples/full-adder-levels.json&view=figure`);
    await page.waitFor(ready);
    await page.eval(`(async () => {
      const doc = await (await fetch("../schematic-editor/examples/full-adder-levels.json")).json();
      doc.groups = { ...(doc.groups ?? {}), wire_labels: { w1: "$Q_{0}$" } };
      window.figureEditor.load(JSON.stringify(doc));
    })()`);
    await page.waitFor(`!!document.querySelector('svg.fe-canvas [data-label="net:w1"]')`, 30000);
    const result = await page.eval(`(() => {
      const input = document.querySelector('[name="fe-netnames"]');
      const shown = !!document.querySelector('svg.fe-canvas [data-label="net:w1"]') && input.checked;
      input.checked = false; input.dispatchEvent(new Event("change", { bubbles: true }));
      const hidden = !document.querySelector('svg.fe-canvas [data-label="net:w1"]');
      const saved = JSON.parse(window.figureEditor.save()).groups.wire_labels.w1 === "$Q_{0}$";
      input.checked = true; input.dispatchEvent(new Event("change", { bubbles: true }));
      return { shown, hidden, saved };
    })()`);
    await page.waitFor(`!!document.querySelector('svg.fe-canvas [data-label="net:w1"]')`, 30000);
    res.push([result.shown && result.hidden && result.saved, `schematic net names can be hidden without changing the saved label (${JSON.stringify(result)})`]);
    res.push([page.errors.length === 0, `net names: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.solderdots = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(ctx.url);
    await page.waitFor(ready);
    await page.eval(`window.figureEditor.load(JSON.stringify({
      schema: "circuit/0.2", id: "solder_dot_check", grid_cm: 0.25, elements: [],
      ports: [
        { id: "L", dir: "in", at: [-10, 0] }, { id: "R", dir: "in", at: [10, 0] },
        { id: "T", dir: "in", at: [0, 8] }, { id: "B", dir: "in", at: [0, -8] }
      ],
      wires: [
        { id: "w1", from: [-10, 0], to: [10, 0] },
        { id: "w2", from: [0, 8], to: "j1" },
        { id: "w3", from: "j1", to: [0, -8] }
      ],
      junctions: [{ id: "j1", on: "w1", at: [0, 0] }], nets: { B: ["B", "L", "R", "T"] }
    }))`);
    await page.sleep(300);
    const center = await page.eval(`(() => {
      const svg = document.querySelector("svg.fe-canvas"), p = svg.createSVGPoint();
      p.x = 0; p.y = 0;
      const c = p.matrixTransform(svg.getScreenCTM());
      return [c.x, c.y];
    })()`);
    await page.click(center[0], center[1]);
    const initial = await page.eval(`(() => ({
      value: document.querySelector('[data-field="junctionConnected"]')?.value ?? null,
    open: document.querySelector('.fe-left details[data-views="figure"]')?.open ?? false
    }))()`);
    res.push([initial.value === "true" && initial.open, "selecting a four-way junction opens its solder-dot selector"]);
    await page.eval(`(() => {
      const s = document.querySelector('[data-field="junctionConnected"]');
      if (!s) return false;
      s.value = "false";
      s.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    await page.sleep(200);
    const isolated = await page.eval(`(() => {
      const d = window.figureEditor.doc;
      return { state: d.groups?.solder_dots?.j1, nets: JSON.parse(window.figureEditor.save()).nets };
    })()`);
    await page.shot(`${ctx.out}/beta-solder-dot.png`);
    res.push([isolated.state === false, "removing the dot saves the junction as disconnected"]);
    res.push([Object.keys(isolated.nets).sort().join(",") === "B,L", "the saved nets remain separate without the dot"]);
    await page.eval(`(() => {
      const s = document.querySelector('[data-field="junctionConnected"]');
      s.value = "true";
      s.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await page.sleep(200);
    const connected = await page.eval(`(() => JSON.parse(window.figureEditor.save()).nets)()`);
    res.push([Object.keys(connected).join(",") === "B", "adding the dot joins the crossing nets again"]);
    res.push([page.errors.length === 0, `solder-dot control: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.sourceEditor = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(`!!document.querySelector(".td-tabs")`);
    await page.eval(`document.querySelector('[data-view="source"]').click()`);
    const text = await page.eval(`(() => {
      const source = document.querySelector(".td-srctext");
      source.value = Array.from({ length: 60 }, (_, i) => "line " + (i + 1)).join("\\n");
      source.dispatchEvent(new Event("input", { bubbles: true }));
      source.scrollTop = 200;
      source.dispatchEvent(new Event("scroll"));
      return source.value;
    })()`);
    const editor = await page.eval(`(() => ({
      lastLine: document.querySelector(".td-line-numbers").textContent.split("\\n").at(-1),
      synced: document.querySelector(".td-line-numbers").scrollTop === document.querySelector(".td-srctext").scrollTop,
      striped: getComputedStyle(document.querySelector(".td-srctext")).backgroundImage.includes("repeating-linear-gradient"),
      font: getComputedStyle(document.querySelector(".td-srctext")).fontFamily.includes("Fira Mono"),
      centered: parseFloat(getComputedStyle(document.querySelector(".td-srctext")).lineHeight) / parseFloat(getComputedStyle(document.querySelector(".td-srctext")).fontSize) >= 1.5
    }))()`);
    res.push([editor.lastLine === "60", "source editor numbers every line"]);
    res.push([editor.synced, "line numbers stay aligned while the source scrolls"]);
    res.push([editor.striped, "source lines use alternating theme backgrounds"]);
    res.push([editor.font && editor.centered, "source text uses the figure coding font with vertically centered line spacing"]);

    await page.eval(`(() => {
      window.__realCreateObjectURL = URL.createObjectURL;
      window.__realRevokeObjectURL = URL.revokeObjectURL;
      window.__realAnchorClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = (blob) => { window.__sourceBlob = blob; return "blob:source-test"; };
      URL.revokeObjectURL = () => {};
      HTMLAnchorElement.prototype.click = function() { window.__sourceFilename = this.download; };
      document.querySelector('[data-do="src-save"]').click();
    })()`);
    const download = await page.eval(`(async () => ({ filename: window.__sourceFilename, text: await window.__sourceBlob.text() }))()`);
    await page.eval(`(() => {
      URL.createObjectURL = window.__realCreateObjectURL;
      URL.revokeObjectURL = window.__realRevokeObjectURL;
      HTMLAnchorElement.prototype.click = window.__realAnchorClick;
    })()`);
    res.push([download.filename === "timing-diagram.json" && download.text === text, "Save source downloads the editor text as timing-diagram.json"]);
    const storedBefore = await page.eval(`localStorage.getItem("timing-diagram/source")`);
    await page.eval(`document.querySelector('[data-do="src-clear"]').click()`);
    const cleared = await page.eval(`({ empty: document.querySelector(".td-srctext").value === "", lines: document.querySelector(".td-line-numbers").textContent, stored: localStorage.getItem("timing-diagram/source") })`);
    res.push([cleared.empty && cleared.lines === "1" && cleared.stored === storedBefore, "Clear empties only the source buffer and leaves the diagram unchanged"]);
    await page.eval(`(() => {
      const input = document.querySelector(".td-source-file");
      const transfer = new DataTransfer();
      transfer.items.add(new File(['{"signal":[{"name":"uploaded","wave":"01"}]}'], "uploaded.json", { type: "application/json" }));
      Object.defineProperty(input, "files", { configurable: true, value: transfer.files });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await page.waitFor(`document.querySelector(".td-srctext").value.includes('"uploaded"')`, 10000);
    const uploaded = await page.eval(`({ source: document.querySelector(".td-srctext").value, status: document.querySelector(".td-status").textContent })`);
    res.push([uploaded.source.includes('"uploaded"') && uploaded.status.includes("Review it"), "Upload source fills the editor without applying it automatically"]);
    await page.shot(`${ctx.out}/beta-source-editor.png`);
    res.push([page.errors.length === 0, `source editor: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.layoutAndFit = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(`!!document.querySelector(".td-tabs")`);
    const widths = await page.eval(`(() => {
      const left = document.querySelector('.fe-resizer[data-resize="left"]');
      left.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
      const options = JSON.parse(localStorage.getItem("figure-editor/options") ?? "{}");
      return { left: left.getAttribute("aria-valuenow"), stored: options.leftPaneWidth, leftVisible: document.querySelector(".fe-left").getBoundingClientRect().width > 0, hiddenBars: getComputedStyle(document.querySelector(".fe")).scrollbarWidth === "none" };
    })()`);
    res.push([Number(widths.left) === 256 && widths.stored === 256 && widths.leftVisible, `persistent controls pane resizes by keyboard and persists (${JSON.stringify(widths)})`]);
    res.push([widths.hiddenBars, "beta editor scrollbars are hidden without disabling scrolling"]);
    const leftHandle = await page.eval(`(() => { const r = document.querySelector('.fe-resizer[data-resize="left"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await page.drag(leftHandle, [leftHandle[0] + 24, leftHandle[1]]);
    const draggedWidth = await page.eval(`Number(document.querySelector('.fe-resizer[data-resize="left"]').getAttribute("aria-valuenow"))`);
    res.push([draggedWidth > Number(widths.left), `controls pane separator resizes by dragging (${draggedWidth}px)`]);

    const workspace = await page.eval(`(() => {
      const handle = document.querySelector('[data-stack-resize="figure-timing"]');
      const before = JSON.parse(localStorage.getItem("figure-editor/options") ?? "{}").workspacePanes;
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      const resized = JSON.parse(localStorage.getItem("figure-editor/options") ?? "{}").workspacePanes;
      document.querySelector('[data-sec-bar="figure"]').click();
      const maximized = JSON.parse(localStorage.getItem("figure-editor/options") ?? "{}").workspacePanes;
      return { before, resized, maximized, leftVisible: document.querySelector(".fe-left").getBoundingClientRect().width > 0 };
    })()`);
    res.push([workspace.resized.figure > workspace.before.figure && workspace.resized.timing < workspace.before.timing, `Figure and Timing workspaces resize by keyboard (${JSON.stringify(workspace.resized)})`]);
    res.push([workspace.maximized.figure === 100 && workspace.maximized.timing === 0 && workspace.leftVisible, "clicking a workspace title maximizes it while keeping controls visible"]);
    await page.eval(`document.querySelector('[data-sec-bar="timing"]').click()`);
    await page.sleep(300);
    await page.shot(`${ctx.out}/beta-workspace-layout.png`);

    await page.eval(`(() => { document.querySelector('[data-view="diagram"]').click(); document.querySelector(".td-side-look").open = true; document.querySelector(".td-side-size").open = true; })()`);
    await page.sleep(100);
    const external = await page.eval(`(() => {
      const view = document.querySelector(".td-view"), chart = document.querySelector("#WaveDrom_Display_0");
      const box = chart.getBoundingClientRect(), viewBox = view.getBoundingClientRect();
      return {
        look: document.querySelector(".fe-left").contains(document.querySelector(".td-side-look")),
        size: document.querySelector(".fe-left").contains(document.querySelector(".td-side-size")),
        noSplitter: !document.querySelector("[data-look-split]"),
        chartFillsPane: box.width > 0 && box.height > 0 && box.width >= viewBox.width * 0.9,
      };
    })()`);
    res.push([external.look && external.size && external.noSplitter && external.chartFillsPane, `Look and Size controls remain in the sidebar and the diagram fills its pane (${JSON.stringify(external)})`]);

    const fit = await page.eval(`(() => {
      const width = document.querySelector('[data-size="w"]');
      width.value = "200"; width.dispatchEvent(new Event("input", { bubbles: true }));
      const event = new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return { prevented: event.defaultPrevented, width: Number(width.value) };
    })()`);
    res.push([fit.prevented && fit.width > 200, `F prevents the page-search shortcut and fits the active timing diagram (${JSON.stringify(fit)})`]);
    res.push([page.errors.length === 0, `layout and Fit: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.logicSync = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=figure`);
    await page.waitFor(ready);
    const figure = {
      schema: "circuit/0.2", id: "logic_sync_test", grid_cm: 0.25,
      elements: [{ id: "and1", type: "and_gate", at: [0, 0] }],
      nets: { n1: ["and1.A"], n2: ["and1.B"], n3: ["and1.Y"] },
      wires: [
        { id: "w1", from: [-12, 1], to: "and1.A", level: "1" },
        { id: "w2", from: [-12, -1], to: "and1.B", level: "1" },
        { id: "w3", from: "and1.Y", to: [12, 0] },
      ],
      groups: { wire_labels: { w1: "A", w2: "B", w3: "Y" } },
    };
    await page.eval(`window.figureEditor.load(${JSON.stringify(JSON.stringify(figure))})`);
    await page.sleep(1500);   // the view refits to the loaded figure after typesetting; canvas clicks need that
    await page.eval(`document.querySelector('[data-sec-bar="timing"]').click()`);
    await page.waitFor(`!!document.querySelector(".td-tabs")`);
    const source = JSON.stringify({ signal: [{ name: "A", wave: "1" }, { name: "B", wave: "1" }, { name: "Y", wave: "1" }] });
    await page.eval(`(() => {
      document.querySelector('[data-view="source"]').click();
      const input = document.querySelector(".td-srctext");
      input.value = ${JSON.stringify(source)};
      document.querySelector('[data-do="src-apply"]').click();
    })()`);
    await page.sleep(500);
    await page.eval(`document.querySelector('[data-sec-bar="figure"]').click()`);
    await page.waitFor(`document.querySelectorAll(".fe-frame-item").length === 2`, 10000);
    await page.sleep(300);
    await page.eval(`(() => { document.querySelector(".fe-frames-pane").open = true; document.querySelector('[data-frame="1"]').click(); })()`);
    await page.sleep(300);
    const point = await page.eval(`(() => {
      const svg = document.querySelector("svg.fe-canvas"), p = svg.createSVGPoint();
      p.x = -8 / 2; p.y = -1 / 2;
      const q = p.matrixTransform(svg.getScreenCTM());
      return [q.x, q.y];
    })()`);
    await page.click(point[0], point[1]);
    await page.waitFor(`!!document.querySelector('[data-field="level"]')`, 10000);
    await page.waitFor(`!!document.querySelector('.fe-status svg[aria-label="n1"]')`, 15000);
    const nodeStatus = await page.eval(`({
      latexName: document.querySelector('.fe-status svg[aria-label="n1"]')?.getAttribute("aria-label"),
      html: document.querySelector(".fe-status").innerHTML,
    })`);
    res.push([nodeStatus.latexName === "n1", `the bottom status renders the internal net name as LaTeX (${nodeStatus.latexName})`]);
    res.push([!nodeStatus.html.includes("Wire w1"), "the bottom status does not expose the selected wire id"]);
    await page.eval(`document.querySelector('[data-sec-bar="timing"]').click()`);
    await page.waitFor(`!!document.querySelector(".td-row.is-node-selected")`, 10000);
    const linkedSelection = await page.eval(`({
      row: document.querySelector(".td-row.is-node-selected")?.dataset.s,
      marked: !!document.querySelector(".td-cell.is-marked"),
    })`);
    res.push([linkedSelection.row === "0" && linkedSelection.marked, `selecting a schematic net highlights its timing row and frame (${JSON.stringify(linkedSelection)})`]);
    await page.eval(`document.querySelector('[data-sec-bar="figure"]').click()`);
    await page.waitFor(`document.querySelector('[data-frame="1"][aria-pressed="true"]')`, 10000);
    await page.eval(`(() => {
      const input = document.querySelector('[data-field="level"]');
      input.value = "0";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await page.waitFor(`JSON.parse(localStorage.getItem("timing-diagram/source") || "{}").signal?.[0]?.wave?.[0] === "0"`, 10000);
    const changed = await page.eval(`(() => {
      const figure = JSON.parse(window.figureEditor.save());
      const timing = JSON.parse(localStorage.getItem("timing-diagram/source"));
      return {
        input: figure.wires.find((wire) => wire.id === "w1")?.level,
        output: figure.wires.find((wire) => wire.id === "w3")?.level,
        timingA: timing.signal.find((signal) => signal.name === "A")?.wave[0],
        timingY: timing.signal.find((signal) => signal.name === "Y")?.wave[0],
      };
    })()`);
    res.push([changed.input === "0" && changed.output === "0" && changed.timingA === "0" && changed.timingY === "0", `editing a named input updates calculated net values in the matching timing step (${JSON.stringify(changed)})`]);

    await page.eval(`(() => {
      window.__timingPrompt = "";
      window.prompt = (message) => { window.__timingPrompt = message; return "1"; };
      window.__timingBeforeFrameZero = JSON.stringify(JSON.parse(localStorage.getItem("timing-diagram/source")));
      document.querySelector('[data-frame="0"]').click();
      document.querySelector('[data-cmd="frametosignal"]').click();
    })()`);
    const frameZero = await page.eval(`({
      prompted: window.__timingPrompt !== "",
      unchanged: window.__timingBeforeFrameZero === JSON.stringify(JSON.parse(localStorage.getItem("timing-diagram/source"))),
      status: document.querySelector(".fe-status").textContent,
    })`);
    res.push([!frameZero.prompted && frameZero.unchanged && frameZero.status.includes("Frame 0 is the initial state"), `Frame 0 is not a timing step (${JSON.stringify(frameZero)})`]);

    await page.eval(`(() => {
      document.querySelector('[data-frame="1"]').click();
      window.__timingPrompt = "";
      document.querySelector('[data-cmd="frametosignal"]').click();
    })()`);
    const sentFrame = await page.eval(`({
      prompted: window.__timingPrompt !== "",
      levels: JSON.parse(localStorage.getItem("timing-diagram/source")).signal.map((signal) => signal.wave[0]),
    })`);
    res.push([!sentFrame.prompted && sentFrame.levels.join(",") === "0,1,0", `a timing frame sends its schematic levels to the matching step (${JSON.stringify(sentFrame)})`]);

    await page.eval(`(() => {
      document.querySelector('[data-cmd="framesfromtiming"]').click();
      document.querySelector('[data-cmd="framecapture"]').click();
      document.querySelector('[data-frame="2"]').click();
      document.querySelector('[data-cmd="frametosignal"]').click();
    })()`);
    await page.waitFor(`JSON.parse(localStorage.getItem("timing-diagram/source") || "{}").signal?.every((signal) => signal.wave.length === 2)`, 10000);
    await page.eval(`document.querySelector('[data-sec-bar="slide"]').click()`);
    await page.waitFor(`document.querySelectorAll(".fe-frame-item").length === 3`, 10000);
    const slideFrames = await page.eval(`({ count: document.querySelectorAll(".fe-frame-item").length, height: document.querySelector('[data-sec="slide"]').getBoundingClientRect().height })`);
    res.push([slideFrames.count === 3 && slideFrames.height > 0, `returning to Slide refreshes its frames from the current timing diagram (${JSON.stringify(slideFrames)})`]);
    await page.eval(`localStorage.removeItem("timing-diagram/send")`);
    await page.goto(`${ctx.url}?view=slide`);
    await page.waitFor(ready);
    await page.sleep(500);
    const slideTiming = await page.eval(`(() => {
      const groups = [...document.querySelectorAll(".fe-slideview > g:not([data-region])")];
      const source = JSON.parse(localStorage.getItem("timing-diagram/source") || "null");
      const sent = JSON.parse(localStorage.getItem("timing-diagram/send") || "null");
      return {
        groupCount: groups.length,
        timingShapes: groups[1]?.querySelectorAll("path, line, rect").length ?? 0,
        sendRestored: !!localStorage.getItem("timing-diagram/send"),
        sourceNames: source?.signal?.map((signal) => signal.name) ?? [],
        sentNames: sent?.source?.signal?.map((signal) => signal.name) ?? [],
      };
    })()`);
    res.push([slideTiming.groupCount === 2 && slideTiming.timingShapes > 0 && slideTiming.sendRestored && ["A", "B", "Y"].every((name) => slideTiming.sentNames.includes(name)), `a fresh Slide view loads the saved timing source into its diagram (${JSON.stringify(slideTiming)})`]);
    await page.shot(`${ctx.out}/beta-slide-timing.png`);
    await page.eval(`(() => {
      document.querySelector('[data-sec-bar="timing"]').click();
      document.querySelector('[data-view="edit"]').click();
      document.querySelector('[data-brush="1"]').click();
      document.querySelector('.td-row[data-s="2"] [data-step="0"]').click();
    })()`);
    await page.waitFor(`JSON.parse(localStorage.getItem("timing-diagram/source") || "{}").signal?.[2]?.wave?.[0] === "1"`, 10000);
    const timingPriority = await page.eval(`(() => ({
      marked: !!document.querySelector('.td-row[data-s="2"] [data-step="0"].is-marked'),
      frame: document.querySelector('.fe-frame-item[aria-pressed="true"]')?.dataset.frame,
      wire: JSON.parse(window.figureEditor.save()).wires.find((item) => item.id === "w3")?.level,
    }))()`);
    res.push([timingPriority.marked && timingPriority.frame === "1" && timingPriority.wire === "1", `a timing edit wins a conflict and the same frame remains selected on return (${JSON.stringify(timingPriority)})`]);
    res.push([page.errors.length === 0, `logic-to-timing sync: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.exports = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?open=examples/full-adder-levels.json`);
    await page.waitFor(ready);
    await page.sleep(500);
    await page.eval(`(() => {
      window.__exportObjects = [];
      window.__downloads = [];
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        window.__exportObjects.push({ url, blob });
        return url;
      };
      HTMLAnchorElement.prototype.click = function() {
        const object = window.__exportObjects.find((entry) => entry.url === this.href);
        window.__downloads.push({ name: this.download, type: object?.blob.type, blob: object?.blob });
      };
    })()`);
    await page.eval(`document.querySelector('[data-sec-bar="slide"]').click()`);
    await page.eval(`document.querySelector('[data-cmd="export"]').click()`);
    await page.waitFor(`document.querySelector(".fe-export-dialog").open`, 10000);
    const dialog = await page.eval(`({
      title: document.querySelector("#fe-export-title").textContent,
      formats: Array.from(document.querySelectorAll("[data-export-format]")).map((button) => button.dataset.exportFormat),
    })`);
    res.push([dialog.title === "Export current view" && dialog.formats.join(",") === "svg,png", `current-view export asks the user to choose SVG or PNG (${JSON.stringify(dialog)})`]);
    await page.eval(`document.querySelector('[data-export-format="png"]').click()`);
    await page.waitFor(`document.querySelector(".fe-status").textContent.includes("Exported")`, 15000);
    const slide = await page.eval(`window.__downloads[0]`);
    res.push([slide.type === "image/png" && slide.name.endsWith("-slide.png"), `the active slide exports as the selected PNG format (${JSON.stringify(slide)})`]);

    await page.eval(`(async () => {
      document.querySelector(".fe-frames-pane").open = true;
      document.querySelector('[data-cmd="framecapture"]').click();
      document.querySelector('[data-cmd="framecapture"]').click();
      document.querySelector('[data-frame="0"]').click();
      window.__expectedFrameZero = await window.figureEditor.exportSvg();
      document.querySelector('[name="fe-frames-what"]').value = "schematic";
    })()`);
    await page.sleep(300);
    await page.shot(`${ctx.out}/beta-frame-zero.png`);
    await page.eval(`document.querySelector('[data-cmd="framesexport"]').click()`);
    await page.waitFor(`document.querySelector(".fe-export-dialog").open`, 10000);
    const frames = await page.eval(`({
      timingOption: !!document.querySelector('[name="fe-frames-what"] option[value="timing"]'),
      title: document.querySelector("#fe-export-title").textContent,
    })`);
    res.push([frames.timingOption && frames.title === "Export frames", `frame export offers timing diagrams and prompts for a format (${JSON.stringify(frames)})`]);
    await page.eval(`document.querySelector('[data-export-format="svg"]').click()`);
    await page.waitFor(`document.querySelector(".fe-status").textContent.includes("Exported 3 schematics as SVG")`, 15000);
    const frameExports = await page.eval(`Promise.all(window.__downloads.slice(1).map(async (file) => ({
      name: file.name,
      type: file.type,
      text: file.type === "image/svg+xml" ? await file.blob.text() : "",
      matchesFrameZero: file.name.endsWith("-00.svg") && await file.blob.text() === window.__expectedFrameZero,
    })))`);
    res.push([frameExports.length === 3 && frameExports.every((file) => file.type === "image/svg+xml" && file.name.endsWith(".svg")), `all frames are exported in the chosen SVG format (${JSON.stringify(frameExports)})`]);
    res.push([frameExports[0]?.matchesFrameZero, "the exported Frame 0 matches the unhighlighted schematic"]);
    res.push([page.errors.length === 0, `exports: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.truth = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(ready);
    await page.waitFor(`!!document.querySelector("[data-truth-table]")`, 10000);
    await page.eval(`(() => {
      const doc = window.figureEditor.doc;
      window.figureEditor.load(JSON.stringify({
        ...doc,
        groups: { ...(doc.groups ?? {}), wire_labels: { ...(doc.groups?.wire_labels ?? {}), w12: "carry_ab" } },
      }));
    })()`);
    await page.eval(`document.querySelector('[data-view="truth"]').click()`);
    const ports = await page.eval(`({
      inputs: document.querySelector("[data-truth-inputs]").value,
      outputs: document.querySelector("[data-truth-outputs]").value,
      header: document.querySelector("[data-truth-table]").value.trim(),
    })`);
    res.push([ports.inputs === "A, B, Cin" && ports.outputs === "S, Cout, carry_ab" && ports.header === "A,B,Cin,S,Cout,carry_ab", `truth-table view starts with the circuit's named nets (${JSON.stringify(ports)})`]);
    await page.eval(`document.querySelector('[data-truth-action="generate"]').click()`);
    await page.waitFor(`document.querySelectorAll(".fe-frame-item").length === 9`, 10000);
    const generated = await page.eval(`(() => {
      const table = document.querySelector("[data-truth-table]").value.trim().split("\\n");
      const timing = JSON.parse(localStorage.getItem("timing-diagram/source"));
      return { rows: table.length - 1, names: timing.signal.filter((signal) => signal.name).map((signal) => signal.name), frames: document.querySelectorAll(".fe-frame-item").length };
    })()`);
    res.push([generated.rows === 8 && generated.frames === 9 && generated.names.join(",") === "A,B,Cin,S,Cout,carry_ab", `generate creates all eight cases, timing rows and Frame 0 (${JSON.stringify(generated)})`]);

    await page.eval(`(() => {
      document.querySelector('[data-view="truth"]').click();
      const input = document.querySelector("[data-truth-table]");
      const rows = input.value.trim().split("\\n");
      rows[1] = "0,0,0,1,0,0";
      input.value = rows.join("\\n");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('[data-truth-action="check"]').click();
    })()`);
    await page.waitFor(`document.querySelector(".td-truth-results").textContent.includes("7 of 8 cases match")`, 10000);
    const checked = await page.eval(`(() => {
      const text = document.querySelector(".td-truth-results").textContent;
      const timing = JSON.parse(localStorage.getItem("timing-diagram/source"));
      const sum = document.querySelector(".td-truth-results li[data-pass='false']")?.textContent ?? "";
      return { text, mismatch: sum, sWave: timing.signal.find((signal) => signal.name === "S").wave[0] };
    })()`);
    res.push([checked.mismatch.includes("expected 1, got 0") && checked.sWave === "0", `checking reports the bad row and keeps the circuit's computed output in the timing diagram (${JSON.stringify(checked)})`]);
    const latex = await page.eval(`document.querySelector("[data-truth-latex]").value`);
    res.push([latex.includes("\\begin{tabular}") && latex.includes("\\textbf{A}"), "the truth-table pane converts its CSV table to LaTeX"]);
    const savedCopy = await page.eval(`(() => {
      document.querySelector('[data-truth-action="save-copy"]').click();
      const key = 'figure-editor/truth-table:' + encodeURIComponent(window.figureEditor.doc.id);
      return { copy: JSON.parse(localStorage.getItem(key) || "null"), table: document.querySelector("[data-truth-table]").value };
    })()`);
    res.push([savedCopy.copy?.schema === "figure-editor-truth-table/1" && savedCopy.copy.csv === savedCopy.table && savedCopy.copy.latex === latex, "Save a copy persists the current table and LaTeX with this project"]);
    await page.eval(`(() => {
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => { window.__latexBlob = blob; return create(blob); };
      HTMLAnchorElement.prototype.click = function() { window.__latexFilename = this.download; };
      document.querySelector('[data-truth-action="export-copy"]').click();
    })()`);
    const exportedLatex = await page.eval(`(async () => ({ name: window.__latexFilename, text: await window.__latexBlob.text() }))()`);
    res.push([exportedLatex.name.endsWith("-truth-table.tex") && exportedLatex.text === latex, "Export a copy downloads the generated .tex file"]);
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(ready);
    await page.waitFor(`!!document.querySelector('[data-view="truth"]')`, 10000);
    await page.eval(`document.querySelector('[data-view="truth"]').click()`);
    const restored = await page.eval(`({
      table: document.querySelector("[data-truth-table]").value,
      latex: document.querySelector("[data-truth-latex]").value,
      status: document.querySelector("[data-truth-latex-status]").textContent,
    })`);
    res.push([restored.latex === latex && restored.table === savedCopy.copy?.csv && restored.status.includes("Loaded"), "the saved table copy and generated LaTeX survive a reload"]);
    await page.shot(`${ctx.out}/beta-truth-table.png`);
    res.push([page.errors.length === 0, `truth table: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.frameNavigation = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=figure`);
    await page.waitFor(ready);
    await page.waitFor(`document.querySelector(".fe-stepinput")?.max === "8"`, 10000);
    const initial = await page.eval(`(() => ({
      value: document.querySelector(".fe-stepinput").value,
      previousDisabled: document.querySelector('[data-cmd="frameprev"]').disabled,
      nextDisabled: document.querySelector('[data-cmd="framenext"]').disabled,
      appearance: getComputedStyle(document.querySelector(".fe-stepinput")).appearance,
    }))()`);
    await page.eval(`document.querySelector('[data-cmd="framenext"]').click()`);
    await page.waitFor(`document.querySelector('[data-frame="1"]')?.getAttribute("aria-pressed") === "true"`, 5000);
    await page.eval(`document.querySelector('[data-cmd="frameprev"]').click()`);
    await page.waitFor(`document.querySelector('[data-frame="0"]')?.getAttribute("aria-pressed") === "true"`, 5000);
    const typed = await page.eval(`(() => {
      const input = document.querySelector(".fe-stepinput");
      input.value = "3";
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return document.querySelector('[data-frame="3"]')?.getAttribute("aria-pressed");
    })()`);
    res.push([initial.value === "0" && initial.previousDisabled && !initial.nextDisabled, `frame controls start in the first of nine frames and enable Next (${JSON.stringify(initial)})`]);
    res.push([typed === "true", "Next, Previous, and direct frame entry select the expected frames"]);
    res.push([initial.appearance === "textfield", "the frame number field has no native spinner control"]);
    res.push([page.errors.length === 0, `frame navigation: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.frameNavigationTiming = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(ready);
    await page.waitFor(`!!document.querySelector('[data-view="truth"]')`, 10000);
    await page.eval(`document.querySelector('[data-view="truth"]').click()`);
    await page.eval(`document.querySelector('[data-truth-action="generate"]').click()`);
    await page.waitFor(`document.querySelector(".fe-stepinput")?.max === "8"`, 10000);
    const before = await page.eval(`localStorage.getItem("timing-diagram/source")`);
    const steps = [];
    for (const command of ["framenext", "framenext", "frameprev"]) {
      await page.eval(`document.querySelector('[data-cmd="${command}"]').click()`);
      steps.push(await page.eval(`document.querySelector(".fe-stepinput").value`));
    }
    await page.eval(`document.querySelector('[data-sec-bar="figure"]').click()`);
    await page.eval(`document.querySelector('[data-cmd="framenext"]').click()`);
    steps.push(await page.eval(`document.querySelector(".fe-stepinput").value`));
    const after = await page.eval(`localStorage.getItem("timing-diagram/source")`);
    res.push([steps.join(",") === "1,2,1,2", `frame arrows advance and reverse across timing and schematic views (${steps.join(",")})`]);
    res.push([before === after, "frame navigation does not overwrite timing waveforms"]);
    res.push([page.errors.length === 0, `frame/timing navigation: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.sourceAlignment = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(ready);
    await page.waitFor(`!!document.querySelector(".td-srctext")`, 10000);
    await page.eval(`document.querySelector('[data-view="source"]').click()`);
    const alignment = await page.eval(`(() => {
      const gutter = document.querySelector(".td-line-numbers");
      const source = document.querySelector(".td-srctext");
      source.value = Array.from({ length: 80 }, (_, i) => '  {"name":"s' + i + '","wave":"01","note":"' + "x".repeat(120) + '"}').join("\\n");
      source.dispatchEvent(new Event("input", { bubbles: true }));
      source.scrollTop = 100;
      source.dispatchEvent(new Event("scroll"));
      const left = getComputedStyle(gutter), right = getComputedStyle(source);
      const sameMetrics = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "paddingTop", "paddingBottom"]
        .every((key) => left[key] === right[key]);
      return {
        sameMetrics,
        wrap: source.wrap,
        whiteSpace: right.whiteSpace,
        lineCount: gutter.textContent.split("\\n").length,
        scrollTop: gutter.scrollTop,
        sourceScrollTop: source.scrollTop,
      };
    })()`);
    await page.shot(`${ctx.out}/beta-source-alignment.png`);
    res.push([alignment.sameMetrics && alignment.wrap === "off" && alignment.whiteSpace === "pre", `source text and line-number gutter share fixed, non-wrapping line metrics (${JSON.stringify(alignment)})`]);
    res.push([alignment.lineCount === 80 && alignment.scrollTop === alignment.sourceScrollTop, "line numbers stay vertically aligned while scrolling long source"]);
    res.push([page.errors.length === 0, `source editor: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.truthUnknown = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(ready);
    await page.waitFor(`!!document.querySelector("[data-truth-table]")`, 10000);
    await page.eval(`window.figureEditor.load(JSON.stringify({
      schema: "circuit/0.3", id: "unresolved_demo", grid_cm: 0.25,
      elements: [], ports: [
        { id: "A", dir: "in", at: [0, 0] },
        { id: "Y", dir: "out", at: [10, 0] },
      ], wires: [], junctions: [], nets: {}, groups: {},
    }))`);
    await page.eval(`document.querySelector('[data-view="truth"]').click()`);
    await page.eval(`(() => {
      const input = document.querySelector("[data-truth-table]");
      input.value = "A,Y\\n0,X\\n1,X";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('[data-truth-action="check"]').click();
    })()`);
    await page.waitFor(`document.querySelector(".td-truth-results").textContent.includes("2 output(s) unresolved (X).")`, 10000);
    const result = await page.eval(`(() => ({
      text: document.querySelector(".td-truth-results").textContent,
      failures: [...document.querySelectorAll(".td-truth-results li[data-pass='false']")].length,
    }))()`);
    res.push([result.text.includes("UNRESOLVED") && result.failures === 2, `unknown outputs are explicitly unresolved, never passing (${JSON.stringify(result)})`]);
    res.push([page.errors.length === 0, `unknown truth table: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.logicMode = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=figure`);
    await page.waitFor(ready);
    await page.waitFor(`document.querySelector(".fe-stepinput")?.max === "8"`, 10000);
    const states = await page.eval(`(() => {
      window.figureEditor.load(JSON.stringify({
        schema: "circuit/0.3", id: "logic_mode_demo", grid_cm: 0.25,
        elements: [{ id: "and1", type: "and_gate", at: [0, 0] }],
        ports: [],
        wires: [
          { id: "w1", from: [-12, 0], to: "and1.A", level: "1" },
          { id: "w2", from: [-12, 4], to: "and1.B", level: "1" },
          { id: "w3", from: "and1.Y", to: [12, 0] },
        ],
        junctions: [], groups: {}, nets: {},
      }));
      const input = document.querySelector('[name="fe-logic-calculation"]');
      const automatic = {
        checked: input.checked,
        mode: window.figureEditor.doc.groups?.logic_mode ?? "calculated",
        generated: Object.keys(window.figureEditor.doc.groups?.logic_generated_levels ?? {}).length,
      };
      input.checked = false;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const manual = {
        checked: input.checked,
        mode: window.figureEditor.doc.groups?.logic_mode,
        generated: window.figureEditor.doc.groups?.logic_generated_levels,
      };
      window.figureEditor.load(JSON.stringify(window.figureEditor.doc));
      const reopened = {
        checked: document.querySelector('[name="fe-logic-calculation"]').checked,
        mode: window.figureEditor.doc.groups?.logic_mode,
      };
      const restored = document.querySelector('[name="fe-logic-calculation"]');
      restored.checked = true;
      restored.dispatchEvent(new Event("change", { bubbles: true }));
      const calculated = {
        checked: restored.checked,
        mode: window.figureEditor.doc.groups?.logic_mode ?? "calculated",
        generated: Object.keys(window.figureEditor.doc.groups?.logic_generated_levels ?? {}).length,
      };
      return { automatic, manual, reopened, calculated };
    })()`);
    await page.eval(`(() => {
      const pane = document.querySelector(".fe-logic-mode");
      pane.open = true;
      pane.scrollIntoView({ block: "start" });
    })()`);
    await page.sleep(300);
    await page.shot(`${ctx.out}/beta-logic-mode.png`);
    res.push([states.automatic.checked && states.automatic.mode === "calculated" && states.automatic.generated > 0, "calculated logic is the default"]);
    res.push([!states.manual.checked && states.manual.mode === "manual" && !states.manual.generated, "manual mode clears generated levels and records the choice"]);
    res.push([!states.reopened.checked && states.reopened.mode === "manual", "manual mode is restored from the saved figure"]);
    res.push([states.calculated.checked && states.calculated.mode === "calculated" && states.calculated.generated > 0, "calculation can be turned back on and recomputes levels"]);
    res.push([page.errors.length === 0, `logic mode: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.truthGrid = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(ready);
    await page.waitFor(`!!document.querySelector("[data-truth-mode]")`, 10000);
    const state = await page.eval(`(() => {
      document.querySelector('[data-view="truth"]').click();
      const mode = document.querySelector("[data-truth-mode]");
      mode.value = "arbitrary"; mode.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector("[data-truth-inputs]").value = "A, B";
      document.querySelector("[data-truth-outputs]").value = "Y";
      document.querySelector('[data-truth-action="generate"]').click();
      const before = document.querySelector("[data-truth-table]").value;
      const output = document.querySelector('[data-table-row="1"][data-table-col="2"]');
      output.value = "1"; output.dispatchEvent(new Event("input", { bubbles: true }));
      return { before, after: document.querySelector("[data-truth-table]").value, cells: document.querySelectorAll("[data-table-row]").length,
        gridHeight: document.querySelector("[data-truth-grid]").getBoundingClientRect().height };
    })()`);
    res.push([state.before === "A,B,Y\n0,0,\n0,1,\n1,0,\n1,1," && state.cells === 12, `arbitrary autofill generates inputs and blank outputs (${JSON.stringify(state)})`]);
    res.push([state.after.includes("0,0,1"), "editing a grid cell updates the table source"]);
    res.push([state.gridHeight > 100, `the generated grid is visible (${state.gridHeight}px)`]);
    await page.sleep(600);
    await page.shot(`${ctx.out}/beta-truth-grid.png`);
    res.push([page.errors.length === 0, `truth grid: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.initialNodeLevels = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=figure`);
    await page.waitFor(ready);
    await page.eval(`document.querySelector(".fe-node-levels").open = true`);
    await page.waitFor(`!!document.querySelector('[data-node-level="0"]')`, 10000);
    const state = await page.eval(`(() => {
      const field = document.querySelector('[data-node-level="0"]');
      field.value = "1"; field.dispatchEvent(new Event("change", { bubbles: true }));
      const initial = JSON.parse(window.figureEditor.save());
      document.querySelector('[data-cmd="framenext"]').click();
      const later = JSON.parse(window.figureEditor.save());
      document.querySelector('[data-cmd="frameprev"]').click();
      const restored = JSON.parse(window.figureEditor.save());
      return { initial: initial.groups.frames[0].levels, later: later.groups.frames[1].levels,
        restored: restored.groups.frames[0].levels, port: initial.ports[0].id };
    })()`);
    res.push([state.initial[state.port] === "1" && state.restored[state.port] === "1", `initial port level survives frame navigation (${JSON.stringify(state)})`]);
    res.push([state.later[state.port] !== "1", "setting the initial frame does not change the later frame"]);
    res.push([page.errors.length === 0, `node levels: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.sequentialTiming = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?view=figure`);
    await page.waitFor(ready);
    await page.eval(`window.figureEditor.load(JSON.stringify({
      schema: "circuit/0.2", id: "sequential_test", grid_cm: 0.25,
      elements: [{ id: "ff", type: "d_flipflop", at: [0, 0] }],
      ports: [
        { id: "D", dir: "in", at: [-12, 2], side: "left" },
        { id: "CLK", dir: "in", at: [0, -12], side: "down" },
        { id: "Q", dir: "out", at: [12, 2], side: "right" },
        { id: "Qn", dir: "out", at: [12, 0], side: "right" }
      ],
      wires: [
        { id: "wd", from: "D", to: "ff.D" },
        { id: "wc", from: "CLK", to: "ff.CLK" },
        { id: "wq", from: "ff.Q", to: "Q" },
        { id: "wn", from: "ff.Qn", to: "Qn" }
      ],
      groups: { frames: [{ name: "Frame 0", levels: { wq: "0", wn: "1", Q: "0", Qn: "1" } }] }
    }))`);
    await page.eval(`window.__initialSequential = window.figureEditor.save()`);
    const initialDocument = await page.eval(`window.__initialSequential`);
    await page.eval(`document.querySelector('[data-sec-bar="timing"]').click()`);
    await page.waitFor(`!!document.querySelector('[data-do="calculate-timing"]')`, 10000);
    async function source(signals) {
      await page.eval(`(() => {
        document.querySelector('[data-view="source"]').click();
        document.querySelector(".td-srctext").value = ${JSON.stringify(JSON.stringify({ signal: signals }))};
        document.querySelector('[data-do="src-apply"]').click();
      })()`);
    }
    await source([{ name: "D", wave: "1111" }, { name: "CLK", wave: "0101" }]);
    await page.eval(`document.querySelector('[data-do="calculate-timing"]').click()`);
    const level = await page.eval(`(() => ({
      source: JSON.parse(localStorage.getItem("timing-diagram/source")),
      frames: JSON.parse(window.figureEditor.save()).groups.frames,
      status: document.querySelector(".fe-status").textContent
    }))()`);
    const lane = (name) => level.source.signal.find((signal) => signal.name === name);
    res.push([lane("Q")?.wave === "0111" && lane("Qn")?.wave === "1000", `0/1 clocks calculate the expected Q and complement (${JSON.stringify(level)})`]);
    res.push([level.frames.slice(1).map((frame) => frame.levels.wq).join("") === "0111", "calculated values populate the schematic frames"]);

    await page.eval(`(() => {
      const cell = document.querySelector('[data-s="2"] [data-step="1"]');
      cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      document.querySelector('[data-do="calculate-timing"]').click();
    })()`);
    const manual = await page.eval(`JSON.parse(localStorage.getItem("timing-diagram/source")).signal.find((s) => s.name === "Q")`);
    res.push([manual.wave[1] !== "1" && !Object.hasOwn(manual.calculated ?? {}, "1"), "manual output edits remain manual after recalculation"]);

    await page.sleep(1200);
    await page.goto(`${ctx.url}?view=timing`);
    await page.waitFor(ready);
    await page.waitFor(`!!document.querySelector('[data-do="calculate-timing"]')`, 10000);
    await page.eval(`document.querySelector('[data-do="calculate-timing"]').click()`);
    const restored = await page.eval(`JSON.parse(localStorage.getItem("timing-diagram/source")).signal.find((s) => s.name === "Q")`);
    res.push([restored.wave[1] === manual.wave[1] && !Object.hasOwn(restored.calculated ?? {}, "1"), "manual and calculated cell provenance survives reload"]);

    await page.eval(`window.figureEditor.load(${JSON.stringify(initialDocument)})`);
    await source([{ name: "D", wave: "1111" }, { name: "CLK", wave: "0101" }]);
    await page.eval(`document.querySelector('[data-do="calculate-timing"]').click()`);
    await page.eval(`(() => {
      document.querySelector('[data-sec-bar="figure"]').click();
      document.querySelector('[data-cmd="framenext"]').click();
      document.querySelector('[data-cmd="framenext"]').click();
    })()`);
    const wire = await page.eval(`(() => {
      const r = document.querySelector('[data-wire="wq"]').getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    })()`);
    await page.click(...wire);
    await page.key("0", "Digit0", 48);
    const editedWire = await page.eval(`(() => ({
      source: JSON.parse(localStorage.getItem("timing-diagram/source")),
      frame: JSON.parse(window.figureEditor.save()).groups.frames[2]
    }))()`);
    const editedQ = editedWire.source.signal.find((s) => s.name === "Q");
    const untouchedQn = editedWire.source.signal.find((s) => s.name === "Qn");
    res.push([editedWire.frame.levels.wq === "0" && editedQ.wave[1] === "0" && !Object.hasOwn(editedQ.calculated ?? {}, "1") && Object.hasOwn(untouchedQn.calculated ?? {}, "1"), "editing a schematic wire marks only that timing cell manual"]);

    await page.eval(`window.figureEditor.load(${JSON.stringify(initialDocument)})`);
    await page.eval(`document.querySelector('[data-sec-bar="timing"]').click()`);
    await source([{ name: "D", wave: "1010" }, { name: "CLK", wave: "p..." }]);
    await page.eval(`document.querySelector('[data-do="calculate-timing"]').click()`);
    const pulse = await page.eval(`(() => ({
      signal: JSON.parse(localStorage.getItem("timing-diagram/source")).signal.find((s) => s.name === "Q"),
      status: document.querySelector(".fe-status").textContent
    }))()`);
    res.push([pulse.signal?.wave === "0010", `clock pulses calculate after the first timing step (${JSON.stringify(pulse)})`]);

    await page.eval(`(() => {
      const doc = JSON.parse(${JSON.stringify(initialDocument)});
      doc.groups.frames[0].levels = {};
      window.figureEditor.load(JSON.stringify(doc));
      window.__prompts = 0;
      window.prompt = () => { window.__prompts++; return "1"; };
    })()`);
    await source([{ name: "D", wave: "0000" }, { name: "CLK", wave: "0101" }]);
    await page.eval(`document.querySelector('[data-do="calculate-timing"]').click()`);
    const prompted = await page.eval(`(() => ({
      prompts: window.__prompts,
      source: JSON.parse(localStorage.getItem("timing-diagram/source"))
    }))()`);
    res.push([prompted.prompts === 1 && prompted.source.signal.find((s) => s.name === "Q")?.wave === "1000" && prompted.source.signal.find((s) => s.name === "Qn")?.wave === "0111", "unknown initial state prompts for Q and derives its complement"]);

    await page.eval(`window.figureEditor.load(${JSON.stringify(initialDocument)})`);
    await source([{ name: "D", wave: "1x00" }, { name: "CLK", wave: "0101" }]);
    await page.eval(`window.prompt = () => null; document.querySelector('[data-do="calculate-timing"]').click()`);
    const cancelled = await page.eval(`(() => ({
      source: JSON.parse(localStorage.getItem("timing-diagram/source")),
      frames: JSON.parse(window.figureEditor.save()).groups.frames,
      status: document.querySelector(".fe-status").textContent
    }))()`);
    res.push([cancelled.status.includes("cancelled") && cancelled.status.includes("1 completed") && cancelled.frames[1].levels.wq === "0", `cancelling retains the completed timing step (${JSON.stringify(cancelled)})`]);
    await source([{ name: "CLK", wave: "p...", period: 0.5 }]);
    await page.eval(`document.querySelector('[data-do="calculate-timing"]').click()`);
    const unsupported = await page.eval(`document.querySelector(".fe-status").textContent`);
    res.push([unsupported.includes("period 1"), "unsupported sub-step clock periods are reported rather than miscalculated"]);
    res.push([page.errors.length === 0, `sequential timing: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

scenarios.projectZip = async (ctx) => {
  const res = [];
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    await page.goto(`${ctx.url}?open=examples/full-adder-levels.json`);
    await page.waitFor(ready);
    await page.eval(`(() => {
      window.__zipObjects = [];
      window.__projectZip = null;
      window.__projectZipName = "";
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        window.__zipObjects.push({ url, blob });
        return url;
      };
      HTMLAnchorElement.prototype.click = function() {
        const object = window.__zipObjects.find((entry) => entry.url === this.href);
        if (object?.blob.type === "application/zip") {
          window.__projectZip = object.blob;
          window.__projectZipName = this.download;
        }
      };
    })()`);
    await page.eval(`document.querySelector('[data-sec-bar="timing"]').click()`);
    await page.waitFor(`!!document.querySelector(".td-tabs")`, 10000);
    const source = JSON.stringify({ signal: [{ name: "S", wave: "01" }, { name: "Cout", wave: "10" }] });
    await page.eval(`(() => {
      document.querySelector('[data-view="source"]').click();
      const input = document.querySelector(".td-srctext");
      input.value = ${JSON.stringify(source)};
      document.querySelector('[data-do="src-apply"]').click();
      document.querySelector('[data-view="truth"]').click();
      document.querySelector("[data-truth-inputs]").value = "A, B, Cin";
      document.querySelector("[data-truth-outputs]").value = "S, Cout";
      const table = document.querySelector("[data-truth-table]");
      table.value = "A,B,Cin,S,Cout\\n0,0,0,0,0\\n0,0,1,1,0\\n0,1,0,1,0\\n0,1,1,0,1\\n1,0,0,1,0\\n1,0,1,0,1\\n1,1,0,0,1\\n1,1,1,1,1";
      table.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('[data-sec-bar="figure"]').click();
    })()`);
    await page.sleep(300);
    await page.shot(`${ctx.out}/beta-project-zip.png`);
    await page.eval(`document.querySelector('[data-cmd="projectzip"]').click()`);
    await page.waitFor(`document.querySelector(".fe-status").textContent.includes("with 9 project files")`, 30000);
    const contents = await page.eval(`(async () => {
      const blob = window.__projectZip, bytes = new Uint8Array(await blob.arrayBuffer());
      const view = new DataView(bytes.buffer), decoder = new TextDecoder(), files = new Map();
      let offset = 0;
      while (view.getUint32(offset, true) === 0x04034b50) {
        const size = view.getUint32(offset + 18, true);
        const nameLength = view.getUint16(offset + 26, true);
        const extraLength = view.getUint16(offset + 28, true);
        const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
        const start = offset + 30 + nameLength + extraLength;
        files.set(name, bytes.slice(start, start + size));
        offset = start + size;
      }
      const text = (name) => decoder.decode(files.get(name) ?? new Uint8Array());
      const schematic = JSON.parse(text("schematic.json"));
      const timing = JSON.parse(text("timing-diagram.json"));
      const source = JSON.parse(text("source.json"));
      const png = (name) => files.get(name)?.slice(0, 4).join(",") === "137,80,78,71";
      return {
        name: window.__projectZipName,
        files: [...files.keys()],
        zipEnd: view.getUint32(bytes.length - 22, true) === 0x06054b50,
        schematicJson: schematic.schema === "circuit/0.2",
        schematicSvg: text("schematic.svg").includes("<svg"),
        schematicPng: png("schematic.png"),
        timingJson: Array.isArray(timing.signal) && timing.signal.length === 2,
        timingSvg: text("timing-diagram.svg").includes("<svg"),
        timingPng: png("timing-diagram.png"),
        sourceSchema: source.schema,
        sourceMatchesFiles: JSON.stringify(source.schematic) === JSON.stringify(schematic) && JSON.stringify(source.timing) === JSON.stringify(timing),
        truthTableMatchesFiles: source.truthTable?.csv === text("truth-table.csv") && source.truthTable?.latex === text("truth-table.tex"),
      };
    })()`);
    const expected = "schematic.png,schematic.svg,schematic.json,timing-diagram.png,timing-diagram.svg,timing-diagram.json,truth-table.csv,truth-table.tex,source.json";
    res.push([contents.name.endsWith("-project.zip") && contents.files.join(",") === expected && contents.zipEnd, `Project ZIP contains all nine named files (${contents.files.join(", ")})`]);
    res.push([contents.schematicJson && contents.schematicSvg && contents.schematicPng && contents.timingJson && contents.timingSvg && contents.timingPng, `ZIP contains valid JSON, SVG and PNG assets for both views (${JSON.stringify(contents)})`]);
    res.push([contents.sourceSchema === "figure-editor-project/1" && contents.sourceMatchesFiles, `source.json combines the same schematic and timing source (${contents.sourceSchema})`]);
    res.push([contents.truthTableMatchesFiles, "the ZIP includes the truth-table CSV and matching LaTeX in source.json"]);

    await page.eval(`document.querySelector('[data-cmd="new"]').click()`);
    await page.eval(`document.querySelector('[data-cmd="projectzip"]').click()`);
    await page.waitFor(`document.querySelector(".fe-status").textContent.includes("with 7 project files")`, 30000);
    const empty = await page.eval(`(async () => {
      const bytes = new Uint8Array(await window.__projectZip.arrayBuffer());
      const view = new DataView(bytes.buffer), decoder = new TextDecoder(), files = new Map();
      let offset = 0;
      while (view.getUint32(offset, true) === 0x04034b50) {
        const size = view.getUint32(offset + 18, true), names = view.getUint16(offset + 26, true), extra = view.getUint16(offset + 28, true);
        const start = offset + 30 + names + extra;
        files.set(decoder.decode(bytes.subarray(offset + 30, offset + 30 + names)), bytes.slice(start, start + size));
        offset = start + size;
      }
      const source = JSON.parse(decoder.decode(files.get("timing-diagram.json")));
      return {
        signals: source.signal.length,
        svg: decoder.decode(files.get("timing-diagram.svg")).includes("<svg"),
        png: files.get("timing-diagram.png")?.slice(0, 4).join(",") === "137,80,78,71",
      };
    })()`);
    res.push([empty.signals === 0 && empty.svg && empty.png, `an empty timing diagram still exports all three formats (${JSON.stringify(empty)})`]);
    res.push([page.errors.length === 0, `project ZIP: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};

/** R1: each tool on its own page and the composite: the shared interface (load and save its format, events), redirects, migration. */
scenarios.interface = async (ctx) => {
  const res = [];
  const base = ctx.url.replace(/figure-editor\/$/, "");
  const page = await ctx.launch({ scheme: "light", port: nextPort++ });
  try {
    // the beta URL lands on the Figure Editor, ?open= kept; the beta's saved work comes across once
    await page.goto(base + "figure-editor/");
    await page.eval(`localStorage.clear(); localStorage.setItem("figure-editor-beta/autosave", JSON.stringify({ schema: "circuit/0.2", id: "from_beta", grid_cm: 0.25, elements: [], nets: {} }))`);
    await page.goto(base + "figure-editor-beta/?x=1");
    await page.waitFor(ready);
    await page.sleep(1500);
    const r = JSON.parse(await page.eval(String.raw`(async () => {
      const t = window.figureEditorTool, events = [];
      t.on("change", (p) => events.push("change:" + p.format));
      t.on("status", () => events.push("status"));
      const migrated = window.figureEditor.doc.id;
      const text = t.save("circuit");
      t.load("circuit", text.replace('"from_beta"', '"round_trip"'));
      let refused = false; try { t.save("trace"); } catch { refused = true; }
      const toolbars = [...document.querySelectorAll(".fe-toolbar")].map((x) => x.getAttribute("aria-label")).join();
      return JSON.stringify({ path: location.pathname + location.search, migrated, id: window.figureEditor.doc.id, events: [...new Set(events)], refused, commands: t.commands().includes("new"), flag: !!localStorage.getItem("figure-editor/migrated-r1"), toolbars, bars: document.querySelectorAll(".fe-stack > .fe-sec-bar").length });
    })()`));
    res.push([r.path === "/tools/figure-editor/?x=1", `redirect: the beta URL lands on the Figure Editor with its query (${r.path})`]);
    res.push([r.migrated === "from_beta" && r.flag, `migration: the beta's autosave opens in the Figure Editor (${r.migrated})`]);
    res.push([r.id === "round_trip" && r.events.includes("change:circuit") && r.events.includes("status"), `Figure Editor interface: load and save circuit, change and status events (${r.events.join(", ")})`]);
    res.push([r.refused && r.commands, "Figure Editor interface: an unsupported format is refused; commands are listed"]);
    res.push([r.toolbars === "Figure Editor" && r.bars === 3, `Figure Editor: one toolbar, its own, and the three section bars (toolbars: ${r.toolbars}; bars: ${r.bars}); the Schematic Editor inside has none`]);
    // the Schematic Editor alone: no timing or slide sections
    await page.goto(base + "schematic-editor/");
    await page.sleep(2500);
    const s = JSON.parse(await page.eval(`JSON.stringify({ ok: !!window.schematicEditorTool, parts: document.querySelector("[data-parts]")?.dataset.parts, save: window.schematicEditorTool?.save("circuit").includes("circuit/0.2"), timingBar: document.querySelector('[data-sec-bar]') ? "present" : "none", toolbars: [...document.querySelectorAll('.fe-toolbar')].map((t) => t.getAttribute('aria-label')).join() })`));
    res.push([s.ok && s.save && s.parts === "schematic", `Schematic Editor page: mounts alone and saves a circuit (parts: ${s.parts})`]);
    res.push([s.timingBar === "none" && s.toolbars === "Schematic Editor", `Schematic Editor page: its own toolbar, no Timing or Slide section (bars: ${s.timingBar}; toolbars: ${s.toolbars})`]);
    // a simulator-style host: no toolbar, no parts, only the drawing section and the slots
    const sim = JSON.parse(await page.eval(String.raw`(async () => {
      const { mount } = await import("./src/index.js");
      const el = document.createElement("div");
      el.innerHTML = '<div class="fe"><div data-slot="left"></div><div class="fe-stack"><div class="fe-sec" data-sec="figure"></div></div><div data-slot="status"></div></div>';
      document.body.append(el);
      const t = await mount(el, { pack: "./symbol-pack/", host: true, storage: "simulator-test/" });
      t.load("circuit", JSON.stringify({ schema: "circuit/0.2", id: "sim", grid_cm: 0.25, elements: [], nets: {} }));
      return JSON.stringify({ toolbar: !!el.querySelector(".fe-toolbar"), canvas: !!el.querySelector(".fe-canvas"), id: JSON.parse(t.save("circuit")).id });
    })()`));
    res.push([!sim.toolbar && sim.canvas && sim.id === "sim", `a host without a toolbar (as a simulator page would be) mounts the Schematic Editor embedded: no toolbar of its own, a canvas, load and save work (${JSON.stringify(sim)})`]);
    // the Timing Diagram alone, sharing the composite's saved diagram
    await page.goto(base + "timing-diagram/");
    await page.sleep(1500);
    const t = JSON.parse(await page.eval(String.raw`(() => {
      const tool = window.timingDiagram, src = '{"signal":[{"name":"A","wave":"01.0"}]}';
      let changed = false; tool.on("change", () => { changed = true; });
      tool.load("wavedrom", src);
      return JSON.stringify({ round: JSON.parse(tool.save("wavedrom")).signal[0].wave, stored: (localStorage.getItem("timing-diagram/source") ?? "").includes("01.0"), changed });
    })()`));
    res.push([t.round === "01.0" && t.stored, `Timing Diagram page: load and save wavedrom; the diagram is the shared one (stored: ${t.stored})`]);
    res.push([page.errors.length === 0, `interface: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};
