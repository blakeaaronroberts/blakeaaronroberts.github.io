// The timing tool, one module for both places: the standalone Timing Diagram page and the pane docked in the Figure Editor
// (F18). Two swappable views: Edit, a step editor (one button per step of each signal, no source text to type), and
// Diagram, our own vector drawing (draw.js). Signals are added from the circuit's nodes, which follow the Figure Editor live.
import { parseSource, tidy } from "./wave.js";
import { drawTiming, naturalSize, lanesOf, stepsOf } from "./draw.js";
import { nodesOf, unknownNames, framesIn } from "./nodes.js";
import { addSignal, cellsOf, dataAt, empty, isClock, LABEL, moveSignal, nextValue, removeSignal, setCell, setClock, setDelay, setSteps, stepCount } from "./model.js";
import { dockShell, pageShell } from "./shell.js";

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable: the page still works */ } },
};
const KEY = "timing-diagram/source";
const EDITOR_KEY = "figure-editor/autosave";   // read only; the Figure Editor writes it
const CLOCK = /^(clk|clock|ck|phi\d?)$/i;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function mount(root, { docked = false, onSend = null } = {}) {
  root.classList.add(docked ? "td-dock" : "fe");   // standalone: the Figure Editor's shell (editor.css); docked: a pane inside the editor
  const header = document.querySelector("#quarto-header");
  const fit = () => root.style.setProperty("--fe-top", `${header ? Math.round(header.getBoundingClientRect().bottom) : 0}px`);
  if (!docked) { fit(); window.addEventListener("resize", fit); }
  const B = "btn btn-sm fe-btn";
  root.innerHTML = docked ? dockShell(B) : pageShell(B);
  const $ = (s) => root.querySelector(s);
  const status = $(".td-status"), view = $("#WaveDrom_Display_0"), grid = $(".td-grid");
  const wIn = $("[data-size=w]"), hIn = $("[data-size=h]");
  const say = (msg, error = false) => { status.textContent = msg; if (error) status.setAttribute("data-error", ""); else status.removeAttribute("data-error"); };

  // ---- the model: the diagram as data, kept in this browser ----
  let value = (() => { const r = parseSource(store.get(KEY) ?? ""); return r.ok ? r.value : empty(); })();   // opens empty the first time
  let natural = null, custom = false;   // custom: the reader set the size by hand
  let nodes = [], frameNames = [], frame = -1;
  const commit = (next, msg) => { value = next; store.set(KEY, tidy(value)); render(); if (msg) say(msg); };

  /** Is the site showing its dark look? Read from its own role, as the Figure Editor does. */
  const siteIsDark = () => {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--role-background").trim() || "white";
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ctx.fillStyle.slice(i, i + 2), 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
  };
  /** The diagram as SVG text in the figure roles: light unless `dark` (exports always ask for light). */
  const drawNow = (dark) => {
    const css = getComputedStyle(document.documentElement), role = (n) => css.getPropertyValue(n).trim() || undefined;
    return drawTiming(value, { width: Number(wIn.value) || natural.w, height: Number(hIn.value) || natural.h, ink: role(dark ? "--fig-dark-ink" : "--fig-ink"), accent: role(dark ? "--fig-dark-accent" : "--fig-accent"), marker: frame >= 0 && frame < frameNames.length ? frame : null }).svg;
  };

  // ---- the two views ----
  let mode = "edit";
  const showView = (m) => {
    mode = m;
    for (const t of root.querySelectorAll("[data-view]")) t.setAttribute("aria-selected", String(t.dataset.view === m));
    $(".td-edit").hidden = m !== "edit";
    $(".td-view").hidden = m !== "diagram";
  };
  root.addEventListener("click", (e) => { const t = e.target.closest("[data-view]"); if (t) showView(t.dataset.view); });

  function render() {
    natural = naturalSize(value);
    if (!custom) { wIn.value = natural.w; hIn.value = natural.h; }
    if (!docked) root.dataset.canvas = siteIsDark() ? "dark" : "light";   // standalone: follow the site's look, as the editor's canvas does
    // The size is a layout input: steps and lanes are re-spaced to fit it, nothing is stretched.
    view.innerHTML = value.signal.length ? drawNow(!!root.closest('[data-canvas="dark"]')) : `<p class="fe-hint td-emptynote">No signals yet: add a node in the Edit view.</p>`;
    renderGrid();
    renderChips();
    const n = value.signal.length;
    say(n ? `${n} signal${n === 1 ? "" : "s"}, ${stepCount(value)} steps.` : "Empty: add a node from the circuit to start.");
  }
  if (!docked) new MutationObserver(() => render()).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  // ---- Edit: the step editor ----
  function renderGrid() {
    const n = stepCount(value);
    $(".td-nsteps").textContent = String(n);
    const head = `<div class="td-row td-head"><div class="td-name"></div><div class="td-cells" style="--n:${n}">${Array.from({ length: n }, (_, i) => `<span class="td-stepno${i === frame ? " is-marked" : ""}">${i + 1}</span>`).join("")}</div><div class="td-delay label-mono">delay</div></div>`;
    const rows = value.signal.map((s, si) => {
      const clock = isClock(s);
      const cells = clock
        ? `<div class="td-clockcells" style="grid-column: span ${n}">clock</div>`
        : cellsOf(s, n).map((c, i) => `<button type="button" class="td-cell v-${c.value === "=" ? "d" : c.value}${c.held ? " is-held" : ""}${i === frame ? " is-marked" : ""}" data-step="${i}" title="Step ${i + 1}: ${LABEL[c.value] ?? c.value}${c.held ? " (held)" : ""}">${c.value === "=" ? esc(dataAt(s, i) || "=") : c.held ? "" : LABEL[c.value] ?? c.value}</button>`).join("");
      return `<div class="td-row" data-s="${si}">
        <div class="td-name"><span title="${esc(s.name)}">${esc(s.name)}</span>
          <button type="button" class="td-mini" data-act="clock" aria-pressed="${clock}" title="Make this a clock">clk</button>
          <button type="button" class="td-mini" data-act="up" aria-label="Move ${esc(s.name)} up">↑</button>
          <button type="button" class="td-mini" data-act="down" aria-label="Move ${esc(s.name)} down">↓</button>
          <button type="button" class="td-mini" data-act="del" aria-label="Remove ${esc(s.name)}">✕</button></div>
        <div class="td-cells" style="--n:${n}">${cells}</div>
        <input class="form-control form-control-sm td-delay" type="number" step="0.05" data-act="delay" value="${Number(s.delay) || 0}" aria-label="Delay of ${esc(s.name)} in steps" title="Delay in steps (fractions allowed)">
      </div>`;
    }).join("");
    if (grid.contains(document.activeElement) && document.activeElement.matches("input")) return;   // don't rebuild under the cursor
    grid.innerHTML = value.signal.length ? head + rows : "";
  }
  const sigIndex = (e) => Number(e.target.closest("[data-s]")?.dataset.s);
  grid.addEventListener("click", (e) => {
    const si = sigIndex(e);
    const cell = e.target.closest("[data-step]");
    if (cell) {
      const step = Number(cell.dataset.step), cur = cellsOf(value.signal[si], stepCount(value))[step];
      if (e.shiftKey) return commit(setCell(value, si, step, "."));
      return commit(setCell(value, si, step, nextValue(cur.value)));
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "clock") commit(setClock(value, si, !isClock(value.signal[si])));
    if (act === "up" || act === "down") commit(moveSignal(value, si, act === "up" ? -1 : 1));
    if (act === "del") commit(removeSignal(value, si), `Removed ${value.signal[si].name}.`);
  });
  grid.addEventListener("contextmenu", (e) => {
    const cell = e.target.closest("[data-step]");
    if (!cell) return;
    e.preventDefault();
    const si = sigIndex(e), step = Number(cell.dataset.step), cur = cellsOf(value.signal[si], stepCount(value))[step];
    commit(setCell(value, si, step, nextValue(cur.value, true)));
  });
  grid.addEventListener("dblclick", (e) => {
    const cell = e.target.closest("[data-step]");
    if (!cell) return;
    const si = sigIndex(e), step = Number(cell.dataset.step), s = value.signal[si];
    if (cellsOf(s, stepCount(value))[step].value !== "=") return;
    const label = window.prompt("Label of this data value", dataAt(s, step));
    if (label !== null) commit(setCell(value, si, step, "=", label.trim()));
  });
  grid.addEventListener("change", (e) => { if (e.target.dataset.act === "delay") commit(setDelay(value, sigIndex(e), e.target.value)); });
  root.addEventListener("click", (e) => {
    const act = e.target.closest("[data-do]")?.dataset.do;
    if (act === "steps-") commit(setSteps(value, stepCount(value) - 1));
    if (act === "steps+") commit(setSteps(value, stepCount(value) + 1));
    if (act === "natural" && natural) { custom = false; render(); }
    if (act === "export") exportSvg();
    if (act === "add-all") { let v = value; for (const nd of nodes) v = addSignal(v, nd.name, { clock: CLOCK.test(nd.name) }); commit(v, "Added every node."); }
    if (act === "add-custom") { const name = window.prompt("Name of the signal"); if (name?.trim()) commit(addSignal(value, name.trim(), { clock: CLOCK.test(name.trim()) })); }
  });
  for (const i of [wIn, hIn]) i.addEventListener("input", () => { custom = true; render(); });

  // ---- the circuit's nodes: one button each, live from the Figure Editor ----
  const chips = $(".td-chips"), flag = $(".td-flag");
  function renderChips() {
    const have = new Set(value.signal.map((s) => s.name));
    chips.innerHTML = nodes.length ? nodes.map((nd) => `<button type="button" class="td-chip" data-node="${esc(nd.name)}"${have.has(nd.name) ? ' aria-pressed="true" disabled' : ""}>${esc(nd.name)}</button>`).join("") : `<span class="fe-hint">No circuit yet: draw one in the Figure Editor, or open a circuit file.</span>`;
    const bad = nodes.length ? unknownNames(value.signal.map((s) => s.name), nodes) : [];
    flag.textContent = bad.length ? `Not in the circuit: ${bad.join(", ")}` : "";
  }
  chips.addEventListener("click", (e) => { const b = e.target.closest("[data-node]"); if (b) commit(addSignal(value, b.dataset.node, { clock: CLOCK.test(b.dataset.node) }), `Added ${b.dataset.node}.`); });
  /** The editor hands over its circuit: node names for the buttons and its frames for the Frame list. */
  function setCircuit(text) {
    const res = nodesOf(text);
    if (!res.ok) return;
    nodes = res.nodes;
    const names = framesIn(text);
    if (names.join("\u0001") !== frameNames.join("\u0001")) setFrames(names);
    renderChips();
  }
  if (!docked) window.addEventListener("storage", (e) => { if (e.key === EDITOR_KEY && e.newValue) setCircuit(e.newValue); });   // the editor in another tab
  $("[data-do=open]").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    if (f.size > 5e6) return say("That file is too large to be a circuit.", true);
    setCircuit(await f.text());
    say(`Nodes from ${f.name}.`);
  });

  // ---- exports ----
  const svgText = () => `<?xml version="1.0" encoding="UTF-8"?>\n${drawNow(false)}\n`;   // always the light figure roles, whatever the screen shows
  const save = (blob, name) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  function exportSvg() {
    if (!value.signal.length) return say("Nothing to export yet.", true);
    save(new Blob([svgText()], { type: "image/svg+xml" }), "timing-diagram.svg");
    say("Exported timing-diagram.svg (live text, not outlined; width and height as shown).");
  }
  // PNG at 300 dpi: the SVG's px are 96 dpi, so every px becomes 300/96 pixels.
  const DPI_SCALE = 300 / 96, MAX_PX = 16000;
  async function pngBlob(xml) {
    const w = Number(/width="([\d.]+)"/.exec(xml)[1]), h = Number(/height="([\d.]+)"/.exec(xml)[1]);
    const k = Math.min(DPI_SCALE, MAX_PX / Math.max(w, h));
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("could not make the PNG"))), "image/png"));
  }
  root.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-do=export-png]")) return;
    if (!value.signal.length) return say("Nothing to export yet.", true);
    try { save(await pngBlob(svgText()), "timing-diagram.png"); say("Exported timing-diagram.png at 300 dpi."); } catch (err) { say(err.message, true); }
  });

  // ---- frames from the editor: the marked step, and one diagram per frame ----
  const frameSel = $("[data-do=frame]"), frameWrap = $(".td-frames");
  function setFrames(names) {
    frameNames = names; frame = names.length ? Math.min(Math.max(frame, 0), names.length - 1) : -1;
    frameWrap.hidden = !names.length;
    frameSel.innerHTML = names.map((n, i) => `<option value="${i}">${String(i + 1).padStart(2, "0")} ${esc(n)}</option>`).join("");
    if (frame >= 0) frameSel.value = String(frame);
    render();
  }
  frameSel.addEventListener("change", () => { frame = Number(frameSel.value); render(); });
  root.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-do=frames-export]") || !frameNames.length) return;
    const keep = frame;
    for (let i = 0; i < frameNames.length; i++) {
      frame = i; render();
      const xml = svgText(), nn = String(i + 1).padStart(2, "0");
      save(new Blob([xml], { type: "image/svg+xml" }), `timing-diagram-${nn}.svg`);
      save(await pngBlob(xml), `timing-diagram-${nn}.png`);
      await new Promise((r) => setTimeout(r, 200));
    }
    frame = keep; frameSel.value = String(keep); render();
    say(`Exported ${frameNames.length} diagrams, each with its step marked (timing-diagram-01 to ${String(frameNames.length).padStart(2, "0")}).`);
  });

  // ---- to the Figure Editor's slide ----
  /** Per-step levels of each named signal, for the editor's frames: 0 1 X Z, or null where there is no level (data boxes). */
  const signalLevels = () => lanesOf(value).filter((l) => l.name).map((l) => ({
    name: l.name,
    levels: stepsOf(l.wave).flatMap((s) => Array(l.period).fill(({ 0: "0", l: "0", d: "0", n: "0", N: "0", 1: "1", h: "1", u: "1", p: "1", P: "1", x: "X", z: "Z" })[s.c] ?? null)),
  }));
  root.addEventListener("click", (e) => {
    if (!e.target.closest("[data-do=send]")) return;
    if (!value.signal.length) return say("Nothing to send yet.", true);
    store.set("timing-diagram/send", JSON.stringify({ svg: drawNow(false), w: Number(wIn.value) || natural.w, h: Number(hIn.value) || natural.h, signals: signalLevels(), source: value, at: Date.now() }));
    onSend?.();
    say("Sent: the slide's timing regions show this diagram, and the editor's frames are filled from its steps.");
  });
  // Fit to the slide's first timing region (the slide is saved in the editor's figure, groups.slide; regions in 0.5 cm modules).
  root.addEventListener("click", (e) => {
    if (!e.target.closest("[data-do=fit-slide]")) return;
    let region = null;
    try { region = (JSON.parse(store.get(EDITOR_KEY) ?? "{}").groups?.slide?.regions ?? []).find((r) => r?.kind === "timing"); } catch { region = null; }
    if (!region) return say("The slide has no timing region: pick a layout with one in the Figure Editor's Slide pane.", true);
    const px = (m) => Math.round(((m * 0.5) / 2.54) * 96 * 100) / 100;
    wIn.value = px(region.w); hIn.value = px(region.h);
    custom = true; render();
    say(`Sized to ${(region.w * 0.5).toFixed(1)} x ${(region.h * 0.5).toFixed(1)} cm: the slide's timing region.`);
  });

  const fromEditor = store.get(EDITOR_KEY);
  if (fromEditor) setCircuit(fromEditor);
  showView("edit");
  render();
  return { render, setCircuit, get source() { return tidy(value); }, set source(v) { const r = parseSource(v); if (r.ok) commit(r.value); }, get value() { return value; } };
}
