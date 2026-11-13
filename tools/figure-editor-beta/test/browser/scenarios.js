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
  const { PRESETS } = await import("./src/presets.js");
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
    const centre = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.closest("details.fe-cat")?.setAttribute("open", ""); e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    const setField = (name, value) => page.eval(`(() => { const i = document.querySelector('[data-field="${name}"]'); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);

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
    res.push([(await page.eval(`window.figureEditor.save()`)) === saved, "a reload restores the block from the autosave"]);
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
      window.figureEditor.load(await (await fetch("./examples/cla-chevron.json")).text());
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
    res.push([(await page.eval(`window.figureEditor.save()`)) === original, "the backdrop is not part of the saved circuit"]);
    res.push([!(await page.eval(`window.figureEditor.exportSvg()`)).includes("circle cx"), "and not part of the SVG export"]);

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
  const res = [];
  for (const scheme of ["light", "dark"]) {
    const page = await ctx.launch({ scheme, port: nextPort++ });
    try {
      await page.goto(`${ctx.url}?open=examples/cla-chevron.json`);
      await page.waitFor(ready);
      await page.sleep(2500);
      const set = (name, value) => page.eval(`(() => { const i = document.querySelector('[name="${name}"]'); if (i.type === "checkbox") i.checked = ${JSON.stringify(value)}; else i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event("change", { bubbles: true })); })()`);
      const frameRects = () => page.eval(`document.querySelectorAll(".fe-overlay rect[stroke-dasharray]").length`);
      res.push([(await frameRects()) === 0, `${scheme}: no frame until asked for`]);
      await set("fe-frame-show", true); await set("fe-frame-layout", "below"); await page.sleep(200);
      await page.eval(`document.querySelector('[data-cmd="framecentre"]').click()`);
      await page.eval(`document.querySelector('[data-cmd="fit"]').click()`);   // fit the figure; the frame is bigger, so zoom out to see it all
      for (let i = 0; i < 4; i++) await page.eval(`document.querySelector('[data-cmd="zoomout"]').click()`);
      await page.sleep(500);
      res.push([(await frameRects()) >= 1, `${scheme}: the frame is drawn on the canvas (${await frameRects()} dashed rectangle)`]);
      await page.shot(`${ctx.out}/beta-frame-${scheme}.png`);
      const note = await page.eval(`document.querySelector(".fe-frame-note").textContent`);
      res.push([note === "", `${scheme}: the figure fits the schematic's part of the frame (note "${note}")`]);
      if (scheme === "dark") {
        const px = await page.eval(PIXELS(await page.shotData())), scene = await page.eval(SCENE);
        res.push([px.canvas.black === 0 && scene.black.length === 0, `dark: no black pixels with the frame shown (${px.canvas.black})`]);
      }
      // The frame export is exactly the slide.
      const svg = await page.eval(`(async () => { const o = window.figureEditor; return await o.exportSvg(true); })()`);
      const g = (n) => new RegExp(`<svg[^>]* ${n}="([^"]*)"`).exec(svg)?.[1];
      res.push([g("width") === "33.867cm" && g("height") === "19.05cm" && g("overflow") === "hidden", `${scheme}: the frame export is ${g("width")} by ${g("height")}`]);
      const png = await page.eval(`(async () => { const b = await window.figureEditor.png(true); const m = await createImageBitmap(b); return [m.width, m.height]; })()`);
      res.push([Math.abs(png[0] / png[1] - 16 / 9) < 0.01 && png[0] > 3000, `${scheme}: the frame PNG is 16:9 at 300 dpi (${png[0]} x ${png[1]})`]);
      // 4:3 and a reload.
      await set("fe-frame-format", "4:3"); await page.sleep(200);
      const svg43 = await page.eval(`window.figureEditor.exportSvg(true)`);
      res.push([/width="25\.4cm"/.test(svg43), `${scheme}: 4:3 gives 25.4 cm wide`]);
      await page.sleep(300);
      await page.goto(ctx.url); await page.waitFor(ready); await page.sleep(800);
      const back = await page.eval(`({ show: document.querySelector('[name="fe-frame-show"]').checked, format: document.querySelector('[name="fe-frame-format"]').value, layout: document.querySelector('[name="fe-frame-layout"]').value })`);
      res.push([back.show && back.format === "4:3" && back.layout === "below", `${scheme}: the frame settings come back after a reload (${JSON.stringify(back)})`]);
      res.push([page.errors.length === 0, `${scheme}: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
    } finally { await page.close(); }
  }
  return res;
};

/** F11.2: capture two frames, select one, export all on one slide (the file is intercepted, not downloaded). */
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
    res.push([out.n === 2, `frames: two captured frames listed (${out.n})`]);
    res.push([out.svg && out.svg.cm[0] === "33.867" && out.svg.cm[1] === "19.05" && !out.svg.text && out.svg.groups >= 2, `frames: one-slide export is slide size, with no <text> (${JSON.stringify(out.svg)})`]);
    res.push([out.types.some((t) => t.includes("png")), `frames: the PNG was made (${out.types.join(", ")})`]);
    res.push([page.errors.length === 0, `frames: no page errors${page.errors.length ? ": " + page.errors[0] : ""}`]);
  } finally { await page.close(); }
  return res;
};
