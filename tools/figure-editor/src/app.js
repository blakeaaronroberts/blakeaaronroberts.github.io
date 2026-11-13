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
import { drawing, exportSize, exportSvg, labelBoxes } from "./export.js";
import { hitTest, inBox } from "./hit.js";
import { packLabelPt, texNeeded } from "./labels.js";
import { typesetAll } from "./mathjax.js";
import { nearestOnPolyline, route } from "./router.js";
import { createView, thumbnail, blockThumbnail } from "./view.js";
import { BLOCK, formatPins, handlesOf, parsePins, SHAPES, geometryOf } from "./block.js";
import { PRESETS, presetById } from "./presets.js";
import { circuitFromSvg, sanitizeSvg, MAX_SVG_BYTES } from "./svgimport.js";
import { FORMATS, LAYOUTS, centreOn, cleanFrame, frameBox, overflow } from "./frame.js";
import { orient } from "./geometry.js";

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
  ["0  1  X  Z", "Set the logic level the selected wires and elements are drawn at (low, high, unknown, floating)"],
  ["Selected wire", "The panel sets arrowheads (at either end or both) and a bus mark: a slash across the wire, with a label"],
  ["Ctrl+Z, Ctrl+Y", "Undo, redo (Ctrl+Shift+Z also redoes)"],
  ["Ctrl+C, Ctrl+V, Ctrl+A", "Copy, paste, select all"],
  ["Ctrl+S", "Save the figure as a .json file"],
  ["Arrow keys", "Move the selection (a grid step for parts, as the Grid control sets it; half a module for wires and labels); pan when nothing is selected"],
  ["Click a wire", "Select it (it is highlighted); Delete or Backspace removes it, Ctrl+Z brings it back"],
  ["Drag a wire", "Slide the run under the pointer sideways: the next runs stretch, the ends stay on their pins, one step at a time. One drag is one undo step"],
  ["Shift+click", "Add to or remove from the selection; while placing, keep placing"],
  ["Drag on empty canvas", "Box select"],
  ["Mouse wheel, + and −", "Zoom"],
  ["Space+drag, middle button+drag", "Pan"],
  ["F", "Fit the figure in the window"],
  ["Esc", "Cancel what you are doing, go back to Select, or clear the selection"],
  ["?", "Show or hide this list"],
];

