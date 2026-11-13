// The figure editor page: tools, pointer and keyboard handling, commands, save and load.
//
//   import { mount } from "./src/app.js";
//   mount(element, { pack: "./symbol-pack/", open: "examples/full-adder.json" });
//
// Every change to the figure goes through the pure functions in doc.js; this file
// only decides which one to call and records it for undo.

import { LEVELS, loadPack, parsePrivateTheme } from "./pack.js";
import * as D from "./doc.js";
import { History } from "./history.js";
import { exportSize, exportSvg, labelBoxes } from "./export.js";
import { hitTest, inBox } from "./hit.js";
import { packLabelPt, texNeeded } from "./labels.js";
import { typesetAll } from "./mathjax.js";
import { route } from "./router.js";
import { createView, thumbnail } from "./view.js";

const AUTOSAVE = "figure-editor/autosave";
const SAVES = "figure-editor/saves";               // the last 10 manual saves
const OPTIONS = "figure-editor/options";           // scale, label size, tags, drafts: per-viewer conveniences
const THEME = "figure-editor/private-theme";       // a private theme: kept in this browser only, never sent anywhere
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* nothing to remove */ } },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const snapStep = (p) => [Math.round(p[0]) || 0, Math.round(p[1]) || 0];
const snapModule = (p) => [2 * Math.round(p[0] / 2) || 0, 2 * Math.round(p[1] / 2) || 0];   // parts sit on whole modules
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const none = () => ({ elements: [], wires: [], ports: [], labels: [] });
const total = (s) => s.elements.length + s.wires.length + s.ports.length + s.labels.length;

/** The keys, in one place: the "?" panel shows this table. */
export const KEYS = [
  ["W", "Wire tool: click corners; click a pin, junction or wire to finish; Enter ends the wire where it is; Backspace removes a corner"],
  ["P", "Port tool: click a point, a pin tip or a wire end to put an input or output port there"],
  ["T", "Label tool: click a point, then type the label (TeX such as $A_0$) in the panel and press Enter"],
  ["R", "Rotate the selected parts 90° counter-clockwise (or the part being placed)"],
  ["M", "Mirror the selected parts, for elements the symbol pack marks mirrorable"],
  ["Delete, Backspace", "Delete the selection"],
  ["0  1  X  Z", "Set the logic level the selected wires are drawn at (low, high, unknown, floating)"],
  ["Ctrl+Z, Ctrl+Y", "Undo, redo (Ctrl+Shift+Z also redoes)"],
  ["Ctrl+C, Ctrl+V, Ctrl+A", "Copy, paste, select all"],
  ["Ctrl+S", "Save the figure as a .json file"],
  ["Arrow keys", "Move the selection (a module for parts, a grid step for wires and labels); pan when nothing is selected"],
  ["Shift+click", "Add to or remove from the selection; while placing, keep placing"],
  ["Drag on empty canvas", "Box select"],
  ["Mouse wheel, + and −", "Zoom"],
  ["Space+drag, middle button+drag", "Pan"],
  ["F", "Fit the figure in the window"],
  ["Esc", "Cancel what you are doing, go back to Select, or clear the selection"],
  ["?", "Show or hide this list"],
];

const BUTTON = "btn btn-sm btn-outline-secondary";
const btn = (cmd, label, keys = "", extra = "") =>
  `<button type="button" class="${BUTTON}" data-cmd="${cmd}"${keys ? ` aria-keyshortcuts="${keys}" title="${label} (${keys})"` : ""}${extra}>${label}</button>`;

