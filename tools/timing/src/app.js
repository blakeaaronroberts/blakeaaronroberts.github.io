// The timing tool, one module for both places: the standalone Timing Diagram page and the pane docked in the Figure Editor
// (F18). Three swappable views: Edit, a step editor that exposes every WaveDrom feature without typing source; Diagram,
// our own vector drawing (draw.js); and WaveDrom source, to copy a diagram out or paste one in. Signals are added from the circuit's nodes, which follow the Figure Editor live.
import { parseSource, tidy } from "./wave.js";
import { drawTiming, naturalSize, lanesOf, stepsOf } from "./draw.js";
import { nodesOf, unknownNames, framesIn } from "./nodes.js";
import { addEdge, addSignal, addSpacer, cellsOf, dataAt, EDGE_OPS, edgesOf, empty, fromWaveDrom, isClock, LABEL, moveSignal, nextLetter, nextValue, nodeLetters, removeEdge, removeSignal, setBand, setCell, setClock, setDelay, setEdge, setHscale, setNode, setProp, setSlant, setSteps, slantOf, stepCount, toWaveDrom, WAVE } from "./model.js";
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
  // Opens empty. The old sample diagram (clk, D, Q) that earlier versions saved by default is not brought back.
  const LEGACY = ["p.......", "0.1..0..", "x.1..0.."];
  let value = (() => {
    const r = parseSource(store.get(KEY) ?? "");
    if (!r.ok) return empty();
    const waves = (r.value.signal ?? []).map((s) => s?.wave);
    return waves.length === 3 && waves.every((w, i) => w === LEGACY[i]) ? empty() : fromWaveDrom(r.value);
  })();
  let natural = null, custom = false;   // custom: the reader set the size by hand
  let nodes = [], frameNames = [], frame = -1;
  let brush = "cycle";                  // what a click on a step sets: "cycle", a wave character, or "node"
  const open = new Set();               // signals whose period, phase and group settings are shown
  const commit = (next, msg) => { value = next; store.set(KEY, tidy(value)); render(); if (msg) say(msg); };

  /** Is the site showing its dark look? Read from its own role, as the Figure Editor does. */
  const siteIsDark = () => {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--role-background").trim() || "white";
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ctx.fillStyle.slice(i, i + 2), 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
  };
  /** The figure roles for data colours 3 to 9, light or dark. */
  const dataRoles = (dark) => (dark ? ["--fig-dark-high", "--fig-dark-flow", "--fig-dark-accent", "--fig-dark-highlight", "--fig-dark-floating", "--fig-dark-unknown", "--fig-dark-low"] : ["--fig-high", "--fig-flow", "--fig-accent", "--fig-highlight", "--fig-shade", "--fig-muted", "--fig-rule"]);
  /** The diagram as SVG text in the figure roles: light unless `dark` (exports always ask for light). */
  const drawNow = (dark) => {
    const css = getComputedStyle(document.documentElement), role = (n) => css.getPropertyValue(n).trim() || undefined;
    return drawTiming(toWaveDrom(value), {
      width: Number(wIn.value) || natural.w, height: Number(hIn.value) || natural.h,
      ink: role(dark ? "--fig-dark-ink" : "--fig-ink"), accent: role(dark ? "--fig-dark-accent" : "--fig-accent"),
      dataFills: dataRoles(dark).map(role), paper: role(dark ? "--fig-dark-background" : "--fig-background"), marker: frame >= 0 && frame < frameNames.length ? frame : null,
    }).svg;
  };

  // ---- the three views: Edit, Diagram, WaveDrom source ----
  const srcText = $(".td-srctext");
  const showView = (m) => {
    for (const t of root.querySelectorAll("[data-view]")) t.setAttribute("aria-selected", String(t.dataset.view === m));
    $(".td-edit").hidden = m !== "edit";
    $(".td-view").hidden = m !== "diagram";
    $(".td-source").hidden = m !== "source";
    if (m === "source") srcText.value = JSON.stringify(toWaveDrom(value), null, 2);
    if (m === "diagram") render();   // its width follows the view, which has a size only when shown
  };
  root.addEventListener("click", (e) => { const t = e.target.closest("[data-view]"); if (t) showView(t.dataset.view); });

  function render() {
    natural = naturalSize(toWaveDrom(value));
    if (!custom) {   // on screen the diagram fills the view's width (laid out again, not stretched); Natural size gives WaveDrom's own proportions
      const room = view.parentElement.clientWidth - 32;
      wIn.value = Math.round(Math.max(natural.w, room > 0 ? room : 0)); hIn.value = Math.round(natural.h * (room > natural.w ? Math.min(2, room / natural.w) : 1));
    }
    if (document.activeElement !== hsIn) hsIn.value = String(value.config?.hscale ?? 1);
    if (document.activeElement !== slantIn) slantIn.value = String(slantOf(value));
    for (const p of root.querySelectorAll("[data-slant]")) p.setAttribute("aria-pressed", String(Number(p.dataset.slant) === slantOf(value)));
    if (!docked) root.dataset.canvas = siteIsDark() ? "dark" : "light";   // standalone: follow the site's look, as the editor's canvas does
    // The size is a layout input: steps and lanes are re-spaced to fit it, nothing is stretched.
    view.innerHTML = value.signal.length ? drawNow(!docked && !!root.closest('[data-canvas="dark"]')) : `<p class="fe-hint td-emptynote">No signals yet: add a node in the Edit view.</p>`;
    renderBrushes();
    renderGrid();
    renderEdges();
    renderBands();
    renderChips();
    const n = value.signal.filter((s) => s.name || s.wave).length;
    say(n ? `${n} signal${n === 1 ? "" : "s"}, ${stepCount(value)} steps.` : "Empty: add a node from the circuit to start.");
  }
  if (!docked) new MutationObserver(() => render()).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", () => { if (!custom) render(); });

  // ---- Edit: the brushes (what a click sets) ----
  const brushes = $(".td-brushes");
  const showSub = (name) => {
    for (const t of root.querySelectorAll("[data-sub-tab]")) t.setAttribute("aria-selected", String(t.dataset.subTab === name));
    for (const p of root.querySelectorAll("[data-sub]")) p.hidden = p.dataset.sub !== name;
  };
  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-sub-tab]");
    if (t) showSub(t.dataset.subTab);
    if (e.target.closest("[data-do=place-nodes]")) { brush = "node"; renderBrushes(); showSub("signals"); say("Click a step on one signal, then a step on another: each gets a letter."); }
    const p = e.target.closest("[data-slant]");
    if (p) commit(setSlant(value, p.dataset.slant));
  });
  const BRUSH_GROUPS = [
    ["Levels", ["0", "1", "x", "z"]], ["Sharp and weak", ["h", "l", "u", "d"]], ["Data", ["=", "3", "4", "5", "6", "7", "8", "9"]],
    ["Clocks", ["p", "n", "P", "N"]], ["Marks", ["|", "."]],
  ];
  function renderBrushes() {
    const title = Object.fromEntries(WAVE);
    const b = (v, label, t) => `<button type="button" class="td-brush v-${v === "=" ? "data" : v === "|" ? "gap" : v === "." ? "hold" : v}" data-brush="${esc(v)}" aria-pressed="${brush === v}" title="${esc(t)}">${esc(label)}</button>`;
    brushes.innerHTML = `<div class="td-bgroup"><span class="label-mono">Click does</span>${b("cycle", "Cycle", "Each click steps through 0, 1, X, Z, data")}</div>` +
      BRUSH_GROUPS.map(([name, vs]) => `<div class="td-bgroup"><span class="label-mono">${name}</span>${vs.map((v) => b(v, LABEL[v] ?? v, title[v] ?? v)).join("")}</div>`).join("") +
      `<div class="td-bgroup"><span class="label-mono">Arrows</span>${b("node", "• node", "Put a letter on a step so an arrow can join it to another")}</div>`;
  }
  brushes.addEventListener("click", (e) => { const t = e.target.closest("[data-brush]"); if (t) { brush = t.dataset.brush; renderBrushes(); } });

  // ---- Edit: the step grid ----
  function renderGrid() {
    const n = stepCount(value);
    $(".td-nsteps").textContent = String(n);
    const head = `<div class="td-row td-head"><div class="td-name"></div><div class="td-cells" style="--n:${n}">${Array.from({ length: n }, (_, i) => `<span class="td-stepno${i === frame ? " is-marked" : ""}">${i + 1}</span>`).join("")}</div><div class="td-delay label-mono">delay</div></div>`;
    const rows = value.signal.map((s, si) => {
      const tools = `<button type="button" class="td-mini" data-act="up" aria-label="Move up">↑</button><button type="button" class="td-mini" data-act="down" aria-label="Move down">↓</button><button type="button" class="td-mini" data-act="del" aria-label="Remove">✕</button>`;
      if (!s.name && !s.wave) return `<div class="td-row td-spacer" data-s="${si}"><div class="td-name"><span class="fe-hint">spacer</span>${tools}</div><div></div><div></div></div>`;
      const node = s.node ?? "";
      const cells = cellsOf(s, n).map((c, i) => {
        const v = c.value === "=" ? "data" : c.value, letter = node[i] && node[i] !== "." ? node[i] : "";
        const shown = /^[=3-9]$/.test(c.value) ? esc(dataAt(s, i) || LABEL[c.value] || c.value) : c.gap ? "‖" : c.held ? "" : esc(LABEL[c.value] ?? c.value);
        return `<button type="button" class="td-cell v-${v}${c.held ? " is-held" : ""}${i === frame ? " is-marked" : ""}" data-step="${i}" title="Step ${i + 1}: ${esc(LABEL[c.value] ?? c.value)}${c.held ? " (held)" : ""}${letter ? `, node ${letter}` : ""}">${shown}${letter ? `<sup class="td-node">${esc(letter)}</sup>` : ""}</button>`;
      }).join("");
      const more = open.has(si) ? `<div class="td-more" data-s="${si}">
          <label>Period <input class="form-control form-control-sm" type="number" min="0.25" step="0.25" data-prop="period" value="${Number(s.period) || 1}"></label>
          <label>Phase <input class="form-control form-control-sm" type="number" step="0.05" data-prop="phase" value="${Number(s.phase) || 0}"></label>
          <label>Group <input class="form-control form-control-sm" data-prop="group" value="${esc(s.group ?? "")}" placeholder="none"></label>
          <label class="form-check"><input class="form-check-input" type="checkbox" data-act="clock"${isClock(s) ? " checked" : ""}> clock</label></div>` : "";
      return `<div class="td-row" data-s="${si}">
        <div class="td-name"><span title="${esc(s.name)}">${esc(s.name)}</span>
          <button type="button" class="td-mini" data-act="more" aria-expanded="${open.has(si)}" title="Period, phase, group, clock">⚙</button>${tools}</div>
        <div class="td-cells" style="--n:${n}">${cells}</div>
        <input class="form-control form-control-sm td-delay" type="number" step="0.05" data-act="delay" value="${Number(s.delay) || 0}" aria-label="Delay of ${esc(s.name)} in steps" title="Delay in steps (fractions allowed)">
      </div>${more}`;
    }).join("");
    if (grid.contains(document.activeElement) && document.activeElement.matches("input:not([type=checkbox])")) return;   // don't rebuild under the cursor
    grid.innerHTML = value.signal.length ? head + rows : "";
  }
  const sigIndex = (e) => Number(e.target.closest("[data-s]")?.dataset.s);
  grid.addEventListener("click", (e) => {
    const si = sigIndex(e);
    const cell = e.target.closest("[data-step]");
    if (cell) {
      const step = Number(cell.dataset.step), cur = cellsOf(value.signal[si], stepCount(value))[step];
      if (e.shiftKey) return commit(setCell(value, si, step, "."));
      if (brush === "node") {
        const has = (value.signal[si].node ?? "")[step];
        return commit(setNode(value, si, step, has && has !== "." ? null : nextLetter(value)));
      }
      if (brush !== "cycle") return commit(setCell(value, si, step, brush));
      return commit(setCell(value, si, step, nextValue(cur.value)));
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "more") { if (open.has(si)) open.delete(si); else open.add(si); renderGrid(); }
    if (act === "clock") commit(setClock(value, si, !isClock(value.signal[si])));
    if (act === "up" || act === "down") { open.clear(); commit(moveSignal(value, si, act === "up" ? -1 : 1)); }
    if (act === "del") { open.clear(); commit(removeSignal(value, si), `Removed ${value.signal[si].name || "the spacer"}.`); }
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
    const si = sigIndex(e), step = Number(cell.dataset.step), s = value.signal[si], c = cellsOf(s, stepCount(value))[step].value;
    if (!/^[=3-9]$/.test(c)) return;
    const label = window.prompt("Label of this data value", dataAt(s, step));
    if (label !== null) commit(setCell(value, si, step, c, label.trim()));
  });
  grid.addEventListener("change", (e) => {
    const si = sigIndex(e);
    if (e.target.dataset.act === "delay") commit(setDelay(value, si, e.target.value));
    if (e.target.dataset.prop) commit(setProp(value, si, e.target.dataset.prop, e.target.value));
  });

  // ---- Edit: edges between nodes ----
  const edgesEl = $(".td-edges");
  function renderEdges() {
    if (edgesEl.contains(document.activeElement) && document.activeElement.matches("input")) return;
    const letters = nodeLetters(value), es = edgesOf(value);
    const pick = (v, f) => `<select class="form-select form-select-sm" data-edge-f="${f}">${letters.map((l) => `<option${l === v ? " selected" : ""}>${esc(l)}</option>`).join("")}${v && !letters.includes(v) ? `<option selected>${esc(v)}</option>` : ""}</select>`;
    edgesEl.innerHTML = `<div class="td-edgehead"><span class="label-mono">Arrows between nodes</span><button type="button" class="td-chip" data-do="add-edge"${letters.length < 2 ? ' disabled title="Put two nodes on steps first (the • node brush)"' : ""}>+ Arrow</button></div>` +
      es.map((e, i) => `<div class="td-edge" data-e="${i}">${pick(e.from, "from")}<select class="form-select form-select-sm" data-edge-f="op">${EDGE_OPS.map(([op, t]) => `<option value="${esc(op)}"${op === e.op ? " selected" : ""}>${esc(op)} ${esc(t)}</option>`).join("")}</select>${pick(e.to, "to")}<input class="form-control form-control-sm" data-edge-f="label" value="${esc(e.label)}" placeholder="label"><button type="button" class="td-mini" data-edge-del aria-label="Remove arrow">✕</button></div>`).join("");
  }
  edgesEl.addEventListener("change", (e) => { const i = Number(e.target.closest("[data-e]")?.dataset.e), f = e.target.dataset.edgeF; if (f) commit(setEdge(value, i, { [f]: f === "label" ? e.target.value.trim() : e.target.value })); });
  edgesEl.addEventListener("click", (e) => {
    if (e.target.closest("[data-edge-del]")) return commit(removeEdge(value, Number(e.target.closest("[data-e]").dataset.e)));
    if (e.target.closest("[data-do=add-edge]")) { const l = nodeLetters(value); if (l.length >= 2) commit(addEdge(value, { from: l[0], op: "->", to: l[1], label: "" })); }
  });

  // ---- head, foot and step width ----
  const hsIn = $("[data-size=hscale]"), slantIn = $("[data-look=slant]");
  function renderBands() {
    for (const i of root.querySelectorAll("[data-band]")) {
      if (i === document.activeElement) continue;
      const b = value[i.dataset.band] ?? {}, k = i.dataset.key;
      if (i.type === "checkbox") i.checked = b[k] !== undefined; else i.value = b[k] ?? "";
    }
  }
  root.addEventListener("change", (e) => {
    const i = e.target;
    if (i.dataset?.band) commit(setBand(value, i.dataset.band, { [i.dataset.key]: i.type === "checkbox" ? i.checked : i.value }));
    if (i === hsIn) commit(setHscale(value, i.value));
    if (i === slantIn) commit(setSlant(value, i.value));
  });

  root.addEventListener("click", (e) => {
    const act = e.target.closest("[data-do]")?.dataset.do;
    if (act === "steps-") commit(setSteps(value, stepCount(value) - 1));
    if (act === "steps+") commit(setSteps(value, stepCount(value) + 1));
    if (act === "natural" && natural) { custom = true; wIn.value = natural.w; hIn.value = natural.h; render(); }
    if (act === "export") exportSvg();
    if (act === "new") {   // the page's New also clears the figure the Figure Editor keeps in this browser
      if (!window.confirm("Start over? This clears the diagram and the figure in the Figure Editor.")) return;
      clear();
      try { localStorage.removeItem(EDITOR_KEY); } catch { /* storage unavailable */ }
      nodes = []; renderChips(); say("New: the diagram and the figure are cleared.");
    }
    if (act === "add-all") { let v = value; for (const nd of nodes) v = addSignal(v, nd.name, { clock: CLOCK.test(nd.name) }); commit(v, "Added every node."); }
    if (act === "add-custom") { const name = window.prompt("Name of the signal"); if (name?.trim()) commit(addSignal(value, name.trim(), { clock: CLOCK.test(name.trim()) })); }
    if (act === "add-spacer") commit(addSpacer(value), "Added a spacer.");
    if (act === "src-apply") { const r = parseSource(srcText.value); if (!r.ok) return say(r.error, true); commit(fromWaveDrom(r.value), "Using the pasted source."); showView("edit"); }
    if (act === "src-copy") { navigator.clipboard?.writeText(srcText.value).then(() => say("Copied the WaveDrom source."), () => say("The browser would not copy; select the text and copy it.", true)); }
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

  /** Start over: no signals, no frames, nothing sent to the slide. The Figure Editor's New calls this too. */
  function clear() {
    value = empty(); custom = false; frame = -1; open.clear();
    store.set(KEY, tidy(value));
    try { localStorage.removeItem("timing-diagram/send"); } catch { /* storage unavailable */ }
    setFrames([]);
    say("New: the diagram is empty.");
  }
  // ---- to the Figure Editor's slide ----
  /** Per-step levels of each named signal, for the editor's frames: 0 1 X Z, or null where there is no level (data boxes). */
  const signalLevels = () => lanesOf(toWaveDrom(value)).filter((l) => l.name).map((l) => ({
    name: l.name,
    levels: stepsOf(l.wave).flatMap((s) => Array(l.period).fill(({ 0: "0", l: "0", d: "0", n: "0", N: "0", 1: "1", h: "1", u: "1", p: "1", P: "1", x: "X", z: "Z" })[s.c] ?? null)),
  }));
  root.addEventListener("click", (e) => {
    if (!e.target.closest("[data-do=send]")) return;
    if (!value.signal.length) return say("Nothing to send yet.", true);
    store.set("timing-diagram/send", JSON.stringify({ svg: drawNow(false), w: Number(wIn.value) || natural.w, h: Number(hIn.value) || natural.h, signals: signalLevels(), source: toWaveDrom(value), at: Date.now() }));
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
  return { render, setCircuit, clear, get source() { return tidy(toWaveDrom(value)); }, set source(v) { const r = parseSource(v); if (r.ok) commit(fromWaveDrom(r.value)); }, get value() { return value; } };
}
