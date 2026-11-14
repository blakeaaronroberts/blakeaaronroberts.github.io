// The timing-diagram page: WaveDrom-format source in, our own vector drawing out (draw.js), SVG export.
import { parseSource, signalNames, tidy, SAMPLE } from "./wave.js";
import { drawTiming, naturalSize } from "./draw.js";
import { nodesOf, starterLines, unknownNames, framesIn } from "./nodes.js";

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable: the page still works */ } },
};
const KEY = "timing-diagram/source";
const EDITOR_KEY = "figure-editor-beta/autosave";   // read only; the beta editor writes it

export function mount(root) {
  root.innerHTML = `
    <section class="td-pane">
      <div class="td-bar">
        <a class="td-back" href="../figure-editor-beta/">Back to editor</a>
        <button type="button" data-do="tidy">Tidy</button>
        <button type="button" data-do="export">Export SVG</button>
        <label class="td-file">Open circuit .json<input type="file" accept=".json,application/json" data-do="open"></label>
      </div>
      <textarea class="td-src" spellcheck="false" aria-label="WaveDrom source"></textarea>
      <div class="td-status" role="status" aria-live="polite"></div>
    </section>
    <section class="td-pane">
      <div class="td-bar">
        <label>Width <input type="number" min="100" max="4000" step="10" data-size="w"> px</label>
        <label>Height <input type="number" min="40" max="4000" step="10" data-size="h"> px</label>
        <button type="button" data-do="natural">Natural size</button>
        <button type="button" data-do="fit-slide" title="Size the diagram to the timing part of the editor's slide frame and export it">Fit to slide and export</button>
        <span class="td-frames" hidden><label>Frame <select data-do="frame"></select></label> <button type="button" data-do="frames-export">Export frames</button></span>
      </div>
      <div class="td-view"><div id="WaveDrom_Display_0"></div></div>
      <div class="td-nodes" hidden><h2 class="td-nodes-title"></h2><div class="td-chips"></div><button type="button" data-do="add-all" class="td-chip">Add starter lines for all</button><div class="td-flag" role="status"></div></div>
    </section>`;
  const $ = (s) => root.querySelector(s);
  const src = $(".td-src"), status = $(".td-status"), view = $("#WaveDrom_Display_0");
  const wIn = $("[data-size=w]"), hIn = $("[data-size=h]");
  let natural = null, last = null, custom = false;   // custom: the reader set the size by hand

  const say = (msg, error = false) => { status.textContent = msg; if (error) status.setAttribute("data-error", ""); else status.removeAttribute("data-error"); };
  const svgEl = () => view.querySelector("svg");
  const render = () => {
    const r = parseSource(src.value);
    if (!r.ok) { say(r.error, true); return; }
    try {
      last = r.value;
      natural = naturalSize(r.value);
      if (!custom) { wIn.value = natural.w; hIn.value = natural.h; }
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--fig-accent").trim() || "#0072B2";
      // The size is a layout input: steps and lanes are re-spaced to fit it, nothing is stretched.
      view.innerHTML = drawTiming(r.value, { width: Number(wIn.value) || natural.w, height: Number(hIn.value) || natural.h, accent, marker: frame >= 0 && frame < frameNames.length ? frame : null }).svg;
      say(`${signalNames(r.value).length} signals.`);
    } catch (e) { say(`Could not draw the diagram: ${e.message}`, true); }
  };

  src.value = store.get(KEY) || SAMPLE;
  let timer = 0;
  src.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { store.set(KEY, src.value); render(); }, 250); });
  for (const i of [wIn, hIn]) i.addEventListener("input", () => { custom = true; render(); });
  root.addEventListener("click", (e) => {
    const act = e.target.closest("[data-do]")?.getAttribute("data-do");
    if (act === "tidy") { const r = parseSource(src.value); if (!r.ok) return say(r.error, true); src.value = tidy(r.value); store.set(KEY, src.value); render(); }
    if (act === "natural" && natural) { custom = false; wIn.value = natural.w; hIn.value = natural.h; render(); }
    if (act === "export") exportSvg();
  });

  function svgText() {
    const clone = svgEl().cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    return `<?xml version="1.0" encoding="UTF-8"?>
${new XMLSerializer().serializeToString(clone)}
`;
  }

  function exportSvg() {
    const s = svgEl(); if (!s) return say("Nothing to export yet.", true);
    const clone = s.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
    a.download = "timing-diagram.svg";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say("Exported timing-diagram.svg (live text, not outlined; width and height as shown).");
  }


  // ---- frames from the editor: the step marker, and one diagram per frame (T2.3) ----
  let frameNames = [], frame = -1;
  const frameSel = $("[data-do=frame]"), frameWrap = $(".td-frames");
  const stepMarker = () => render();
  const setFrames = (names) => {
    frameNames = names; frame = names.length ? 0 : -1;
    frameWrap.hidden = !names.length;
    frameSel.replaceChildren(...names.map((n, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = `${String(i + 1).padStart(2, "0")} ${n}`; return o; }));
    stepMarker();
  };
  frameSel.addEventListener("change", () => { frame = Number(frameSel.value); render(); });
  const saveSvg = (xml, name) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" })); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  root.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-do=frames-export]") || !frameNames.length) return;
    const keep = frame;
    for (let i = 0; i < frameNames.length; i++) {
      frame = i; stepMarker();
      saveSvg(svgText(), `timing-diagram-${String(i + 1).padStart(2, "0")}.svg`);
      await new Promise((r) => setTimeout(r, 200));
    }
    frame = keep; frameSel.value = String(keep); stepMarker();
    say(`Exported ${frameNames.length} diagrams, each with its step marked (timing-diagram-01 to ${String(frameNames.length).padStart(2, "0")}).`);
  });

  // Fit to the timing part of the editor's slide frame (the editor keeps it in its options), then export there.
  // Slide sizes and splits are the editor's (tools/figure-editor-beta/src/frame.js): 16:9 33.867 x 19.05 cm, 4:3 25.4 x 19.05 cm; timing is the last 40% below, the last 45% beside.
  root.addEventListener("click", (e) => {
    if (!e.target.closest("[data-do=fit-slide]")) return;
    let f = {};
    try { f = JSON.parse(store.get("figure-editor-beta/options") ?? "{}").frame ?? {}; } catch { f = {}; }
    const fw = f.format === "4:3" ? 25.4 : 33.867, fh = 19.05;
    if (f.layout !== "below" && f.layout !== "beside") return say("Set the editor's slide frame layout to 'Timing diagram below' or 'beside' first (Slide frame pane), then come back.", true);
    const cmW = f.layout === "below" ? fw : fw * 0.45, cmH = f.layout === "below" ? fh * 0.4 : fh;
    wIn.value = Math.round((cmW * 96) / 2.54 * 100) / 100; hIn.value = Math.round((cmH * 96) / 2.54 * 100) / 100;
    custom = true; render();
    saveSvg(svgText(), "timing-diagram-slide.svg");
    say(`Exported timing-diagram-slide.svg at ${cmW.toFixed(2)} x ${cmH.toFixed(2)} cm: the timing part of the ${f.format ?? "16:9"} slide.`);
  });

  // ---- nodes of a circuit: from the beta editor's autosave (if any) or an opened .json ----
  let nodes = [];
  const nodesBox = $(".td-nodes"), chips = $(".td-chips"), flag = $(".td-flag"), nodesTitle = $(".td-nodes-title");
  const setNodes = (res, from) => {
    if (!res.ok) { say(res.error, true); return; }
    nodes = res.nodes;
    nodesBox.hidden = nodes.length === 0;
    nodesTitle.textContent = `Nodes of ${res.title || from} (${nodes.length})`;
    chips.replaceChildren(...nodes.map((n) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "td-chip"; b.textContent = n.name; b.title = `Add a starter line for ${n.name}`;
      b.addEventListener("click", () => addLines([n]));
      return b;
    }));
    checkUnknown();
  };
  const checkUnknown = () => {
    const r = parseSource(src.value);
    const bad = nodes.length && r.ok ? unknownNames(signalNames(r.value), nodes) : [];
    flag.textContent = bad.length ? `Not in the circuit: ${bad.join(", ")}` : "";
  };
  const addLines = (list) => {
    const r = parseSource(src.value);
    const base = r.ok ? r.value : { signal: [] };
    const have = new Set(signalNames(base));
    for (const l of starterLines(list)) if (!have.has(l.name)) base.signal.push(l);
    src.value = tidy(base); store.set(KEY, src.value); render();
  };
  src.addEventListener("input", () => setTimeout(checkUnknown, 300));
  root.addEventListener("click", (e) => { if (e.target.closest("[data-do=add-all]")) addLines(nodes); });
  $("[data-do=open]").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    if (f.size > 5e6) return say("That file is too large to be a circuit.", true);
    const text = await f.text();
    setNodes(nodesOf(text), f.name); setFrames(framesIn(text));
  });
  const fromEditor = store.get(EDITOR_KEY);
  if (fromEditor) { const res = nodesOf(fromEditor); if (res.ok) { setNodes(res, "the editor's circuit"); setFrames(framesIn(fromEditor)); } }
  render();
  return { render, get source() { return src.value; }, set source(v) { src.value = v; render(); }, get last() { return last; } };
}