export async function mount(root, options = {}) {
  const base = new URL(options.pack ?? "./symbol-pack/", document.baseURI);
  root.innerHTML = `<p class="fe-status" role="status">Loading the symbol pack…</p>`;
  let loaded;
  try {
    loaded = await loadPack(async (p) => {
      const r = await fetch(new URL(p, base));
      if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
      return r.text();
    });
  } catch (e) {
    root.innerHTML = `<p class="fe-status" role="alert">Could not load the symbol pack: ${esc(e.message)}</p>`;
    return null;
  }
  let pack = loaded;                                   // the active pack: the loaded one, or it drawn with a private theme

  root.innerHTML = `
  <div class="fe">
    <div class="fe-toolbar" role="toolbar" aria-label="Figure editor">
      <div class="btn-group" role="group" aria-label="Tool">
        ${btn("select", "Select", "Escape", ' aria-pressed="true"')}${btn("wire", "Wire", "W", ' aria-pressed="false"')}${btn("port", "Port", "P", ' aria-pressed="false"')}${btn("label", "Label", "T", ' aria-pressed="false"')}
      </div>
      <div class="btn-group" role="group" aria-label="Edit">
        ${btn("rotate", "Rotate", "R")}${btn("mirror", "Mirror", "M")}${btn("delete", "Delete", "Delete")}
      </div>
      <div class="btn-group" role="group" aria-label="History">
        ${btn("undo", "Undo", "Control+Z")}${btn("redo", "Redo", "Control+Y")}
      </div>
      <div class="btn-group" role="group" aria-label="Clipboard">
        ${btn("copy", "Copy", "Control+C")}${btn("paste", "Paste", "Control+V")}
      </div>
      <div class="btn-group" role="group" aria-label="View">
        ${btn("zoomout", "Zoom out", "-")}${btn("zoomin", "Zoom in", "+")}${btn("fit", "Fit", "F")}
      </div>
      <div class="btn-group" role="group" aria-label="File">
        ${btn("new", "New")}${btn("open", "Open…")}${btn("save", "Save", "Control+S")}${btn("export", "Export SVG")}${btn("png", "Copy as PNG")}
      </div>
      ${btn("help", "?", "?", ' aria-label="Keys"')}
      <input type="file" class="fe-file" accept=".json,application/json" hidden>
      <input type="file" class="fe-theme-file" accept=".json,application/json" hidden>
    </div>
    <div class="fe-main">
      <nav class="fe-palette" aria-label="Elements">
        <label class="fe-drafts"><input type="checkbox" name="fe-drafts"> Show drafts</label>
        <ul></ul>
      </nav>
      <div class="fe-stage">
        <svg class="fe-canvas" tabindex="0" role="application" aria-label="Figure canvas" xmlns="http://www.w3.org/2000/svg"></svg>
      </div>
      <div class="fe-side" role="region" aria-label="Figure properties">
        <label class="form-label">Figure id <input class="form-control form-control-sm" name="fe-id" spellcheck="false"></label>
        <label class="form-label">Title <input class="form-control form-control-sm" name="fe-title"></label>
        <section class="fe-props" aria-label="Selection"></section>
        <fieldset class="fe-export">
          <legend>Export</legend>
          <label class="form-label">Scale (%) <input class="form-control form-control-sm" type="number" name="fe-scale" min="10" max="1000" step="5"></label>
          <label class="form-label">Label size (pt) <input class="form-control form-control-sm" type="number" name="fe-labelpt" min="4" max="48" step="0.5"></label>
          <label class="form-check"><input class="form-check-input" type="checkbox" name="fe-tags"> <span class="form-check-label">Level tags (0, 1, X, Z) by each wire</span></label>
          <p class="fe-size" aria-live="polite"></p>
        </fieldset>
        <fieldset class="fe-theme">
          <legend>Theme</legend>
          <p class="fe-theme-note"></p>
          <div class="btn-group" role="group" aria-label="Theme">${btn("theme", "Private theme…")}${btn("themereset", "Default theme")}</div>
        </fieldset>
        <section class="fe-warnings" aria-label="Warnings"><ul></ul></section>
      </div>
    </div>
    <p class="fe-status" role="status" aria-live="polite"></p>
    <dialog class="fe-help" aria-labelledby="fe-help-title">
      <h2 id="fe-help-title">Keys</h2>
      <table><tbody>${KEYS.map(([k, what]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(what)}</td></tr>`).join("")}</tbody></table>
      <form method="dialog"><button class="${BUTTON}">Close</button></form>
    </dialog>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const svg = $(".fe-canvas"), statusEl = $(".fe-status"), fileInput = $(".fe-file"), themeInput = $(".fe-theme-file");
  const idInput = $('[name="fe-id"]'), titleInput = $('[name="fe-title"]'), propsEl = $(".fe-props"), helpEl = $(".fe-help");
  const scaleInput = $('[name="fe-scale"]'), ptInput = $('[name="fe-labelpt"]'), tagsInput = $('[name="fe-tags"]'), draftsInput = $('[name="fe-drafts"]');
  const view = createView(svg, loaded);

  // ---- state ---------------------------------------------------------------------------
  let doc = D.newDoc();
  const history = new History();
  let selection = none();
  let tool = "select";               // select | wire | port | label | place
  let placing = null;                // {type, rotation}
  let wiring = null;                 // {from: target, fromAt, via: [...]}
  let pendingLabel = null;           // {at, side}: a label waiting for its text
  let drag = null;
  let pointer = null;                // last pointer position, grid steps
  let hover = null, ghost = null, rubber = null, boxSel = null;
  let clipboard = null, pasteCount = 0;
  let loadWarnings = [];
  let spaceHeld = false;
  let lastDrawing = null;
  let autosaveTimer = null;
  const typeset = new Map();         // TeX to parseTypeset's result (every label drawn is typeset once)

  const opt = { scale: 1, labelPt: null, levelTags: false, drafts: false, ...(() => { try { return JSON.parse(store.get(OPTIONS) ?? "{}"); } catch { return {}; } })() };
  const saveOptions = () => store.set(OPTIONS, JSON.stringify(opt));
  const drawOpts = () => ({ typeset, labelPt: opt.labelPt ?? undefined, levelTags: opt.levelTags, scale: opt.scale });

  const status = (msg) => { statusEl.textContent = msg; };

  // ---- the private theme (kept in this browser only) ----------------------------------------
  function applyTheme(text, announce) {
    const roles = parsePrivateTheme(text);
    pack = loaded.withTheme(roles);
    if (announce) store.set(THEME, text);
  }
  const savedTheme = store.get(THEME);
  if (savedTheme) { try { applyTheme(savedTheme, false); } catch { store.remove(THEME); } }

  // ---- typesetting (MathJax, once per distinct label) -------------------------------------------
  let typesetBusy = false, typesetAgain = false;
  async function queueTypeset() {
    if (typesetBusy) { typesetAgain = true; return; }
    typesetBusy = true;
    try {
      do {
        typesetAgain = false;
        const needed = texNeeded(doc, pack, { levelTags: opt.levelTags });
        if (needed.some((t) => !typeset.has(t) || typeset.get(t).retry)) { await typesetAll(needed, typeset); render(); }
      } while (typesetAgain);
    } finally { typesetBusy = false; }
  }

  // ---- rendering -------------------------------------------------------------------------
  function render() {
    lastDrawing = view.render({
      doc, pack, selection, ghost, rubber, hover, box: boxSel,
      typeset, labelPt: opt.labelPt ?? undefined, levelTags: opt.levelTags,
    });
    if (lastDrawing.pending.length) queueTypeset();
    updateUI();
  }

  function renderPalette() {
    $(".fe-palette ul").innerHTML = pack.types(opt.drafts).map((t) =>
      `<li><button type="button" class="fe-part" data-type="${esc(t)}" title="${esc(pack.def(t).description)}">${thumbnail(pack, t)}<span>${esc(t)}</span></button></li>`).join("");
  }

  function updateUI() {
    const has = total(selection) > 0;
    const set = (cmd, enabled) => { const b = root.querySelector(`[data-cmd="${cmd}"]`); b.disabled = !enabled; };
    const mirrorable = (placing && pack.mirrorable(placing.type)) ||
      selection.elements.some((id) => pack.mirrorable(doc.elements.find((e) => e.id === id)?.type));
    set("rotate", placing || selection.elements.length);
    set("mirror", mirrorable);
    set("delete", has);
    set("copy", has);
    set("paste", !!clipboard);
    set("undo", history.canUndo);
    set("redo", history.canRedo);
    for (const t of ["select", "wire", "port", "label"]) root.querySelector(`[data-cmd="${t}"]`).setAttribute("aria-pressed", String(tool === t));
    svg.dataset.tool = tool;
    if (document.activeElement !== idInput) idInput.value = doc.id;
    if (document.activeElement !== titleInput) titleInput.value = doc.title ?? "";
    renderProps();
    const warnings = [...loadWarnings, ...D.lint(doc, pack)];
    if (lastDrawing) warnings.push(...lastDrawing.problems.filter((p) => !p.endsWith("not typeset yet")));
    $(".fe-warnings ul").innerHTML = warnings.map((w) => `<li>${esc(w)}</li>`).join("");
    $(".fe-warnings").hidden = !warnings.length;
    if (lastDrawing) {
      const { widthCm, heightCm } = exportSize(lastDrawing, opt.scale);
      $(".fe-size").textContent = lastDrawing.box ? `File size: ${widthCm.toFixed(2)} × ${heightCm.toFixed(2)} cm${opt.scale === 1 ? " (real size)" : ""}` : "Nothing to export yet.";
    }
    $(".fe-theme-note").textContent = pack.isPrivate
      ? "Private theme loaded. It is kept in this browser only and is never saved in a figure or sent anywhere."
      : `Default theme (${loaded.theme.theme}), from the symbol pack.`;
  }

  // ---- the properties panel ---------------------------------------------------------------
  const field = (label, name, extra = "") => `<label class="form-label">${label} <input class="form-control form-control-sm" data-field="${name}" spellcheck="false" ${extra}></label>`;
  const choice = (label, name, opts) => `<label class="form-label">${label} <select class="form-select form-select-sm" data-field="${name}">${opts.map(([v, t, off]) => `<option value="${v}"${off ? " disabled" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  const SIDE_OPTS = [["", "centred on the point"], ["left", "left of the point"], ["right", "right of the point"], ["up", "above the point"], ["down", "below the point"]];
  const levelOpts = () => [["", "none (default colour)"], ...LEVELS.map((l) => [l.value, `${l.value}: ${l.name}`, !pack.levelColour(l.value)])];

  function propsModel() {
    const only = (list) => list.length === 1 && total(selection) === 1;
    const text = {}, values = {};
    let html = "", key;
    if (pendingLabel) {
      key = "pending";
      html = `<p>New label at [${pendingLabel.at.join(", ")}]</p>${field("Label text (TeX, such as $A_0$)", "pendingText")}<p class="fe-hint">Press Enter to add it, Esc to cancel.</p>`;
    } else if (only(selection.elements)) {
      const el = doc.elements.find((e) => e.id === selection.elements[0]);
      const def = el && pack.def(el.type);
      key = `el:${el?.id}`;
      html = `<dl><dt>Element</dt><dd data-text="elDesc"></dd><dt>Position</dt><dd data-text="elPos"></dd><dt>Rotation</dt><dd data-text="elRot"></dd><dt>Mirror</dt><dd data-text="elMirror"></dd></dl>` +
        (def?.label ? field("Label (TeX, such as $R_1$)", "elLabel") : `<p class="fe-hint">The symbol pack gives this element no label position.</p>`);
      if (el) {
        text.elDesc = `${el.id}: ${el.type}. ${def?.description ?? ""}`; text.elPos = `[${el.at.join(", ")}] grid steps`; text.elRot = `${el.rotation ?? 0}°`;
        text.elMirror = pack.mirrorable(el.type) ? (el.mirror ? "on" : "off") : "not available: the symbol pack does not mark this element mirrorable";
        values.elLabel = el.label ?? "";
      }
    } else if (only(selection.ports)) {
      const p = doc.ports.find((x) => x.id === selection.ports[0]);
      key = `port:${p?.id}`;
      html = `<p><strong>Port</strong> at <span data-text="portPos"></span></p>${field("Id (also the net's name)", "portId")}${choice("Direction", "portDir", [["in", "input"], ["out", "output"]])}${field("Label (TeX, such as $A_0$)", "portLabel")}${choice("Label side", "portSide", SIDE_OPTS)}`;
      if (p) { text.portPos = `[${p.at.join(", ")}]`; Object.assign(values, { portId: p.id, portDir: p.dir, portLabel: p.label ?? "", portSide: p.side ?? "" }); }
    } else if (only(selection.labels)) {
      const l = doc.labels[selection.labels[0]];
      key = `label:${selection.labels[0]}`;
      html = `<p><strong>Label</strong> at <span data-text="labelPos"></span></p>${field("Text (TeX, such as $A_0$)", "labelText")}${choice("Side", "labelSide", SIDE_OPTS)}`;
      if (l) { text.labelPos = `[${l.at.join(", ")}]`; Object.assign(values, { labelText: l.text, labelSide: l.side ?? "" }); }
    } else {
      const wires = selection.wires.map((id) => doc.wires.find((w) => w.id === id)).filter(Boolean);
      key = `sel:${JSON.stringify(selection)}`;
      html = `<p data-text="summary"></p>`;
      text.summary = total(selection)
        ? `${count(selection.elements.length, "element")}, ${count(selection.wires.length, "wire")}, ${count(selection.ports.length, "port")} and ${count(selection.labels.length, "label")} selected`
        : `${count(doc.elements.length, "element")}, ${count(doc.wires.length, "wire")}, ${count(doc.ports.length, "port")}, ${count(doc.labels.length, "label")}`;
      if (wires.length === 1) {
        const end = (e) => (D.isPoint(e) ? `[${e.join(", ")}]` : e);
        html += `<dl><dt>Wire</dt><dd>${esc(wires[0].id)}: ${esc(end(wires[0].from))} to ${esc(end(wires[0].to))}</dd></dl>`;
      }
    }
    if (!pendingLabel && selection.wires.length) {   // the level applies to every selected wire
      const wires = selection.wires.map((id) => doc.wires.find((w) => w.id === id)).filter(Boolean);
      const levels = new Set(wires.map((w) => w.level ?? ""));
      const one = levels.size === 1 ? [...levels][0] : null;
      key += `|level`;
      html += `<p class="fe-level" data-text="levelText"></p>${choice("Level", "level", levelOpts())}`;
      const name = LEVELS.find((l) => l.value === one);
      text.levelText = one === null ? "Level: mixed" : one === "" ? "Level: none (default colour)" : `Level: ${one} (${name.name})`;
      values.level = one ?? "";
    }
    return { key, html, text, values };
  }

  let panelKey = null;
  function renderProps() {
    const m = propsModel();
    if (m.key !== panelKey) { propsEl.innerHTML = m.html; panelKey = m.key; }
    for (const el of propsEl.querySelectorAll("[data-text]")) el.textContent = m.text[el.dataset.text] ?? "";
    for (const el of propsEl.querySelectorAll("[data-field]")) {
      if (el !== document.activeElement && el.dataset.field in m.values) el.value = m.values[el.dataset.field];
    }
  }

  propsEl.addEventListener("change", (e) => {
    const name = e.target.dataset?.field;
    if (!name) return;
    const v = e.target.value;
    try {
      if (name === "pendingText") {
        if (!v.trim() || !pendingLabel) return;
        const r = D.addLabel(doc, pendingLabel.at, v.trim(), pendingLabel.side);
        pendingLabel = null;
        commit(r.doc, "Added a label.");
        selection = { ...none(), labels: [r.index] };
        setTool("select");
      } else if (name === "elLabel") {
        commit(D.setElementLabel(doc, selection.elements[0], v.trim()), "Label changed.");
      } else if (name.startsWith("port")) {
        const id = selection.ports[0];
        const field = { portId: "id", portDir: "dir", portLabel: "label", portSide: "side" }[name];
        commit(D.setPort(doc, pack, id, { [field]: v.trim() }), "Port changed.");
        if (name === "portId") selection = { ...selection, ports: [v.trim()] };
      } else if (name.startsWith("label")) {
        const field = { labelText: "text", labelSide: "side" }[name];
        if (name === "labelText" && !v.trim()) { status("A label needs some text; delete it to remove it."); return; }
        commit(D.setLabel(doc, selection.labels[0], { [field]: v.trim() }), "Label changed.");
      } else if (name === "level") {
        setLevel(v === "" ? null : v);
      }
    } catch (err) { status(err.message); }
    render();
  });
  propsEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pendingLabel) { e.preventDefault(); pendingLabel = null; setTool("select"); svg.focus(); status("Label cancelled."); return; }
    // Enter commits a text field (its change event fires as it loses focus) and Esc leaves it; either way the
    // canvas gets the keyboard back, so a hotkey (W, P, T, R, ...) works straight after typing a label.
    if ((e.key === "Enter" || e.key === "Escape") && e.target.matches("input[data-field]")) { e.preventDefault(); e.target.blur(); svg.focus(); }
  });

  // ---- editing ---------------------------------------------------------------------------
  function changed(msg) {
    render();
    if (msg) status(msg);
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => store.set(AUTOSAVE, D.serialize(doc, pack)), 800);
    queueTypeset();
  }

  function prune() {
    const els = new Set(doc.elements.map((e) => e.id)), ws = new Set(doc.wires.map((w) => w.id)), ps = new Set(doc.ports.map((p) => p.id));
    selection = {
      elements: selection.elements.filter((id) => els.has(id)), wires: selection.wires.filter((id) => ws.has(id)),
      ports: selection.ports.filter((id) => ps.has(id)), labels: selection.labels.filter((i) => i < doc.labels.length),
    };
  }

  /** Make `next` the document, recorded as one undo step. */
  function commit(next, msg) {
    if (JSON.stringify(next) === JSON.stringify(doc)) return false;
    history.record(doc);
    doc = next;
    prune();
    changed(msg);
    return true;
  }

  function setTool(t) {
    tool = t;
    if (t !== "wire") { wiring = null; rubber = null; }
    if (t !== "place") { placing = null; ghost = null; }
    if (t !== "label") pendingLabel = null;
    hover = null;
    render();
  }

  function setLevel(level) {
    if (!selection.wires.length) { status("Select one or more wires first."); return; }
    if (level && !pack.levelColour(level)) { status(`This theme has no colour for level ${level}.`); return; }
    const name = LEVELS.find((l) => l.value === level)?.name;
    commit(D.setLevel(doc, selection.wires, level), level ? `Level ${level} (${name}) set on ${count(selection.wires.length, "wire")}.` : "Level cleared.");
  }

  function startPlacing(type, viaKeyboard) {
    if (viaKeyboard) {
      // No pointer: place at the middle of the view and select it, so arrow keys can move it.
      const c = view.cam, at = snapModule([c.cx * 2, -c.cy * 2]);
      const r = D.addElement(doc, pack, type, at);
      commit(r.doc, `Placed ${r.id}. Arrow keys move it; R rotates.`);
      selection = { ...none(), elements: [r.id] };
      setTool("select");
      svg.focus();
      return;
    }
    setTool("place");
    placing = { type, rotation: 0 };
    if (pointer) ghost = { type, at: snapModule(pointer), rotation: 0 };
    status(`Placing ${type}: click to place (Shift keeps placing), R rotates, Esc cancels.`);
    render();
  }

  const boxes = () => (lastDrawing ? labelBoxes(lastDrawing) : []);
  const targets = (p) => hitTest(doc, pack, p, undefined, boxes());

  function endFor(t) {
    if (t.kind === "pin") return D.endpoint(doc, pack, t.ref);
    return { at: t.at, dir: null };
  }

  /** A point the pointer snaps to for a port or label: a pin tip, junction, port or wire if one is there, else the grid. */
  function snapPoint(p) {
    const h = targets(p).find((x) => ["pin", "junction", "port", "wire"].includes(x.kind) && x.at && !x.textOnly);
    return h ? h.at : snapStep(p);
  }

  function wireTarget(p) {
    const h = targets(p).find((x) => ["pin", "junction", "port", "wire"].includes(x.kind) && !x.textOnly);
    if (h) return h.kind === "pin" ? { kind: "pin", ref: h.ref, at: h.at } : h.kind === "wire" ? { kind: "wire", id: h.id, at: h.at } : { kind: h.kind, id: h.id, at: h.at };
    let at = snapStep(p);
    if (wiring) {   // clicked corners go straight across or straight up and down from the last one
      const last = wiring.via.at(-1) ?? wiring.fromAt;
      at = Math.abs(at[0] - last[0]) >= Math.abs(at[1] - last[1]) ? [at[0], last[1]] : [last[0], at[1]];
    }
    return { kind: "point", at };
  }

  function wireClick(p) {
    const t = wireTarget(p);
    if (!wiring) {
      wiring = { from: t, fromAt: t.at, via: [] };
      status("Wire: click to add corners; click a pin, junction or wire to finish; click twice or press Enter to end it here; Esc cancels.");
      updateRubber(p);
      return;
    }
    if (t.kind === "point") {
      if (same(t.at, wiring.via.at(-1) ?? wiring.fromAt)) return finishWire(t);
      wiring.via.push(t.at);
      updateRubber(p);
      return;
    }
    finishWire(t);
  }

  function finishWire(t) {
    try {
      const r = D.addWire(doc, pack, wiring.from, t, wiring.via);
      if (r.id) commit(r.doc, `Added wire ${r.id}.`);
      else status("A wire needs some length.");
    } catch (e) {
      status(`Could not add the wire: ${e.message}`);
    }
    wiring = null; rubber = null;
    render();
  }

  function updateRubber(p) {
    if (!wiring) { rubber = null; return; }
    const t = wireTarget(p);
    rubber = route(endFor(wiring.from), endFor(t), wiring.via);
    hover = t.kind !== "point" ? t.at : null;
    render();
  }

  function portClick(p) {
    const at = snapPoint(p);
    const side = D.exitSide(doc, pack, at);
    const dir = side === "right" ? "out" : "in";
    const r = D.addPort(doc, pack, at, dir);
    const named = D.setPort(r.doc, pack, r.id, { side: side ?? (dir === "in" ? "left" : "right") });
    commit(named, `Placed port ${r.id}. Type its label in the panel.`);
    selection = { ...none(), ports: [r.id] };
    setTool("select");
    propsEl.querySelector('[data-field="portLabel"]')?.focus();
  }

  function labelClick(p) {
    const at = snapPoint(p);
    pendingLabel = { at, side: D.exitSide(doc, pack, at) };
    selection = none();
    panelKey = null;
    render();
    propsEl.querySelector('[data-field="pendingText"]')?.focus();
    status("Type the label in the panel and press Enter.");
  }

  // ---- commands ----------------------------------------------------------------------------
  const commands = {
    select: () => { setTool("select"); status("Select: click or drag a box; drag to move."); },
    wire: () => { setTool("wire"); status("Wire: click a pin, junction, wire or empty grid point to start."); },
    port: () => { setTool("port"); status("Port: click a point, a pin tip or a wire end."); },
    label: () => { setTool("label"); status("Label: click where the label goes."); },
    rotate() {
      if (placing) { placing.rotation = (placing.rotation + 90) % 360; if (ghost) ghost.rotation = placing.rotation; render(); return; }
      if (selection.elements.length) commit(D.rotateElements(doc, pack, selection.elements), `Rotated ${selection.elements.join(", ")}.`);
    },
    mirror() {
      if (!selection.elements.length) return;
      const r = D.mirrorElements(doc, pack, selection.elements);
      commit(r.doc, "Mirrored.");
      if (r.refused.length) status(`Not mirrored: ${r.refused.join(", ")}. The symbol pack does not mark ${r.refused.length > 1 ? "them" : "it"} mirrorable.`);
    },
    delete() {
      if (!total(selection)) return;
      const n = total(selection);
      commit(D.deleteSelection(doc, pack, selection), `Deleted ${count(n, "item")}.`);
      selection = none();
      render();
    },
    undo() { const prev = history.undo(doc); if (prev) { doc = prev; prune(); changed("Undone."); } },
    redo() { const next = history.redo(doc); if (next) { doc = next; prune(); changed("Redone."); } },
    copy() {
      if (!total(selection)) return;
      clipboard = D.extractFragment(doc, pack, selection);
      pasteCount = 0;
      status(`Copied ${count(clipboard.elements.length, "element")} and ${count(clipboard.wires.length, "wire")}.`);
      updateUI();
    },
    paste() {
      if (!clipboard) return;
      pasteCount++;
      const r = D.pasteFragment(doc, pack, clipboard, [4 * pasteCount, -4 * pasteCount]);
      commit(r.doc, "Pasted.");
      selection = r.selection;
      render();
    },
    selectAll() {
      selection = { elements: doc.elements.map((e) => e.id), wires: doc.wires.map((w) => w.id), ports: doc.ports.map((p) => p.id), labels: doc.labels.map((_, i) => i) };
      render();
    },
    zoomin: () => view.zoomAt(1 / 1.25),
    zoomout: () => view.zoomAt(1.25),
    fit: () => view.fit(lastDrawing?.box ?? null),
    new() { commit(D.newDoc(), "New figure (Undo brings the old one back)."); selection = none(); loadWarnings = []; view.fit(null); render(); },
    open: () => fileInput.click(),
    save() {
      const text = D.serialize(doc, pack);
      download(text, `${doc.id}.json`, "application/json");
      let saves = [];
      try { saves = JSON.parse(store.get(SAVES) ?? "[]"); } catch { saves = []; }
      saves.unshift({ id: doc.id, saved: new Date().toISOString(), text });
      store.set(SAVES, JSON.stringify(saves.slice(0, 10)));
      status(`Saved ${doc.id}.json.`);
    },
    async export() {
      try { download(await svgNow(), `${doc.id}.svg`, "image/svg+xml"); status(`Exported ${doc.id}.svg.`); } catch (e) { status(e.message); }
    },
    async png() {
      try {
        const blob = await pngNow();
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          status("Copied the figure to the clipboard as a PNG (300 dpi).");
        } catch (e) {
          download(blob, `${doc.id}.png`, "image/png");
          status(`The browser would not let the page use the clipboard (${e.message}), so the PNG was downloaded instead.`);
        }
      } catch (e) { status(e.message); }
    },
    help() { if (helpEl.open) helpEl.close(); else helpEl.showModal(); },
    theme: () => themeInput.click(),
    themereset() {
      store.remove(THEME);
      pack = loaded;
      render();
      status("Back to the pack's default theme.");
    },
  };

  /** The SVG as the export option settings say; labels are typeset first. Throws if one cannot be drawn. */
  async function svgNow() {
    await typesetAll(texNeeded(doc, pack, { levelTags: opt.levelTags }), typeset);
    return exportSvg(doc, pack, drawOpts());
  }

  const DPI = 300, MAX_PIXELS = 16000;

  /** The figure as a PNG at 300 dpi at its exported size (scale option included), on a transparent background. */
  async function pngNow() {
    const text = await svgNow();
    const cm = (name) => +new RegExp(`${name}="([\\d.]+)cm"`).exec(text)[1];
    let dpi = DPI;
    const longest = Math.max(cm("width"), cm("height"));
    if ((longest / 2.54) * dpi > MAX_PIXELS) dpi = (MAX_PIXELS * 2.54) / longest;
    const w = Math.max(1, Math.round((cm("width") / 2.54) * dpi)), h = Math.max(1, Math.round((cm("height") / 2.54) * dpi));
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not make the PNG"))), "image/png"));
  }

  function download(content, name, type) {
    const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Open a saved file. With `record`, it is an undo step; on start-up it is not. */
  function load(text, record = true) {
    const { doc: next, nets } = D.parse(text);
    loadWarnings = D.netsMatch(nets, D.deriveNets(next, pack)) ? [] :
      ["The file's nets did not match its drawing. Saving writes the nets the drawing makes."];
    if (record) commit(next, `Opened ${next.id}.`);
    else { doc = next; history.clear(); }
    selection = none();
    render();
    queueTypeset().then(() => view.fit(lastDrawing?.box ?? null));
    view.fit(lastDrawing?.box ?? null);
  }

  // ---- input -------------------------------------------------------------------------------
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmd]");
    if (b && commands[b.dataset.cmd]) commands[b.dataset.cmd]();
  });
  root.querySelector(".fe-palette").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (b) startPlacing(b.dataset.type, e.detail === 0);
  });
  draftsInput.checked = !!opt.drafts;
  draftsInput.addEventListener("change", () => { opt.drafts = draftsInput.checked; saveOptions(); renderPalette(); status(opt.drafts ? "Showing draft elements too." : "Showing approved elements only."); });
  scaleInput.value = String(Math.round(opt.scale * 100));
  scaleInput.addEventListener("change", () => {
    const v = +scaleInput.value;
    if (v >= 10 && v <= 1000) { opt.scale = v / 100; saveOptions(); }
    scaleInput.value = String(Math.round(opt.scale * 100));
    updateUI();
  });
  ptInput.value = String(opt.labelPt ?? packLabelPt(pack));
  ptInput.addEventListener("change", () => {
    const v = +ptInput.value;
    opt.labelPt = v >= 4 && v <= 48 && v !== packLabelPt(pack) ? v : null;
    saveOptions();
    ptInput.value = String(opt.labelPt ?? packLabelPt(pack));
    render();
  });
  tagsInput.checked = !!opt.levelTags;
  tagsInput.addEventListener("change", () => { opt.levelTags = tagsInput.checked; saveOptions(); render(); queueTypeset(); });
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files[0];
    fileInput.value = "";
    if (!f) return;
    try { load(await f.text()); } catch (e) { status(`Could not open ${f.name}: ${e.message}`); }
  });
  themeInput.addEventListener("change", async () => {
    const f = themeInput.files[0];
    themeInput.value = "";
    if (!f) return;
    try { applyTheme(await f.text(), true); render(); status(`Loaded the private theme ${f.name}. It stays in this browser only.`); } catch (e) { status(`Could not use ${f.name} as a theme: ${e.message}`); }
  });
  idInput.addEventListener("change", () => {
    const v = idInput.value.trim();
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(v)) commit({ ...D.clone(doc), id: v }, `Figure id is now ${v}.`);
    else { status("A figure id starts with a letter and uses only letters, digits and _."); idInput.value = doc.id; }
  });
  titleInput.addEventListener("change", () => {
    const next = D.clone(doc);
    if (titleInput.value) next.title = titleInput.value; else delete next.title;
    commit(next, "Title changed.");
  });

  const LIST = { element: "elements", wire: "wires", port: "ports", label: "labels" };
  const keyOf = (h) => (h.kind === "label" ? h.index : h.kind === "wire" || h.kind === "port" || h.kind === "element" ? h.id : null);

  svg.addEventListener("pointerdown", (e) => {
    svg.focus({ preventScroll: true });
    const p = view.toGrid(e);
    pointer = p;
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      drag = { kind: "pan", x: e.clientX, y: e.clientY };
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    if (tool === "place" && placing) {
      const r = D.addElement(doc, pack, placing.type, snapModule(p), placing.rotation);
      commit(r.doc, `Placed ${r.id}.`);
      selection = { ...none(), elements: [r.id] };
      if (!e.shiftKey) setTool("select"); else render();
      return;
    }
    if (tool === "wire") { wireClick(p); return; }
    if (tool === "port") { portClick(p); return; }
    if (tool === "label") { labelClick(p); return; }
    const hits = targets(p);
    let target = hits.find((h) => ["port", "wire", "label", "element"].includes(h.kind));
    if (!target) { const pin = hits.find((h) => h.kind === "pin"); if (pin) target = { kind: "element", id: pin.ref.split(".")[0] }; }
    if (target) {
      const list = LIST[target.kind], k = keyOf(target);
      const isSel = selection[list].includes(k);
      if (e.shiftKey) {
        selection = { ...selection, [list]: isSel ? selection[list].filter((x) => x !== k) : [...selection[list], k] };
      } else if (!isSel) {
        selection = { ...none(), [list]: [k] };
      }
      drag = { kind: "move", start: p, base: doc, sel: structuredClone(selection), delta: [0, 0] };
    } else {
      if (!e.shiftKey) selection = none();
      drag = { kind: "box", start: p, add: e.shiftKey ? structuredClone(selection) : null };
    }
    svg.setPointerCapture(e.pointerId);
    render();
  });

  svg.addEventListener("pointermove", (e) => {
    const p = view.toGrid(e);
    pointer = p;
    if (drag?.kind === "pan") { view.panBy(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; return; }
    if (drag?.kind === "move") {
      const raw = [p[0] - drag.start[0], p[1] - drag.start[1]];
      const delta = drag.sel.elements.length ? snapModule(raw) : snapStep(raw);
      if (!same(delta, drag.delta)) {
        drag.delta = delta;
        doc = same(delta, [0, 0]) ? drag.base : D.moveSelection(drag.base, pack, drag.sel, delta);
        render();
      }
      return;
    }
    if (drag?.kind === "box") {
      boxSel = { min: [Math.min(drag.start[0], p[0]), Math.min(drag.start[1], p[1])], max: [Math.max(drag.start[0], p[0]), Math.max(drag.start[1], p[1])] };
      render();
      return;
    }
    if (tool === "place" && placing) { ghost = { type: placing.type, at: snapModule(p), rotation: placing.rotation }; render(); return; }
    if (tool === "wire") {
      if (wiring) updateRubber(p);
      else { const t = wireTarget(p); const h = t.kind !== "point" ? t.at : null; if (!same(h, hover)) { hover = h; render(); } }
    }
  });

  const endDrag = () => {
    if (drag?.kind === "move" && !same(drag.delta, [0, 0])) {
      history.record(drag.base);   // the whole drag is one undo step
      changed("Moved.");
    } else if (drag?.kind === "box" && boxSel) {
      const got = inBox(doc, pack, boxSel);
      const union = (a, b) => [...new Set([...a, ...b])];
      selection = drag.add
        ? { elements: union(drag.add.elements, got.elements), wires: union(drag.add.wires, got.wires), ports: union(drag.add.ports, got.ports), labels: union(drag.add.labels, got.labels) }
        : got;
      boxSel = null;
      render();
    }
    drag = null;
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("dblclick", (e) => e.preventDefault());
  svg.addEventListener("wheel", (e) => { e.preventDefault(); view.zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, e); }, { passive: false });
  svg.addEventListener("contextmenu", (e) => { if (wiring) { e.preventDefault(); wiring = null; rubber = null; render(); } });
  new ResizeObserver(() => view.applyCamera()).observe(svg);

  root.addEventListener("keyup", (e) => { if (e.key === " ") spaceHeld = false; });
  root.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select")) return;
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    const run = (name) => { e.preventDefault(); commands[name](); };
    if (helpEl.open) return;
    if (ctrl && k === "z" && !e.shiftKey) return run("undo");
    if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) return run("redo");
    if (ctrl && k === "c") return run("copy");
    if (ctrl && k === "v") return run("paste");
    if (ctrl && k === "a") return run("selectAll");
    if (ctrl && k === "s") return run("save");
    if (ctrl || e.altKey) return;
    if (e.target.closest("button") && (e.key === "Enter" || e.key === " ")) return;   // let buttons work
    if (e.key === "?") return run("help");
    if (e.key === " ") { spaceHeld = true; e.preventDefault(); return; }
    if (e.key === "Escape") {
      e.preventDefault();
      if (wiring) { wiring = null; rubber = null; status("Wire cancelled."); render(); }
      else if (tool !== "select") commands.select();
      else { selection = none(); render(); }
      return;
    }
    if (e.key === "Enter" && wiring) {
      e.preventDefault();
      finishWire({ kind: "point", at: wiring.via.at(-1) ?? wiring.fromAt });
      return;
    }
    if (e.key === "Backspace" && wiring) { e.preventDefault(); wiring.via.pop(); if (pointer) updateRubber(pointer); return; }
    if (k === "w") return run("wire");
    if (k === "p") return run("port");
    if (k === "t") return run("label");
    if (k === "r") return run("rotate");
    if (k === "m") return run("mirror");
    if (k === "f") return run("fit");
    if (selection.wires.length && ["0", "1", "x", "z"].includes(k)) { e.preventDefault(); return setLevel(k.toUpperCase()); }
    if (e.key === "Delete" || e.key === "Backspace") return run("delete");
    if (e.key === "+" || e.key === "=") return run("zoomin");
    if (e.key === "-") return run("zoomout");
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (arrows[e.key]) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      if (total(selection)) {
        const step = selection.elements.length ? 2 : 1;          // a module for parts; a grid step for wires and labels alone
        commit(D.moveSelection(doc, pack, selection, [dx * step, dy * step]), "Moved.");
      } else view.panBy(-dx * 40, dy * 40);
    }
  });

  // ---- start ----------------------------------------------------------------------------------
  renderPalette();
  render();
  view.fit(null);
  let opened = false;
  if (options.open) {
    try {
      const url = new URL(options.open, document.baseURI);
      if (url.origin !== location.origin) throw new Error("only files from this site can be opened by link");
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      load(await r.text(), false);
      opened = true;
      status(`Opened ${doc.id} from ${url.pathname.split("/").pop()}.`);
    } catch (e) { status(`Could not open ${options.open}: ${e.message}`); }
  }
  const saved = !opened && store.get(AUTOSAVE);
  if (saved) {
    try { load(saved, false); status("Restored the autosaved figure."); } catch { /* an unreadable autosave is ignored */ }
  }
  if (!opened && !saved) status("Pick an element on the left to place it, or press W to draw a wire. Press ? for the keys.");

  return {
    get doc() { return doc; },
    load: (text) => load(text),
    /** Typeset what the figure needs, then the SVG as exported (options as set on the page). */
    exportSvg: svgNow,
    png: pngNow,
    save: () => D.serialize(doc, pack),
    typesetting: () => queueTypeset(),
  };
}