const BUTTON = "btn btn-sm fe-btn";
// Toolbar icons: 16-unit line drawings in currentColor, so the site's roles colour them.
const ICONS = {
  select: '<path d="M3 2l9 5-4 1.5L6.5 13z"/>',
  wire: '<path d="M2 12h5V5h7"/><circle cx="2" cy="12" r="1"/><circle cx="14" cy="5" r="1"/>',
  port: '<path d="M2 3h8l4 5-4 5H2z"/>',
  label: '<path d="M3 3h10M8 3v10"/>',
  rotate: '<path d="M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3"/>',
  mirror: '<path d="M8 2v12" stroke-dasharray="2 2"/><path d="M6 4L2 12h4zM10 4l4 8h-4z"/>',
  delete: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9"/>',
  undo: '<path d="M5 3L2 6l3 3"/><path d="M2 6h7a4 4 0 0 1 0 8H6"/>',
  redo: '<path d="M11 3l3 3-3 3"/><path d="M14 6H7a4 4 0 0 0 0 8h3"/>',
  copy: '<rect x="5" y="5" width="8" height="9"/><path d="M3 11V2h8"/>',
  paste: '<path d="M5 3H3v11h10V3h-2"/><rect x="5" y="2" width="6" height="3"/>',
  zoomout: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14M5 7h4"/>',
  zoomin: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14M5 7h4M7 5v4"/>',
  fit: '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>',
  new: '<path d="M4 2h5l3 3v9H4zM9 2v3h3"/>',
  open: '<path d="M2 4h4l1.5 2H14v7H2z"/>',
  save: '<path d="M8 2v8M5 7l3 3 3-3M3 13h10"/>',
  export: '<path d="M3 5v8h10V5M8 11V2M5 5l3-3 3 3"/>',
  png: '<rect x="2" y="3" width="12" height="10"/><circle cx="6" cy="7" r="1"/><path d="M2 12l4-3 3 2 2-2 3 3"/>',
};
/** A button for a command: an icon (named for assistive tech and in its tooltip) or, with no icon, its text. */
const btn = (cmd, label, keys = "", extra = "", title = label) => {
  const art = ICONS[cmd] ? `<svg class="fe-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${ICONS[cmd]}</svg>` : label;
  const name = ICONS[cmd] ? ` aria-label="${label}"` : "";
  return `<button type="button" class="${BUTTON}" data-cmd="${cmd}"${name} title="${title}${keys ? ` (${keys})` : ""}"${keys ? ` aria-keyshortcuts="${keys}"` : ""}${extra}>${art}</button>`;
};
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
      <div class="fe-group" role="group" aria-label="Tool">
        ${btn("select", "Select", "Escape", ' aria-pressed="true"')}${btn("wire", "Wire", "W", ' aria-pressed="false"')}${btn("port", "Port", "P", ' aria-pressed="false"')}${btn("label", "Label", "T", ' aria-pressed="false"')}
      </div>
      <div class="fe-group" role="group" aria-label="Edit">
        ${btn("rotate", "Rotate", "R")}${btn("mirror", "Mirror", "M")}${btn("delete", "Delete", "Delete")}
      </div>
      <div class="fe-group" role="group" aria-label="History">
        ${btn("undo", "Undo", "Control+Z")}${btn("redo", "Redo", "Control+Y")}
      </div>
      <div class="fe-group" role="group" aria-label="Clipboard">
        ${btn("copy", "Copy", "Control+C")}${btn("paste", "Paste", "Control+V")}
      </div>
      <div class="fe-group" role="group" aria-label="View">
        ${btn("zoomout", "Zoom out", "-")}${btn("zoomin", "Zoom in", "+")}${btn("fit", "Fit", "F")}
      </div>
      <div class="fe-group" role="group" aria-label="Part grid: snap step for parts">
        <span class="fe-grouplabel label-mono" aria-hidden="true">Grid</span>${btn("gridhalf", "½", "", ' aria-pressed="true"', "Snap parts to half a module")}${btn("gridfull", "1", "", ' aria-pressed="false"', "Snap parts to a whole module")}
      </div>
      <div class="fe-group" role="group" aria-label="File">
        ${btn("new", "New")}${btn("open", "Open…")}${btn("save", "Save", "Control+S")}${btn("export", "Export SVG")}${btn("png", "Copy as PNG")}
      </div>
      <div class="fe-group fe-group-end">${btn("help", "?", "?", ' aria-label="Keys"')}</div>
      <input type="file" class="fe-file" accept=".json,.svg,application/json,image/svg+xml" hidden>
      <input type="file" class="fe-theme-file" accept=".json,application/json" hidden>
    </div>
    <details class="fe-palette fe-pane" open>
      <summary class="label-mono">Elements</summary>
      <label class="fe-drafts"><input type="checkbox" name="fe-drafts"> Show drafts</label>
      <nav aria-label="Elements"><ul class="fe-parts"></ul></nav>
      <h3 class="fe-palette-head label-mono">Blocks</h3>
      <nav aria-label="Blocks"><ul class="fe-blocks"></ul></nav>
    </details>
    <div class="fe-stage">
      <svg class="fe-canvas" tabindex="0" role="application" aria-label="Figure canvas" xmlns="http://www.w3.org/2000/svg"></svg>
    </div>
    <div class="fe-side" role="region" aria-label="Figure properties">
      <details class="fe-pane" open>
        <summary class="label-mono">Selection</summary>
        <section class="fe-props" aria-label="Selection"></section>
      </details>
      <details class="fe-pane" name="fe-doc" open>
        <summary class="label-mono">Figure</summary>
        <label class="form-label">Figure id <input class="form-control form-control-sm" name="fe-id" spellcheck="false"></label>
        <label class="form-label">Title <input class="form-control form-control-sm" name="fe-title"></label>
      </details>
      <details class="fe-pane fe-export" name="fe-doc">
        <summary class="label-mono">Export</summary>
        <label class="form-label">Scale (%) <input class="form-control form-control-sm" type="number" name="fe-scale" min="10" max="1000" step="5"></label>
        <label class="form-label">Label size (pt) <input class="form-control form-control-sm" type="number" name="fe-labelpt" min="4" max="48" step="0.5"></label>
        <label class="form-check"><input class="form-check-input" type="checkbox" name="fe-tags"> <span class="form-check-label">Level tags (0, 1, X, Z) by each wire</span></label>
        <label class="form-check"><input class="form-check-input" type="checkbox" name="fe-exportdark"> <span class="form-check-label">Export in dark theme</span></label>
        <p class="fe-size" aria-live="polite"></p>
      </details>
      <details class="fe-pane fe-theme" name="fe-doc">
        <summary class="label-mono">Theme</summary>
        <label class="form-label">Canvas <select class="form-select form-select-sm" name="fe-canvas"><option value="auto">Auto (follows system)</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <p class="fe-theme-note"></p>
        <div class="fe-theme-buttons" role="group" aria-label="Theme">${btn("theme", "Private theme…")}${btn("themereset", "Default theme")}</div>
      </details>
      <details class="fe-pane fe-frame-pane" name="fe-doc">
        <summary class="label-mono">Slide frame</summary>
        <label class="form-check"><input class="form-check-input" type="checkbox" name="fe-frame-show"> <span class="form-check-label">Show a slide-size frame on the canvas</span></label>
        <label class="form-label">Slide <select class="form-select form-select-sm" name="fe-frame-format">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("")}</select></label>
        <label class="form-label">Layout <select class="form-select form-select-sm" name="fe-frame-layout">${Object.entries(LAYOUTS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("")}</select></label>
        <label class="form-label">Frame centre, right and up (grid steps) <span class="fe-pair"><input class="form-control form-control-sm" type="number" name="fe-frame-x" step="1"><input class="form-control form-control-sm" type="number" name="fe-frame-y" step="1"></span></label>
        <div class="fe-theme-buttons" role="group" aria-label="Slide frame">${btn("framecentre", "Centre on the figure")}${btn("exportframe", "Frame as SVG")}${btn("pngframe", "Frame as PNG")}</div>
        <p class="fe-hint">The frame exports at the slide's real size, exactly what lies inside it at 1:1 (times the Scale option). The Export SVG button writes the schematic alone. The timing diagram, and its own export, arrive with the scenario player. The frame is kept in this browser, not in the circuit file.</p>
        <p class="fe-frame-note" aria-live="polite"></p>
      </details>
      <details class="fe-pane fe-backdrop-pane" name="fe-doc">
        <summary class="label-mono">Backdrop</summary>
        <p class="fe-hint fe-backdrop-note">Open an SVG that this editor did not make to trace over it. It sits behind the grid, locked, and is never saved or exported.</p>
        <div class="fe-backdrop-controls" hidden>
          <label class="form-label">Opacity (%) <input class="form-control form-control-sm" type="number" name="fe-bd-opacity" min="0" max="100" step="5"></label>
          <label class="form-label">Scale (%) <input class="form-control form-control-sm" type="number" name="fe-bd-scale" min="5" max="2000" step="5"></label>
          <label class="form-label">Shift right, up (grid steps) <span class="fe-pair"><input class="form-control form-control-sm" type="number" name="fe-bd-x" step="1"><input class="form-control form-control-sm" type="number" name="fe-bd-y" step="1"></span></label>
          <div class="fe-theme-buttons">${btn("backdropremove", "Remove backdrop")}</div>
        </div>
      </details>
      <details class="fe-pane fe-warnings" open>
        <summary class="label-mono">Warnings</summary>
        <ul></ul>
      </details>
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
  const scaleInput = $('[name="fe-scale"]'), ptInput = $('[name="fe-labelpt"]'), tagsInput = $('[name="fe-tags"]'), draftsInput = $('[name="fe-drafts"]'), canvasInput = $('[name="fe-canvas"]'), exportDarkInput = $('[name="fe-exportdark"]');
  const view = createView(svg, loaded);
  // The editor fills the window below the site header; measure the header so the two never overlap.
  const header = document.querySelector("#quarto-header");
  const fit = () => root.style.setProperty("--fe-top", `${header ? Math.round(header.getBoundingClientRect().bottom) : 0}px`);
  fit(); window.addEventListener("resize", fit);

  // ---- state ---------------------------------------------------------------------------
  let doc = D.newDoc();
  const history = new History();
  let selection = none();
  let tool = "select";               // select | wire | port | label | place
  let placing = null;                // {type, rotation, params?}: params for a block
  let wiring = null;                 // {from: target, fromAt, via: [...]}
  let pendingLabel = null;           // {at, side}: a label waiting for its text
  let drag = null;
  let pointer = null;                // last pointer position, grid steps
  let hover = null, ghost = null, rubber = null, boxSel = null;
  let hoverWire = null;              // the wire under the pointer in Select, for a hover highlight and the resize cursor
  let clipboard = null, pasteCount = 0;
  let loadWarnings = [];
  let spaceHeld = false;
  let lastDrawing = null;
  let autosaveTimer = null;
  const typeset = new Map();         // TeX to parseTypeset's result (every label drawn is typeset once)

  const opt = { frame: null, scale: 1, labelPt: null, levelTags: false, drafts: false, grid: 1, canvas: "auto", exportDark: false, ...(() => { try { return JSON.parse(store.get(OPTIONS) ?? "{}"); } catch { return {}; } })() };
  if (opt.grid !== 2) opt.grid = 1;   // snap for parts, in grid steps: 1 is half a module (default), 2 is a whole module
  if (!["auto", "light", "dark"].includes(opt.canvas)) opt.canvas = "auto";
  opt.exportDark = opt.exportDark === true;
  opt.frame = cleanFrame(opt.frame);
  /** Snap a point (grid steps) to the part grid. Wires, ports and labels always snap to one step (half a module). */
  function snapPart(p) { const g = opt.grid; return [g * Math.round(p[0] / g) || 0, g * Math.round(p[1] / g) || 0]; }
  const saveOptions = () => store.set(OPTIONS, JSON.stringify(opt));
  const drawOpts = () => ({ typeset, labelPt: opt.labelPt ?? undefined, levelTags: opt.levelTags, scale: opt.scale });

  /** The status line. An error is bold and announced at once, and stays until the next message. */
  const status = (msg, error = false) => {
    statusEl.textContent = msg;
    statusEl.toggleAttribute("data-error", error);
    statusEl.setAttribute("role", error ? "alert" : "status");
  };

  // ---- the private theme (kept in this browser only) ----------------------------------------
  let privateRoles = null;                             // a loaded private theme's roles, or null

  /**
   * The dark roles: every role the pack's theme has, read from the site's --fig-dark-<role> properties by
   * name (the editor holds no colour of its own). A role the page does not publish keeps the pack's colour.
   */
  function darkRoles() {
    const style = getComputedStyle(root), ctx = document.createElement("canvas").getContext("2d"), out = {};
    for (const name of Object.keys(loaded.baseTheme.roles)) {
      const raw = style.getPropertyValue(`--fig-dark-${name}`).trim();
      if (!raw) continue;
      if (!CSS.supports("color", raw)) continue;
      ctx.fillStyle = raw;                                  // the canvas parses any CSS colour and reads it back as #rrggbb
      if (/^#[0-9a-f]{6}$/i.test(ctx.fillStyle)) out[name] = ctx.fillStyle.toUpperCase();
    }
    return out;
  }
  /** The pack drawn for the light or dark canvas. A private theme, if loaded, overrides the dark roles. */
  function packFor(dark) {
    const roles = { ...(dark ? darkRoles() : {}), ...(privateRoles ?? {}) };
    return Object.keys(roles).length ? loaded.withTheme(roles) : loaded;
  }
  /** Is the site showing its dark look? Read from the site's own role (the toggle swaps stylesheets), not the OS setting, which the toggle can override. */
  function siteIsDark() {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.fillStyle = getComputedStyle(root).getPropertyValue("--role-background").trim();
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ctx.fillStyle.slice(i, i + 2), 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
  }
  const canvasIsDark = () => opt.canvas === "dark" || (opt.canvas === "auto" && siteIsDark());
  /** Rebuild the drawing pack for the canvas theme in force, and tell the CSS which plate to show. */
  function applyCanvas() {
    const dark = canvasIsDark();
    pack = packFor(dark);
    root.dataset.canvas = dark ? "dark" : "light";
    view.setSymbols(pack);
  }
  function applyTheme(text, announce) {
    privateRoles = parsePrivateTheme(text);
    applyCanvas();
    if (announce) store.set(THEME, text);
  }
  const savedTheme = store.get(THEME);
  if (savedTheme) { try { applyTheme(savedTheme, false); } catch { privateRoles = null; store.remove(THEME); } }
  applyCanvas();
  // The site's toggle and the OS setting both swap its stylesheets; follow them when the canvas is on Auto.
  let swapTimer = null;
  new MutationObserver(() => { clearTimeout(swapTimer); swapTimer = setTimeout(() => { if (opt.canvas === "auto") { applyCanvas(); render(); renderPalette(); } }, 60); })
    .observe(document.head, { subtree: true, attributes: true, attributeFilter: ["rel", "disabled", "href", "media"] });

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
      doc, pack, selection, ghost, rubber, hover, hoverWire, box: boxSel, frame: opt.frame,
      typeset, labelPt: opt.labelPt ?? undefined, levelTags: opt.levelTags,
    });
    if (lastDrawing.pending.length) queueTypeset();
    updateUI();
  }

  function renderPalette() {
    $(".fe-palette .fe-parts").innerHTML = pack.types(opt.drafts).map((t) =>
      `<li><button type="button" class="fe-part" data-type="${esc(t)}" title="${esc(pack.def(t).description)}">${thumbnail(pack, t)}<span>${esc(t)}</span></button></li>`).join("");
    $(".fe-palette .fe-blocks").innerHTML = PRESETS.map((p) =>
      `<li><button type="button" class="fe-part" data-preset="${esc(p.id)}" title="${esc(p.name)}: a block with these pins; size, shape, pins and labels can all be changed">${blockThumbnail(pack, p.params)}<span>${esc(p.name)}</span></button></li>`).join("");
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
    root.querySelector(`[data-cmd="gridhalf"]`).setAttribute("aria-pressed", String(opt.grid === 1));
    root.querySelector(`[data-cmd="gridfull"]`).setAttribute("aria-pressed", String(opt.grid === 2));
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
      syncFrame();
      $(".fe-size").textContent = lastDrawing.box ? `File size: ${widthCm.toFixed(2)} × ${heightCm.toFixed(2)} cm${opt.scale === 1 ? " (real size)" : ""}` : "Nothing to export yet.";
    }
    $(".fe-theme-note").textContent = privateRoles
      ? "Private theme loaded. It is kept in this browser only and is never saved in a figure or sent anywhere."
      : `Default theme (${loaded.theme.theme}) from the symbol pack${root.dataset.canvas === "dark" ? ", with the dark canvas mapping" : ""}.`;
  }

  // ---- the properties panel ---------------------------------------------------------------
  const field = (label, name, extra = "") => `<label class="form-label">${label} <input class="form-control form-control-sm" data-field="${name}" spellcheck="false" ${extra}></label>`;
  const choice = (label, name, opts) => `<label class="form-label">${label} <select class="form-select form-select-sm" data-field="${name}">${opts.map(([v, t, off]) => `<option value="${v}"${off ? " disabled" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  const SIDE_OPTS = [["", "centred on the point"], ["left", "left of the point"], ["right", "right of the point"], ["up", "above the point"], ["down", "below the point"]];
  const levelOpts = () => [["", "none (default colour)"], ...LEVELS.map((l) => [l.value, `${l.value}: ${l.name}`, !pack.levelColour(l.value)])];

  const BLOCK_PIN_FIELDS = { blkLeft: "left", blkRight: "right", blkTop: "top", blkBottom: "bottom" };
  const blockFields = () => `<p class="fe-hint">Size is in whole modules; a side needs one more module than it has pins.</p>` +
    choice("Shape", "blkShape", SHAPES.map((s) => [s, s])) +
    `<label class="form-label">Width (modules) <input class="form-control form-control-sm" type="number" min="1" step="1" data-field="blkW"></label>` +
    `<label class="form-label">Height (modules) <input class="form-control form-control-sm" type="number" min="1" step="1" data-field="blkH"></label>` +
    field("Text in the block (TeX or words)", "blkLabel") +
    `<p class="fe-hint">Pins, top to bottom or left to right: names with an optional label, such as A, B: $B_1$, Cin: $C_{in}$.</p>` +
    field("Pins on the left", "blkLeft") + field("Pins on the right", "blkRight") + field("Pins on the top", "blkTop") + field("Pins on the bottom", "blkBottom");

  function propsModel() {
    const only = (list) => list.length === 1 && total(selection) === 1;
    const text = {}, values = {};
    let html = "", key;
    if (pendingLabel) {
      key = "pending";
      html = `<p>New label at [${pendingLabel.at.join(", ")}]</p>${field("Label text (TeX, such as $A_0$)", "pendingText")}<p class="fe-hint">Press Enter to add it, Esc to cancel.</p>`;
    } else if (only(selection.elements)) {
      const el = doc.elements.find((e) => e.id === selection.elements[0]);
      const def = el && pack.defFor(el);
      key = `el:${el?.id}`;
      html = `<dl><dt>Element</dt><dd data-text="elDesc"></dd><dt>Position</dt><dd data-text="elPos"></dd><dt>Rotation</dt><dd data-text="elRot"></dd><dt>Mirror</dt><dd data-text="elMirror"></dd></dl>` +
        field("Label (TeX, such as $R_1$)", "elLabel");
      if (el) {
        text.elDesc = `${el.id}: ${el.type}. ${def?.description ?? ""}`; text.elPos = `[${el.at.join(", ")}] grid steps`; text.elRot = `${el.rotation ?? 0}°`;
        text.elMirror = pack.mirrorable(el.type) ? (el.mirror ? "on" : "off") : "not available: the symbol pack does not mark this element mirrorable";
        values.elLabel = el.label ?? "";
        const g = el.type === BLOCK ? geometryOf(el.params) : null;
        if (g) {
          html += blockFields();
          Object.assign(values, { blkShape: g.params.shape, blkW: String(g.params.w), blkH: String(g.params.h), blkLabel: g.params.label });
          for (const [f, side] of Object.entries(BLOCK_PIN_FIELDS)) values[f] = formatPins(g.params.pins[side]);
        }
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
    if (!pendingLabel && (selection.wires.length || selection.elements.length)) {   // the level applies to every selected wire and element
      const wires = selection.wires.map((id) => doc.wires.find((w) => w.id === id)).filter(Boolean);
      const els = selection.elements.map((id) => doc.elements.find((e) => e.id === id)).filter(Boolean);
      const levels = new Set([...wires, ...els].map((x) => x.level ?? ""));
      const one = levels.size === 1 ? [...levels][0] : null;
      const what = els.length && wires.length ? "wires and elements" : els.length ? "elements" : "wires";
      html += `<p class="fe-level" data-text="levelText"></p>${choice(`Level (colours the body of an element, the line of a wire)`, "level", levelOpts())}`;
      key += "|level";
      if (wires.length) {
        const arrows = new Set(wires.map((w) => w.arrow ?? "none")), buses = new Set(wires.map((w) => w.bus ?? ""));
        const arrow = arrows.size === 1 ? [...arrows][0] : null;
        key += arrow === null ? "|mixed" : "";
        html += choice("Arrowheads", "wireArrow", [...(arrow === null ? [["", "mixed (pick one)", true]] : []), ["none", "none"], ["end", "at the end"], ["start", "at the start"], ["both", "at both ends"]]) +
          field("Bus mark: a slash with this label (such as N or 4)", "wireBus") +
          `<p class="fe-hint">A wire starts where it was begun and ends where it was finished. An arrowhead's tip lands exactly on the pin, wire or point it points at.</p>`;
        values.wireArrow = arrow ?? "";
        values.wireBus = buses.size === 1 ? [...buses][0] : "";
      }
      const name = LEVELS.find((l) => l.value === one);
      text.levelText = one === null ? "Level: mixed" : one === "" ? "Level: none (default colour)" : `Level: ${one} (${name.name}) on the selected ${what}`;
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
      } else if (name.startsWith("blk")) {
        const id = selection.elements[0], el = doc.elements.find((x) => x.id === id);
        const patch = {};
        if (name === "blkShape") patch.shape = v;
        else if (name === "blkW") patch.w = Number(v);
        else if (name === "blkH") patch.h = Number(v);
        else if (name === "blkLabel") patch.label = v.trim();
        else patch.pins = { ...geometryOf(el.params).params.pins, [BLOCK_PIN_FIELDS[name]]: parsePins(v) };
        const next = D.setBlockParams(doc, pack, id, patch);
        const got = next.elements.find((x) => x.id === id).params;
        commit(next, "Block changed.");
        const was = geometryOf(el.params).params;
        if ((patch.w && got.w > patch.w) || (patch.h && got.h > patch.h) || (patch.pins && (got.w > was.w || got.h > was.h))) status(`Block changed. The size was raised to ${got.w} by ${got.h} modules: the pins need the room.`);
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
      } else if (name === "wireArrow") {
        if (v) commit(D.setWireStyle(doc, selection.wires, { arrow: v }), v === "none" ? "Arrowheads removed." : "Arrowheads set.");
      } else if (name === "wireBus") {
        commit(D.setWireStyle(doc, selection.wires, { bus: v }), v.trim() ? "Bus mark set." : "Bus mark removed.");
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
  let unsaved = false;   // edits not yet written to a .json file; autosave stays in this browser only
  let autosavePending = false, autosaveWarned = false;
  /** Write the autosave now if an edit is waiting. Storage may be missing, blocked or full: say so once, and carry on. */
  function flushAutosave() {
    clearTimeout(autosaveTimer);
    if (!autosavePending) return;
    autosavePending = false;
    let ok = false;
    try { ok = store.set(AUTOSAVE, D.serialize(doc, pack)); } catch { ok = false; }
    if (!ok && !autosaveWarned) { autosaveWarned = true; status("Autosave is off: this browser will not store the figure. Use Save to keep it.", true); }
  }
  function changed(msg) {
    unsaved = true;
    render();
    if (msg) status(msg);
    autosavePending = true;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(flushAutosave, 800);
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
    if (!selection.wires.length && !selection.elements.length) { status("Select one or more wires or elements first."); return; }
    if (level && !pack.levelColour(level)) { status(`This theme has no colour for level ${level}.`); return; }
    const name = LEVELS.find((l) => l.value === level)?.name;
    const n = selection.wires.length + selection.elements.length;
    commit(D.setLevel(doc, selection.wires, level, selection.elements), level ? `Level ${level} (${name}) set on ${count(n, n === selection.wires.length ? "wire" : "item")}.` : "Level cleared.");
  }

  function setGrid(g) {
    opt.grid = g; saveOptions(); view.setGrid(g);
    ghost = null; updateUI();
    status(g === 1 ? "Parts snap to half a module." : "Parts snap to a whole module.");
  }

  function startPlacing(type, viaKeyboard, params = null) {
    if (viaKeyboard) {
      // No pointer: place at the middle of the view and select it, so arrow keys can move it.
      const c = view.cam, at = snapPart([c.cx * 2, -c.cy * 2]);
      const r = D.addElement(doc, pack, type, at, 0, params);
      commit(r.doc, `Placed ${r.id}. Arrow keys move it; R rotates.`);
      selection = { ...none(), elements: [r.id] };
      setTool("select");
      svg.focus();
      return;
    }
    setTool("place");
    placing = { type, rotation: 0, params };
    if (pointer) ghost = { type, at: snapPart(pointer), rotation: 0, params };
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
    gridhalf: () => setGrid(1),
    gridfull: () => setGrid(2),
    zoomin: () => view.zoomAt(1 / 1.25),
    zoomout: () => view.zoomAt(1.25),
    fit: () => view.fit(lastDrawing?.box ?? null),
    new() { commit(D.newDoc(), "New figure (Undo brings the old one back)."); selection = none(); loadWarnings = []; view.fit(null); render(); },
    open: () => fileInput.click(),
    save() {
      const text = D.serialize(doc, pack);
      download(text, `${doc.id}.json`, "application/json");
      unsaved = false;   // the file has been handed to the browser; the saved-list copy below is only a backup
      let saves = [];
      try { saves = JSON.parse(store.get(SAVES) ?? "[]"); } catch { saves = []; }
      saves.unshift({ id: doc.id, saved: new Date().toISOString(), text });
      store.set(SAVES, JSON.stringify(saves.slice(0, 10)));
      status(`Saved ${doc.id}.json.`);
    },
    async export() {
      try { download(await svgNow(), `${doc.id}.svg`, "image/svg+xml"); status(`Exported ${doc.id}.svg.`); } catch (e) { status(e.message); }
    },
    async exportframe() {
      try { download(await svgNow(true), `${doc.id}-slide.svg`, "image/svg+xml"); status(`Exported ${doc.id}-slide.svg: the slide frame at real size.`); } catch (e) { status(e.message); }
    },
    async pngframe() {
      try {
        const blob = await pngNow(true);
        download(blob, `${doc.id}-slide.png`, "image/png");
        status(`Exported ${doc.id}-slide.png: the slide frame at 300 dpi.`);
      } catch (e) { status(e.message); }
    },
    framecentre() {
      if (!lastDrawing?.box) { status("Nothing to centre on yet."); return; }
      opt.frame = centreOn(opt.frame, lastDrawing.box);
      saveOptions(); syncFrame(); render();
      status("The frame is centred on the figure.");
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
      privateRoles = null; applyCanvas();
      render();
      status("Back to the pack's default theme.");
    },
  };

  /** The SVG as the export option settings say; labels are typeset first. Throws if one cannot be drawn. */
  async function svgNow(framed = false) {
    await typesetAll(texNeeded(doc, pack, { levelTags: opt.levelTags }), typeset);
    return exportSvg(doc, packFor(opt.exportDark), { ...drawOpts(), frame: framed ? frameBox(opt.frame) : null });   // light by default; dark only if asked
  }

  const DPI = 300, MAX_PIXELS = 16000;

  /** The figure as a PNG at 300 dpi at its exported size (scale option included), on a transparent background. */
  async function pngNow(framed = false) {
    const text = await svgNow(framed);
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
    try { drawing(next, pack, { typeset }); D.lint(next, pack); } catch (e) { throw new Error(`the figure could not be drawn (${e.message})`); }   // a dry run: nothing changes if it fails
    loadWarnings = D.netsMatch(nets, D.deriveNets(next, pack)) ? [] :
      ["The file's nets did not match its drawing. Saving writes the nets the drawing makes."];
    if (record) commit(next, `Opened ${next.id}.`);
    else { doc = next; history.clear(); }
    unsaved = false;   // what was just opened matches a file
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
    if (b) { startPlacing(b.dataset.type, e.detail === 0); return; }
    const pre = e.target.closest("[data-preset]");
    const preset = pre && presetById(pre.dataset.preset);
    if (preset) startPlacing(BLOCK, e.detail === 0, structuredClone(preset.params));
  });
  draftsInput.checked = !!opt.drafts;
  draftsInput.addEventListener("change", () => { opt.drafts = draftsInput.checked; saveOptions(); renderPalette(); status(opt.drafts ? "Showing draft elements too." : "Showing approved elements only."); });
  // ---- the slide frame (F10) -------------------------------------------------------------------------
  const frameEls = { show: $('[name="fe-frame-show"]'), format: $('[name="fe-frame-format"]'), layout: $('[name="fe-frame-layout"]'), x: $('[name="fe-frame-x"]'), y: $('[name="fe-frame-y"]') };
  function syncFrame() {
    frameEls.show.checked = opt.frame.show; frameEls.format.value = opt.frame.format; frameEls.layout.value = opt.frame.layout;
    if (document.activeElement !== frameEls.x) frameEls.x.value = String(opt.frame.x);
    if (document.activeElement !== frameEls.y) frameEls.y.value = String(opt.frame.y);
    const out = lastDrawing?.box ? overflow(opt.frame, lastDrawing.box) : [];
    $(".fe-frame-note").textContent = opt.frame.show && out.length ? `The figure sticks out of the schematic's part of the frame on the ${out.join(", ")}: it is cut off in the frame export.` : "";
  }
  for (const [k, el] of Object.entries(frameEls)) {
    el.addEventListener("change", () => {
      opt.frame = cleanFrame({ ...opt.frame, [k]: k === "show" ? el.checked : el.value });
      saveOptions(); syncFrame(); render();
    });
  }
  syncFrame();
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
  canvasInput.value = opt.canvas;
  canvasInput.addEventListener("change", () => { opt.canvas = canvasInput.value; saveOptions(); applyCanvas(); render(); status(`Canvas: ${canvasInput.selectedOptions[0].text}.`); });
  exportDarkInput.checked = opt.exportDark;
  exportDarkInput.addEventListener("change", () => { opt.exportDark = exportDarkInput.checked; saveOptions(); status(opt.exportDark ? "SVG and PNG exports will use the dark theme." : "SVG and PNG exports will use the default light theme."); });
  tagsInput.checked = !!opt.levelTags;
  tagsInput.addEventListener("change", () => { opt.levelTags = tagsInput.checked; saveOptions(); render(); queueTypeset(); });
  // ---- a backdrop to trace over (F12.2): never part of the figure, never saved or exported ----------------------
  let backdrop = null;                     // {href, width, height (modules at 100%), cx, cy (modules), scale, opacity}
  const bdOpacity = $('[name="fe-bd-opacity"]'), bdScale = $('[name="fe-bd-scale"]'), bdX = $('[name="fe-bd-x"]'), bdY = $('[name="fe-bd-y"]');
  function applyBackdrop() {
    if (!backdrop) { view.setBackdrop(null); $(".fe-backdrop-controls").hidden = true; return; }
    const w = backdrop.width * backdrop.scale, h = backdrop.height * backdrop.scale;
    view.setBackdrop({ href: backdrop.href, x: backdrop.cx - w / 2, y: backdrop.cy - h / 2, width: w, height: h, opacity: backdrop.opacity });
    $(".fe-backdrop-controls").hidden = false;
    bdOpacity.value = String(Math.round(backdrop.opacity * 100)); bdScale.value = String(Math.round(backdrop.scale * 100));
    bdX.value = String(Math.round(backdrop.cx * 2)); bdY.value = String(Math.round(-backdrop.cy * 2));
  }
  function importBackdrop(text, name) {
    const r = sanitizeSvg(text);
    backdrop = { href: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.svg)}`, width: r.width, height: r.height, cx: view.cam.cx, cy: view.cam.cy, scale: 1, opacity: 0.5 };
    applyBackdrop();
    $(".fe-backdrop-pane").open = true;
    status(`${name} is not one of this editor's exports, so it is a locked backdrop to trace over (scripts and external references removed). Opacity, scale and position are in the Backdrop panel; it is never saved or exported.`);
  }
  commands.backdropremove = () => { backdrop = null; applyBackdrop(); status("Backdrop removed."); };
  bdOpacity.addEventListener("change", () => { if (backdrop && bdOpacity.value !== "") backdrop.opacity = Math.min(1, Math.max(0, +bdOpacity.value / 100)); applyBackdrop(); });
  bdScale.addEventListener("change", () => { if (backdrop && +bdScale.value >= 5) backdrop.scale = Math.min(20, +bdScale.value / 100); applyBackdrop(); });
  for (const input of [bdX, bdY]) input.addEventListener("change", () => { if (backdrop) { backdrop.cx = (+bdX.value || 0) / 2; backdrop.cy = -(+bdY.value || 0) / 2; } applyBackdrop(); });

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files[0];
    fileInput.value = "";
    if (!f) return;
    const isSvg = /\.svg$/i.test(f.name) || f.type === "image/svg+xml";
    const limit = isSvg ? MAX_SVG_BYTES : 5e6;
    if (f.size > limit) { status(`Could not open ${f.name}: it is ${(f.size / 1e6).toFixed(1)} MB, over the ${limit / 1e6} MB limit. The figure on the canvas is unchanged.`, true); return; }
    try {
      const text = await f.text();
      if (isSvg || /^\s*<(\?xml|svg)/.test(text)) {
        const circuit = circuitFromSvg(text);
        if (circuit) { load(circuit); status(`Opened ${doc.id} from the circuit inside ${f.name}.`); }
        else importBackdrop(text, f.name);
      } else load(text);
    } catch (e) { status(`Could not open ${f.name}: ${e.message}. The figure on the canvas is unchanged.`, true); }
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

  /** The resize handle of the one selected block under the pointer, if any: {id, el}. */
  function blockHandleAt(p) {
    if (total(selection) !== 1 || selection.elements.length !== 1) return null;
    const el = doc.elements.find((x) => x.id === selection.elements[0]);
    if (el?.type !== BLOCK) return null;
    let best = null;
    for (const h of handlesOf(el.params)) {
      const at = D.placeAt(el, h.at), d = Math.hypot(at[0] - p[0], at[1] - p[1]);
      if (d <= 0.9 && (!best || d < best.d)) best = { id: h.id, el, d };
    }
    return best;
  }

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
      const r = D.addElement(doc, pack, placing.type, snapPart(p), placing.rotation, placing.params);
      commit(r.doc, `Placed ${r.id}.`);
      selection = { ...none(), elements: [r.id] };
      if (!e.shiftKey) setTool("select"); else render();
      return;
    }
    if (tool === "wire") { wireClick(p); return; }
    if (tool === "port") { portClick(p); return; }
    if (tool === "label") { labelClick(p); return; }
    const handle = blockHandleAt(p);
    if (handle) {
      drag = { kind: "resize", id: handle.el.id, handle: handle.id, start: p, base: doc, el: handle.el };
      svg.setPointerCapture(e.pointerId);
      status("Drag to resize the block in whole modules. One drag is one undo step.");
      return;
    }
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
      const c = target.kind === "wire" && !e.shiftKey && total(selection) === 1 ? D.allCorners(doc, pack).get(k) : null;
      if (c) {   // a lone wire: dragging slides the run under the pointer sideways
        const index = nearestOnPolyline(p, c).segment;
        drag = { kind: "segment", id: k, index, horizontal: c[index][1] === c[index + 1][1], start: p, base: doc, d: 0 };
        status(`Wire ${k} selected. Drag it sideways to move this run; Delete removes the wire.`);
      } else drag = { kind: "move", start: p, base: doc, sel: structuredClone(selection), delta: [0, 0] };
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
    if (drag?.kind === "segment") {
      const d = Math.round(drag.horizontal ? p[1] - drag.start[1] : p[0] - drag.start[0]);   // whole grid steps (half a module)
      if (d !== drag.d) {
        drag.d = d;
        try { doc = d === 0 ? drag.base : D.moveWireSegment(drag.base, pack, drag.id, drag.index, d); } catch (err) { doc = drag.base; status(`${err.message}.`); }
        render();
      }
      return;
    }
    if (drag?.kind === "resize") {
      // The pointer's move in the block's own frame (undo the rotation, then the mirror), in whole modules along the dragged edges.
      const el = drag.el, h = drag.handle;
      let local = orient([p[0] - drag.start[0], p[1] - drag.start[1]], (360 - (el.rotation ?? 0)) % 360, false);
      if (el.mirror) local = [-local[0], local[1]];
      const dw = Math.round((h.includes("e") ? local[0] : h.includes("w") ? -local[0] : 0) / 2);
      const dh = Math.round((h.includes("n") ? local[1] : h.includes("s") ? -local[1] : 0) / 2);
      try { doc = D.resizeBlock(drag.base, pack, drag.id, h, dw, dh); } catch (err) { doc = drag.base; status(`${err.message}.`); }
      render();
      return;
    }
    if (drag?.kind === "move") {
      const raw = [p[0] - drag.start[0], p[1] - drag.start[1]];
      const delta = drag.sel.elements.length ? snapPart(raw) : snapStep(raw);
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
    if (tool === "select" && !drag) updateHoverWire(p);
    if (tool === "place" && placing) { ghost = { type: placing.type, at: snapPart(p), rotation: placing.rotation, params: placing.params }; render(); return; }
    if (tool === "wire") {
      if (wiring) updateRubber(p);
      else { const t = wireTarget(p); const h = t.kind !== "point" ? t.at : null; if (!same(h, hover)) { hover = h; render(); } }
    }
  });

  /** Highlight the wire a click would pick, and show which way its run slides (the cursor). */
  function updateHoverWire(p) {
    const t = targets(p).find((h) => ["port", "wire", "label", "element"].includes(h.kind));
    const id = t?.kind === "wire" ? t.id : null;
    const c = id ? D.allCorners(doc, pack).get(id) : null;
    const i = c ? nearestOnPolyline(p, c).segment : 0;
    const dir = c ? (c[i][1] === c[i + 1][1] ? "wire-h" : "wire-v") : "";
    if (id === hoverWire && (svg.dataset.hit ?? "") === dir) return;
    hoverWire = id;
    if (dir) svg.dataset.hit = dir; else delete svg.dataset.hit;
    render();
  }

  const endDrag = () => {
    if (drag?.kind === "resize") {
      if (doc !== drag.base && JSON.stringify(doc) !== JSON.stringify(drag.base)) { history.record(drag.base); changed("Resized the block."); }
      else doc = drag.base;
    } else if (drag?.kind === "segment") {
      if (doc !== drag.base) { history.record(drag.base); changed("Moved a wire run."); }   // the whole drag is one undo step
    } else if (drag?.kind === "move" && !same(drag.delta, [0, 0])) {
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
  svg.addEventListener("pointerleave", () => { if (hoverWire && !drag) { hoverWire = null; delete svg.dataset.hit; render(); } });
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
    if ((selection.wires.length || selection.elements.length) && ["0", "1", "x", "z"].includes(k)) { e.preventDefault(); return setLevel(k.toUpperCase()); }
    if (e.key === "Delete" || e.key === "Backspace") return run("delete");
    if (e.key === "+" || e.key === "=") return run("zoomin");
    if (e.key === "-") return run("zoomout");
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (arrows[e.key]) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      if (total(selection)) {
        const step = selection.elements.length ? opt.grid : 1;   // parts move by the part grid; wires and labels alone by one step
        commit(D.moveSelection(doc, pack, selection, [dx * step, dy * step]), "Moved.");
      } else view.panBy(-dx * 40, dy * 40);
    }
  });

  window.addEventListener("beforeunload", (e) => { if (unsaved) { e.preventDefault(); e.returnValue = ""; } });
  window.addEventListener("pagehide", flushAutosave);                                   // an edit made in the last 0.8 s still reaches the autosave
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAutosave(); });

  // ---- start ----------------------------------------------------------------------------------
  view.setGrid(opt.grid);
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
    try { load(saved, false); status("Restored the autosaved figure."); } catch (e) { status(`The autosaved figure could not be read (${e.message}). It is left alone until your next edit replaces it.`, true); }
  }
  if (!opened && !saved) status("Pick an element on the left to place it, or press W to draw a wire. Press ? for the keys. Autosave stays in this browser; use Save to take a figure to another computer.");

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
