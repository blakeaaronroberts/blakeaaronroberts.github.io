// The timing-diagram page: WaveDrom source in, lecture-skin preview out, SVG export.
import { parseSource, signalNames, tidy, SAMPLE } from "./wave.js";

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable: the page still works */ } },
};
const KEY = "timing-diagram/source";

export function mount(root) {
  root.innerHTML = `
    <section class="td-pane">
      <div class="td-bar">
        <button type="button" data-do="tidy">Tidy</button>
        <button type="button" data-do="export">Export SVG</button>
      </div>
      <textarea class="td-src" spellcheck="false" aria-label="WaveDrom source"></textarea>
      <div class="td-status" role="status" aria-live="polite"></div>
    </section>
    <section class="td-pane">
      <div class="td-bar">
        <label>Width <input type="number" min="100" max="4000" step="10" data-size="w"> px</label>
        <label>Height <input type="number" min="40" max="4000" step="10" data-size="h"> px</label>
        <button type="button" data-do="natural">Natural size</button>
      </div>
      <div class="td-view"><div id="WaveDrom_Display_0"></div></div>
    </section>`;
  const $ = (s) => root.querySelector(s);
  const src = $(".td-src"), status = $(".td-status"), view = $("#WaveDrom_Display_0");
  const wIn = $("[data-size=w]"), hIn = $("[data-size=h]");
  let natural = null, last = null;

  const say = (msg, error = false) => { status.textContent = msg; if (error) status.setAttribute("data-error", ""); else status.removeAttribute("data-error"); };
  const svgEl = () => view.querySelector("svg");
  const applySize = () => {
    const s = svgEl(); if (!s || !natural) return;
    const w = Math.max(100, Number(wIn.value) || natural.w), h = Math.max(40, Number(hIn.value) || natural.h);
    s.setAttribute("viewBox", `0 0 ${natural.w} ${natural.h}`);
    s.setAttribute("preserveAspectRatio", "none");
    s.setAttribute("width", w); s.setAttribute("height", h);
  };
  const render = () => {
    const r = parseSource(src.value);
    if (!r.ok) { say(r.error, true); return; }
    try {
      if (typeof WaveDrom === "undefined") throw new Error("WaveDrom did not load.");
      view.innerHTML = "";
      WaveDrom.RenderWaveForm(0, r.value, "WaveDrom_Display_");
      const s = svgEl();
      natural = { w: Number(s.getAttribute("width")), h: Number(s.getAttribute("height")) };
      if (!wIn.value || !hIn.value) { wIn.value = natural.w; hIn.value = natural.h; }
      applySize();
      last = r.value;
      say(`${signalNames(r.value).length} signals.`);
    } catch (e) { say(`Could not draw the diagram: ${e.message}`, true); }
  };

  src.value = store.get(KEY) || SAMPLE;
  let timer = 0;
  src.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { store.set(KEY, src.value); render(); }, 250); });
  wIn.addEventListener("input", applySize); hIn.addEventListener("input", applySize);
  root.addEventListener("click", (e) => {
    const act = e.target.closest("[data-do]")?.getAttribute("data-do");
    if (act === "tidy") { const r = parseSource(src.value); if (!r.ok) return say(r.error, true); src.value = tidy(r.value); store.set(KEY, src.value); render(); }
    if (act === "natural" && natural) { wIn.value = natural.w; hIn.value = natural.h; applySize(); }
    if (act === "export") exportSvg();
  });

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

  render();
  return { render, get source() { return src.value; }, set source(v) { src.value = v; render(); }, get last() { return last; } };
}
