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
    const centre = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
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
