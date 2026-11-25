// The figure editor page: tools, pointer and keyboard handling, commands, save and load.
//
//   import { mount } from "./src/app.js";
//   mount(element, { pack: "./symbol-pack/", open: "examples/full-adder.json" });
//
// Every change to the figure goes through the pure functions in doc.js; this file
// only decides which one to call and records it for undo.

import { LEVELS, loadPack, parsePrivateTheme } from "./pack.js";
import { contrast, levelRoles, warnings as levelWarnings, withLevelColour } from "./levelcolours.js";
import * as D from "./doc.js";
import { History } from "./history.js";
import { drawing, exportDocument, exportSize, exportSvg, exportGridSvg, labelBoxes, timingGroup } from "./export.js";
import { hitTest, inBox } from "./hit.js";
import { packLabelPt, texNeeded, texOf } from "./labels.js";
import { typesetAll } from "./mathjax.js";
import { nearestOnPolyline, route, snapAngle } from "./router.js";
import { createView, thumbnail, blockThumbnail } from "./view.js";
import { junctionCounts } from "./junctions.js";
import { BLOCK, formatPins, handlesOf, parsePins, SHAPES, geometryOf } from "./block.js";
import { PRESETS, presetById } from "./presets.js";
import { sections } from "./categories.js";
import { checkedBackdrop, circuitFromSvg, sanitizeSvg, MAX_SVG_BYTES } from "./svgimport.js";
import { orient } from "./geometry.js";
import { namedNetNames, parseTruthTable, truthTable } from "./demo.js";
import { framesFromSignals, levelTagStyleOf, setCalculatedFrames, setLevelTagStyle, setWireLabelStyle, wireLabelStyleOf, setWireLabels, wireLabelOf, applyFrame, captureFrame, ensureFrameZero, frameTex, framesOf, moveFrame, numbered, recaptureFrame, removeFrame, renameFrame, targetsOf } from "./levelframes.js";
import { calculateSteps, drivenWireIds, logicModeOf, resolveLogic, setLogicMode } from "./simlevels.js";
import { convertHandLevels, handLevelsFromFrames, setHandLevel } from "./scenario.js";
import { migrateR1 } from "./migrate.js";
import { openableUrl } from "../../shared/src/openurl.js";
import { createSvPanel } from "./svpanel.js";
import { EMPTY_STATUS, EXAMPLE_STATUS, startAction } from "./start.js";
import { createStartChooser } from "./startui.js";

// Browser storage keys, set by mount() from options.storage (the tool's own prefix: "schematic-editor/" on its page,
// "figure-editor/" in the Figure Editor) and options.timingStorage (the Timing Diagram's, shared with its own page).
let AUTOSAVE, SAVES, OPTIONS, THEME, TIMING_SOURCE, TIMING_SEND, TRUTH_TABLE;

// The parts a composite lends (R1): slide export, the Timing Diagram, ZIP export and the LaTeX truth table. On the Schematic
// Editor's own page they are absent: their sections and panes are hidden and these stay at their empty values.
let FORMATS = {}, KINDS = {}, SLIDE_LAYOUTS = {}, SPLITS = {};
let contentArea, defaultSlide, layoutThumb, nudgeRegion, slideOf = () => null, slideSize, slideSvg, splitsOf = () => ({}), withLayout, withSlide = (d) => d, withSplit;
let drawTiming, parseEdge, arrowLabelSizeOf, lineWidthOf, signalNameSizeOf, textSizeOf;
let zipStore, latexTable, parseTable;
let PARTS = { slide: false, timing: false, zip: false, latex: false };
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
  ["W", "Wire tool: hold Shift while clicking a corner to draw the preceding leg straight (at 45-degree steps; Shift+Alt for any angle); clicks without Shift keep orthogonal routing. Click a pin, junction or wire to finish; Enter ends the wire where it is; Backspace removes a corner"],
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
  ["F", "Fit the current view in the window"],
  ["Esc", "Cancel what you are doing, go back to Select, or clear the selection"],
  ["?", "Show or hide this list"],
];

const BUTTON = "btn btn-sm fe-btn";
// Toolbar icons: 16-unit line drawings in currentColor, so the site's roles colour them.
const ICONS = {
  select: '<path d="M3 2l9 5-4 1.5L6.5 13z"/>',
  wire: '<path d="M2 12h5V5h7"/><circle cx="2" cy="12" r="1"/><circle cx="14" cy="5" r="1"/>',
  solder: '<path d="M2 8h12M8 2v12"/><circle cx="8" cy="8" r="2" fill="currentColor"/>',
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
  importsv: '<path d="M3 2h7l3 3v9H3z"/><path d="M10 2v3h3M5.5 8.5L4 10l1.5 1.5M10.5 8.5L12 10l-1.5 1.5M8.7 8l-1.4 4"/>',
  save: '<path d="M8 2v8M5 7l3 3 3-3M3 13h10"/>',
  export: '<path d="M3 5v8h10V5M8 11V2M5 5l3-3 3 3"/>',
  projectzip: '<path d="M3 2h7l3 3v9H3z"/><path d="M10 2v3h3M8 6v1m0 1v1m0 1v1m0 1v1"/>',
  png: '<rect x="2" y="3" width="12" height="10"/><circle cx="6" cy="7" r="1"/><path d="M2 12l4-3 3 2 2-2 3 3"/>',
  navframes: '<rect x="2" y="3" width="9" height="10"/><path d="M5 6h3M5 9h3M12 5h2v9H5v-1"/>',
  help: '<circle cx="8" cy="8" r="6"/><path d="M6.4 6.1a1.7 1.7 0 1 1 2.8 1.3c-.8.6-1.2.9-1.2 1.8M8 11.6v.1"/>',
  frametosignal: '<path d="M2 8h3l2-4 3 8 2-4h2"/><path d="M8 2v2M8 12v2"/>',
};
/** A button for a command: an icon (named for assistive tech and in its tooltip) or, with no icon, its text. */
const btn = (cmd, label, keys = "", extra = "", title = label) => {
  const art = ICONS[cmd] ? `<svg class="fe-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${ICONS[cmd]}</svg>` : label;
  const name = ICONS[cmd] ? ` aria-label="${label}"` : "";
  return `<button type="button" class="${BUTTON}" data-cmd="${cmd}"${name} title="${title}${keys ? ` (${keys})` : ""}"${keys ? ` aria-keyshortcuts="${keys}"` : ""}${extra}>${art}</button>`;
};

/**
 * The Schematic Editor's toolbar, as groups of buttons (R1). Its own page puts them in its toolbar; a host such as the
 * Figure Editor builds its own toolbar from them and adds its own. Every button carries data-cmd, so the editor handles it
 * wherever the host puts it, as long as it is inside the element the editor is mounted on.
 */
export function toolbarGroups() {
  return {
    tool: `${btn("select", "Select", "Escape", ' aria-pressed="true"')}${btn("wire", "Wire", "W", ' aria-pressed="false"')}${btn("port", "Port", "P", ' aria-pressed="false"')}${btn("label", "Label", "T", ' aria-pressed="false"')}${btn("solder", "Solder dot", "", ' aria-pressed="false"', "Connect crossing wires")}`,
    edit: `${btn("rotate", "Rotate", "R")}${btn("mirror", "Mirror", "M")}${btn("delete", "Delete", "Delete")}`,
    history: `${btn("undo", "Undo", "Control+Z")}${btn("redo", "Redo", "Control+Y")}`,
    clipboard: `${btn("copy", "Copy", "Control+C")}${btn("paste", "Paste", "Control+V")}`,
    view: `${btn("zoomout", "Zoom out", "-")}${btn("zoomin", "Zoom in", "+")}${btn("fit", "Fit", "F")}`,
    grid: `<span class="fe-grouplabel label-mono" aria-hidden="true">Grid</span>${btn("gridhalf", "½", "", ' aria-pressed="true"', "Snap parts to half a module")}${btn("gridfull", "1", "", ' aria-pressed="false"', "Snap parts to a whole module")}`,
    file: `${btn("new", "New")}${btn("open", "Open…")}${btn("importsv", "Import SystemVerilog", "", "", "Import SystemVerilog: paste or open a .sv file")}${btn("save", "Save", "Control+S")}${btn("export", "Export", "", "", "Export the active view as SVG or PNG")}`,
    frames: `${btn("frameprev", "◀", "", "", "Previous frame")}<input class="fe-stepinput" type="number" min="0" step="1" aria-label="Go to frame" title="Type a frame number and press Enter"><span class="fe-stepno label-mono"></span>${btn("framenext", "▶", "", "", "Next frame")}${btn("navframes", "Export frames", "", "", "Export each frame in the active workspace as SVG or PNG")}`,
    help: `${btn("help", "Keys", "?")}`,
    // buttons that act on the Figure Editor's parts (the Timing Diagram, ZIP); a host that lends those parts adds them
    projectzip: `${btn("projectzip", "Project ZIP", "", "", "Download the schematic, timing diagram, and editable project JSON as a ZIP file")}`,
    frametosignal: `${btn("frametosignal", "Send current frame to timing", "", "", "Send the current schematic state to a timing step")}`,
    inputs: `<input type="file" class="fe-file" accept=".json,.svg,application/json,image/svg+xml" hidden><input type="file" class="fe-theme-file" accept=".json,application/json" hidden>`,
  };
}
const group = (label, html, end = false) => `<div class="fe-group${end ? " fe-group-end" : ""}" role="group" aria-label="${label}">${html}</div>`;

export async function mount(root, options = {}) {
  const prefix = options.storage ?? "schematic-editor/", tprefix = options.timingStorage ?? `${prefix}timing-`;
  AUTOSAVE = `${prefix}autosave`; SAVES = `${prefix}saves`; OPTIONS = `${prefix}options`; THEME = `${prefix}private-theme`;
  TIMING_SOURCE = `${tprefix}source`; TIMING_SEND = `${tprefix}send`; TRUTH_TABLE = `${prefix}truth-table`;
  const parts = options.parts ?? {};
  PARTS = { slide: !!parts.slide, timing: !!parts.timing, zip: !!parts.zip, latex: !!parts.latex };
  if (parts.slide) ({ FORMATS, KINDS, LAYOUTS: SLIDE_LAYOUTS, SPLITS, contentArea, defaultSlide, layoutThumb, nudgeRegion, slideOf, slideSize, slideSvg, splitsOf, withLayout, withSlide, withSplit } = parts.slide);
  if (parts.timing) ({ drawTiming, parseEdge, arrowLabelSizeOf, lineWidthOf, signalNameSizeOf, textSizeOf } = parts.timing);
  if (parts.zip) ({ zipStore } = parts.zip);
  if (parts.latex) ({ latexTable, parseTable } = parts.latex);
  const emit = options.emit ?? (() => {});
  if (options.migrate) migrateR1((k) => { try { return localStorage.getItem(k); } catch { return null; } }, (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } });
  const base = new URL(options.pack ?? "./symbol-pack/", document.baseURI);
  const say0 = (html) => { const s = options.host && root.querySelector(`[data-slot="status"]`); if (s) s.innerHTML = html; else root.innerHTML = html; };   // a host's shell is never wiped
  say0(`<p class="fe-status" role="status">Loading the symbol pack…</p>`);
  let loaded;
  try {
    loaded = await loadPack(async (p) => {
      const r = await fetch(new URL(p, base));
      if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
      return r.text();
    });
  } catch (e) {
    say0(`<p class="fe-status" role="alert">Could not load the symbol pack: ${esc(e.message)}</p>`);
    return null;
  }
  let pack = loaded;                                   // the active pack: the loaded one, or it drawn with a private theme

  // The editor's parts. On its own page it lays them out itself; embedded (options.host), the host has built the shell
  // (toolbar, section stack) and the editor fills the slots it finds: left, resizer, status (with dialogs), and each section.
  const tg = toolbarGroups();
  const leftHtml = `
    <div class="fe-left" role="region" aria-label="Editor controls">
      <details class="fe-palette fe-pane" data-views="figure">
        <summary class="label-mono">Elements</summary>
        <div class="fe-cats"></div>
      </details>
      <details data-views="figure" class="fe-pane fe-selection-pane">
        <summary class="label-mono">Selection</summary>
        <section class="fe-props" aria-label="Selection"></section>
      </details>
      <details data-views="figure timing slide" class="fe-pane" name="fe-doc">
        <summary class="label-mono">Figure</summary>
        <label class="form-label">Figure id <input class="form-control form-control-sm" name="fe-id" spellcheck="false"></label>
        <label class="form-label">Title <input class="form-control form-control-sm" name="fe-title"></label>
      </details>
      <details data-views="figure timing slide" class="fe-pane fe-logic-mode" name="fe-doc">
        <summary class="label-mono">Logic</summary>
        <label class="form-check"><input class="form-check-input" type="checkbox" name="fe-logic-calculation" checked> <span class="form-check-label">Calculate logic levels</span></label>
        <p class="fe-hint">Turn this off to clear calculated levels and set them manually. This choice is saved with the figure.</p>
      </details>
      <details data-views="figure slide" class="fe-pane fe-export" name="fe-doc">
        <summary class="label-mono">Export</summary>
        <label class="form-label">Scale (%) <input class="form-control form-control-sm" type="number" name="fe-scale" min="10" max="1000" step="5"></label>
        <label class="form-label">Label size (pt) <input class="form-control form-control-sm" type="number" name="fe-labelpt" min="4" max="48" step="0.5"></label>
        <label class="form-check"><input class="form-check-input" type="checkbox" name="fe-tags"> <span class="form-check-label">Level tags (0, 1, X, Z)</span></label>
        <label class="form-label">Level tag size (pt) <input class="form-control form-control-sm" type="number" name="fe-tagpt" min="4" max="48" step="0.5"></label>
        <label class="form-check"><input class="form-check-input" type="checkbox" name="fe-tagcolour"> <span class="form-check-label">Match tag colour to logic level</span></label>
        <label class="form-check"><input class="form-check-input" type="checkbox" name="fe-netnames"> <span class="form-check-label">Show net names</span></label>
        <label class="form-check"><input class="form-check-input" type="checkbox" name="fe-exportdark"> <span class="form-check-label">Export in dark theme</span></label>
        <p class="fe-size" aria-live="polite"></p>
      </details>
      <details data-views="figure timing slide" class="fe-pane fe-theme" name="fe-doc">
        <summary class="label-mono">Theme</summary>
        <label class="form-label">Canvas <select class="form-select form-select-sm" name="fe-canvas"><option value="auto">Auto (follows system)</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <p class="fe-theme-note"></p>
        <div class="fe-theme-buttons" role="group" aria-label="Theme">${btn("theme", "Private theme…")}${btn("themereset", "Default theme")}</div>
        <fieldset class="fe-levelcolours"><legend class="label-mono" title="Colours are saved with the figure; defaults follow the theme.">Level colours</legend>
          <div class="fe-lc-head" aria-hidden="true"><span></span><span>Light</span><span>Dark</span><span></span></div>
          ${LEVELS.map((l) => `<div class="fe-lc-row" data-level="${l.value}"><span class="fe-lc-name">${l.value} <small>${l.name}</small></span><input type="color" data-mode="light" aria-label="Level ${l.value}, light canvas"><input type="color" data-mode="dark" aria-label="Level ${l.value}, dark canvas"><button type="button" class="${BUTTON}" data-lc-reset="${l.value}" aria-label="Level ${l.value} back to the theme default" title="Back to the theme default">↺</button></div>`).join("")}
          <ul class="fe-lc-warnings" aria-live="polite"></ul>
          <div class="fe-theme-buttons">${btn("levelsreset", "Reset all to the defaults")}</div>
        </fieldset>
      </details>
      <details data-views="slide" class="fe-pane fe-slide-pane" name="fe-doc">
        <summary class="label-mono" title="Configure slide size, layout, and regions. Drag regions in the slide view.">Slide</summary>
        <label class="form-check"><input class="form-check-input" type="checkbox" name="fe-slide-show"> <span class="form-check-label">Show the slide (instead of the canvas)</span></label>
        <label class="form-label">Slide size <select class="form-select form-select-sm" name="fe-slide-format">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("")}</select></label>
        <label class="form-label">Header and footer heights (cm) <span class="fe-pair"><input class="form-control form-control-sm" type="number" name="fe-slide-header" min="0" max="8" step="0.25" aria-label="Header height (cm)"><input class="form-control form-control-sm" type="number" name="fe-slide-footer" min="0" max="5" step="0.25" aria-label="Footer height (cm)"></span></label>
        <label class="form-label">Layout <select class="form-select form-select-sm" name="fe-slide-layout"><option value="custom" disabled>Custom (regions moved by hand)</option>${Object.entries(SLIDE_LAYOUTS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("")}</select></label>
        <fieldset class="fe-splits"><legend class="label-mono">Dividers</legend>${Object.entries(SPLITS).map(([k, v]) => `<label class="form-label" data-split="${k}">${v.name} (%) <input class="form-control form-control-sm" type="number" min="${v.min}" max="${v.max}" step="1" name="fe-split-${k}" title="${v.hint}"></label>`).join("")}<button type="button" class="${BUTTON}" data-cmd="splitsreset">Reset dividers to the layout's defaults</button></fieldset>
        <ul class="fe-slide-regions" aria-label="Regions"></ul>
        <div class="fe-theme-buttons" role="group" aria-label="Add a region">${btn("addschematic", "+ Schematic")}${btn("addtiming", "+ Timing")}${btn("addtext", "+ Text")}</div>
        <label class="form-check"><input class="form-check-input" type="checkbox" name="fe-tmarker"> <span class="form-check-label">Mark the selected frame's step on the timing diagram</span></label>
        <label class="form-check"><input class="form-check-input" type="checkbox" name="fe-tcolour"> <span class="form-check-label">Colour the timing diagram like the nets (by level)</span></label>
      </details>
      <div class="fe-timing-controls" data-views="timing"></div>
      <details data-views="figure timing" class="fe-pane fe-node-levels">
        <summary class="label-mono">Node levels</summary>
        <p class="fe-hint">Levels apply to the selected frame.</p>
        <div class="fe-node-level-list"></div>
      </details>
      <details data-views="figure timing slide" class="fe-pane fe-frames-pane" name="fe-doc">
        <summary class="label-mono" title="Frame 0 holds initial levels; later frames correspond to timing steps.">Frames</summary>
        <div class="fe-theme-buttons" role="group" aria-label="Frames">${btn("framesfromtiming", "Fill from timing diagram")}${btn("framecapture", "Capture frame")}${btn("framerecapture", "Update selected")}</div>
        <ol class="fe-frame-list" aria-label="Frames"></ol>
        <div class="fe-theme-buttons" role="group" aria-label="Edit the selected frame">${btn("framerename", "Rename")}${btn("frameup", "Move up")}${btn("framedown", "Move down")}${btn("framedelete", "Delete")}</div>
        <label class="form-label">Export each frame as <select class="form-select form-select-sm" name="fe-frames-what"><option value="schematic">Schematic</option><option value="timing">Timing diagram</option><option value="slide">Slide</option></select></label>
        <div class="fe-theme-buttons" role="group" aria-label="Export frames">${btn("framesexport", "Export frames")}${btn("framesslide", "Export all on one slide")}</div>
      </details>
      <details data-views="figure" class="fe-pane fe-backdrop-pane" name="fe-doc">
        <summary class="label-mono">Backdrop</summary>
        <div class="fe-theme-buttons">${btn("backdropopen", "Choose SVG or PNG…")}</div>
        <input type="file" class="fe-backdrop-file" accept=".svg,.png,image/svg+xml,image/png" hidden>
        <div class="fe-backdrop-controls" hidden>
          <label class="form-label">Opacity (%) <input class="form-control form-control-sm" type="number" name="fe-bd-opacity" min="0" max="100" step="5"></label>
          <label class="form-label">Scale (%) <input class="form-control form-control-sm" type="number" name="fe-bd-scale" min="5" max="2000" step="5"></label>
          <label class="form-label">Shift right, up (grid steps) <span class="fe-pair"><input class="form-control form-control-sm" type="number" name="fe-bd-x" step="1"><input class="form-control form-control-sm" type="number" name="fe-bd-y" step="1"></span></label>
          <div class="fe-theme-buttons">${btn("backdropremove", "Remove backdrop")}</div>
        </div>
      </details>
      <details class="fe-pane fe-warnings">
        <summary class="label-mono">Warnings</summary>
        <ul></ul>
      </details>
    </div>`;
  const resizerHtml = `<div class="fe-resizer" data-resize="left" role="separator" aria-label="Resize controls pane" aria-orientation="vertical" tabindex="0"></div>`;
  const statusHtml = `
    <p class="fe-status" role="status" aria-live="polite"></p>
    <dialog class="fe-help" aria-labelledby="fe-help-title">
      <h2 id="fe-help-title">Keys</h2>
      <table><tbody>${KEYS.map(([k, what]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(what)}</td></tr>`).join("")}</tbody></table>
      <form method="dialog"><button class="${BUTTON}">Close</button></form>
    </dialog>
    <dialog class="fe-export-dialog" aria-labelledby="fe-export-title">
      <form method="dialog">
        <h2 id="fe-export-title">Export</h2>
        <div class="fe-export-options">
          <button type="button" class="${BUTTON}" data-export-format="svg" title="Download a scalable vector graphic">SVG</button>
          <button type="button" class="${BUTTON}" data-export-format="png" title="Download a PNG image at 300 dpi">PNG</button>
          <button type="submit" class="${BUTTON}">Cancel</button>
        </div>
      </form>
    </dialog>`;
  const sectionHtml = {
    figure: `<div class="fe-stage">
        <svg class="fe-canvas" tabindex="0" role="application" aria-label="Figure canvas" xmlns="http://www.w3.org/2000/svg"></svg>
        <div class="fe-empty" hidden><h2>Empty figure</h2><p>${esc(EMPTY_STATUS.split(". Press")[0] + ".")}</p><p class="fe-empty-keys"><kbd>W</kbd> Wire <kbd>P</kbd> Port <kbd>T</kbd> Label <kbd>?</kbd> Keys</p></div>
      </div>`,
    timing: `<div class="fe-timing-body"></div>`,
    slide: `<div class="fe-slidebar" role="toolbar" aria-label="Slide layouts"></div>
        <svg class="fe-slideview" role="img" aria-label="Slide view: drag a region to move it, drag its corner to resize it" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"></svg>`,
  };
  if (options.host) {
    const slot = (name, html) => { const el = root.querySelector(`[data-slot="${name}"]`); if (el) el.outerHTML = html; };
    slot("left", leftHtml); slot("resizer", resizerHtml); slot("status", statusHtml + tg.inputs);
    for (const [name, html] of Object.entries(sectionHtml)) { const sec = root.querySelector(`.fe-sec[data-sec="${name}"]`); if (sec) sec.innerHTML = html; }
  } else {
    root.innerHTML = `
  <div class="fe">
    <div class="fe-toolbar" role="toolbar" aria-label="Schematic Editor">
      ${group("Tool", tg.tool)}${group("Edit", tg.edit)}${group("History", tg.history)}${group("Clipboard", tg.clipboard)}${group("View", tg.view)}${group("Part grid: snap step for parts", tg.grid)}${group("File", tg.file)}
      <div class="fe-group fe-group-end" role="navigation" aria-label="Frames"><span class="fe-stepper">${tg.frames}</span>${tg.help}</div>
      ${tg.inputs}
    </div>${leftHtml}
    ${resizerHtml}
    <div class="fe-stack" role="region" aria-label="Schematic Editor">
      <div class="fe-sec" data-sec="figure">${sectionHtml.figure}</div>
    </div>${statusHtml}
  </div>`;
  }

  const $ = (s) => root.querySelector(s);
  const svg = $(".fe-canvas"), statusEl = $(".fe-status"), fileInput = $(".fe-file"), themeInput = $(".fe-theme-file");
  const idInput = $('[name="fe-id"]'), titleInput = $('[name="fe-title"]'), logicCalculationInput = $('[name="fe-logic-calculation"]'), propsEl = $(".fe-props"), selectionPane = $(".fe-selection-pane"), helpEl = $(".fe-help"), exportDialog = $(".fe-export-dialog");
  const scaleInput = $('[name="fe-scale"]'), ptInput = $('[name="fe-labelpt"]'), tagPtInput = $('[name="fe-tagpt"]'), tagsInput = $('[name="fe-tags"]'), tagColourInput = $('[name="fe-tagcolour"]'), netNamesInput = $('[name="fe-netnames"]'), draftsInput = { checked: false }, canvasInput = $('[name="fe-canvas"]'), exportDarkInput = $('[name="fe-exportdark"]');
  const view = createView(svg, loaded);
  // The editor fills the window below the site header; measure the header so the two never overlap.
  const header = document.querySelector("#quarto-header");
  const fit = () => root.style.setProperty("--fe-top", `${header ? Math.round(header.getBoundingClientRect().bottom) : 0}px`);
  fit(); window.addEventListener("resize", fit);

  // ---- state ---------------------------------------------------------------------------
  let doc = ensureFrameZero(D.newDoc());
  const history = new History();
  let svPanel = null;
  let selection = none();
  let selectedJunction = null;
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
  let selectedFrame = 0;             // the frame chosen in the Frames list (level frames, F11.2)
  let timingTool = null, fitTimingWhenReady = false, refreshFramesWhenTimingReady = false;
  const pendingTimingSteps = new Set();
  let refreshTruthPortList = () => {};
  let truthTableProjectChanged = () => {};
  let truthTableSnapshot = () => null;
  const framesWhat = $('[name="fe-frames-what"]');
  let pendingExport = null;
  let autosaveTimer = null;
  const typeset = new Map();         // TeX to parseTypeset's result (every label drawn is typeset once)

  const opt = { frame: null, scale: 1, labelPt: null, levelTags: false, levelTagPt: null, levelTagColour: false, netNames: true, timingMarker: true, timingColour: false, drafts: false, grid: 1, canvas: "auto", exportDark: false, ...(() => { try { return JSON.parse(store.get(OPTIONS) ?? "{}"); } catch { return {}; } })() };
  if (opt.grid !== 2) opt.grid = 1;   // snap for parts, in grid steps: 1 is half a module (default), 2 is a whole module
  if (!["auto", "light", "dark"].includes(opt.canvas)) opt.canvas = "auto";
  opt.exportDark = opt.exportDark === true;
  opt.netNames = opt.netNames !== false;
  opt.levelTagPt = Number.isFinite(+opt.levelTagPt) && +opt.levelTagPt >= 4 && +opt.levelTagPt <= 48 ? +opt.levelTagPt : 8;
  opt.levelTagColour = opt.levelTagColour === true;
  opt.drafts = false;   // draft elements are no longer offered
  delete opt.frame;   // the F10 frame option is replaced by the slide saved in the figure (F19)
  /** Snap a point (grid steps) to the part grid. Wires, ports and labels always snap to one step (half a module). */
  function snapPart(p) { const g = opt.grid; return [g * Math.round(p[0] / g) || 0, g * Math.round(p[1] / g) || 0]; }
  const saveOptions = () => store.set(OPTIONS, JSON.stringify(opt));
  const editor = $(".fe");
  const paneWidth = (n, fallback) => Number.isFinite(Number(n)) ? Math.max(160, Math.min(480, Math.round(Number(n)))) : fallback;
  opt.leftPaneWidth = paneWidth(opt.leftPaneWidth, 240);
  function applyPaneWidths() {
    editor.style.setProperty("--fe-left-width", `${opt.leftPaneWidth}px`);
    for (const handle of root.querySelectorAll(".fe-resizer")) {
      handle.setAttribute("aria-valuemin", "160");
      handle.setAttribute("aria-valuemax", "480");
      handle.setAttribute("aria-valuenow", String(opt.leftPaneWidth));
    }
  }
  function resizePane(width) {
    opt.leftPaneWidth = paneWidth(width, opt.leftPaneWidth);
    applyPaneWidths();
  }
  applyPaneWidths();
  for (const handle of root.querySelectorAll(".fe-resizer")) {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const move = (event) => {
        const bounds = editor.getBoundingClientRect();
        resizePane(event.clientX - bounds.left);
      };
      const done = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", done);
        handle.removeEventListener("pointercancel", done);
        saveOptions();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", done, { once: true });
      handle.addEventListener("pointercancel", done, { once: true });
    });
    handle.addEventListener("keydown", (e) => {
      const delta = e.key === "ArrowRight" ? 16 : e.key === "ArrowLeft" ? -16 : 0;
      if (delta) {
        e.preventDefault();
        resizePane(opt.leftPaneWidth + delta);
        saveOptions();
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        resizePane(e.key === "Home" ? 160 : 480);
        saveOptions();
      }
    });
  }
  const workspaceViews = ["figure", "timing", "slide"];
  const savedPanes = opt.workspacePanes && typeof opt.workspacePanes === "object" ? opt.workspacePanes : {};
  function setWorkspacePanes(panes) {
    let values = workspaceViews.map((key) => Math.max(0, Number(panes[key]) || 0));
    if (!values.some(Boolean)) values = [100, 0, 0];
    const sum = values.reduce((total, value) => total + value, 0);
    opt.workspacePanes = Object.fromEntries(workspaceViews.map((key, i) => [key, values[i] * 100 / sum]));
    for (const key of workspaceViews) editor.style.setProperty(`--fe-${key}-pane`, `${opt.workspacePanes[key]}fr`);
  }
  setWorkspacePanes(savedPanes);
  for (const handle of root.querySelectorAll(".fe-stack-resizer")) {
    const [before, after] = handle.dataset.stackResize.split("-");
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const a = root.querySelector(`[data-sec="${before}"]`), b = root.querySelector(`[data-sec="${after}"]`);
      const aHeight = a.getBoundingClientRect().height, bHeight = b.getBoundingClientRect().height, pairHeight = aHeight + bHeight;
      const pairWeight = opt.workspacePanes[before] + opt.workspacePanes[after];
      if (!pairHeight || !pairWeight) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const move = (event) => {
        const height = Math.max(0, Math.min(pairHeight, aHeight + event.clientY - startY));
        setWorkspacePanes({ ...opt.workspacePanes, [before]: pairWeight * height / pairHeight, [after]: pairWeight * (1 - height / pairHeight) });
        window.dispatchEvent(new Event("resize"));
        timingTool?.render();
        syncSlide();
      };
      const done = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", done);
        handle.removeEventListener("pointercancel", done);
        saveOptions();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", done, { once: true });
      handle.addEventListener("pointercancel", done, { once: true });
    });
    handle.addEventListener("keydown", (e) => {
      const delta = e.key === "ArrowDown" ? 5 : e.key === "ArrowUp" ? -5 : 0;
      if (delta) {
        e.preventDefault();
        const total = opt.workspacePanes[before] + opt.workspacePanes[after];
        if (!total) return;
        const next = Math.max(0, Math.min(total, opt.workspacePanes[before] + delta));
        setWorkspacePanes({ ...opt.workspacePanes, [before]: next, [after]: total - next });
        saveOptions();
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        const total = opt.workspacePanes[before] + opt.workspacePanes[after];
        if (!total) return;
        const first = e.key === "Home" ? 0 : total;
        setWorkspacePanes({ ...opt.workspacePanes, [before]: first, [after]: total - first });
        saveOptions();
      }
    });
  }
  const drawOpts = () => ({
    typeset, labelPt: opt.labelPt ?? undefined, levelTags: opt.levelTags,
    levelTagPt: opt.levelTagPt ?? undefined, levelTagColour: opt.levelTagColour,
    netNames: opt.netNames, scale: opt.scale,
    preserveLevels: true,
  });

  /** The status line. An error is bold and announced at once, and stays until the next message. */
  let statusRevision = 0;
  let lastLabelProblems = "";
  const status = (msg, error = false) => {
    emit("status", { text: msg, error });
    statusRevision++;
    statusEl.textContent = msg;
    statusEl.toggleAttribute("data-error", error);
    statusEl.setAttribute("role", error ? "alert" : "status");
  };
  const statusNodesMarkup = (nodes) => nodes.map((node) =>
    `<${node.tag}${node.attrs.map(([key, value]) => ` ${key}="${esc(value)}"`).join("")}>${statusNodesMarkup(node.children)}</${node.tag}>`).join("");
  function statusWithNodes(names, detail) {
    const label = names.length === 1 ? "Node " : "Nodes ";
    status(`${label}${names.join(", ")} ${detail}`);
    const revision = statusRevision;
    const pairs = names.map((name) => {
      try { return [name, texOf(name)]; } catch { return [name, null]; }
    });
    typesetAll(pairs.map(([, tex]) => tex).filter(Boolean), typeset).then(() => {
      if (revision !== statusRevision) return;
      const math = (name, tex) => {
        const parsed = tex && typeset.get(tex);
        if (!parsed?.ok) return esc(name);
        const x = parsed.left * 1000, y = -parsed.height * 1000;
        const width = parsed.width * 1000, height = (parsed.height + parsed.depth) * 1000;
        return `<svg role="img" aria-label="${esc(name)}" viewBox="${x} ${y} ${width} ${height}" width="${parsed.width}em" height="${parsed.height + parsed.depth}em" style="vertical-align:-${parsed.depth}em"><g color="currentColor">${statusNodesMarkup(parsed.nodes)}</g></svg>`;
      };
      statusEl.innerHTML = `${esc(label)}${pairs.map(([name, tex]) => math(name, tex)).join(", ")} ${esc(detail)}`;
    });
  }

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
    const roles = { ...(dark ? darkRoles() : {}), ...(privateRoles ?? {}), ...levelRoles(doc.style?.levels, dark) };   // the figure's own level colours (F17) win
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
  let levelsKey = "";   // the figure's level colours as last applied to the canvas pack
  function applyLevels() {
    const key = JSON.stringify(doc.style?.levels ?? {});
    if (key !== levelsKey) { levelsKey = key; applyCanvas(); }
  }
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
    applyLevels();
    lastDrawing = view.render({
      doc, pack, selection, selectedJunction, ghost, rubber, hover, hoverWire, box: boxSel, forced: framesOf(doc)[selectedFrame]?.forced ?? [],
      typeset, labelPt: opt.labelPt ?? undefined, levelTags: opt.levelTags,
      levelTagPt: opt.levelTagPt ?? undefined, levelTagColour: opt.levelTagColour, netNames: opt.netNames,
    });
    if (lastDrawing.pending.length) queueTypeset();
    updateUI();
    syncTimingSelection();
    syncEmptyState();
  }

  // The "Empty figure" hint shows after that start choice, until the figure has anything in it.
  let emptyChosen = false;
  function syncEmptyState() {
    const el = $(".fe-empty"); if (!el) return;
    if (emptyChosen && (doc.elements.length || doc.wires.length || doc.ports.length || doc.labels?.length)) emptyChosen = false;
    el.hidden = !emptyChosen;
  }

  function renderPalette() {
    const tile = (t) => {
      const draft = pack.statusOf(t) !== "approved", family = pack.parametersOf(t);
      return `<li><button type="button" class="fe-part${draft ? " is-draft" : ""}" data-type="${esc(t)}"${family.length ? ' aria-haspopup="dialog"' : ""} title="${esc(pack.def(t).description)}${draft ? " (draft)" : ""}">${thumbnail(pack, t)}<span>${esc(t)}</span>${family.length ? `<em class="fe-fam" aria-hidden="true">${esc(family.map((q) => `${q.values[0]}–${q.values.at(-1)}`).join(" · "))}</em>` : ""}${draft ? '<em class="fe-draft">draft</em>' : ""}</button></li>`;
    };
    const preset = (p) => `<li><button type="button" class="fe-part" data-preset="${esc(p.id)}" title="${esc(p.name)}: a block with these pins; size, shape, pins and labels can all be changed">${blockThumbnail(pack, p.params)}<span>${esc(p.name)}</span></button></li>`;
    $(".fe-palette .fe-cats").innerHTML = sections(pack.types(true)).map((s) => {
      const open = opt.cats?.[s.id] ?? false;
      const items = s.presets ? PRESETS.map(preset) : s.types.map(tile);
      return `<details class="fe-cat" data-cat="${esc(s.id)}"${open ? " open" : ""}><summary class="fe-cat-head label-mono">${esc(s.title)} <span class="fe-count">${items.length}</span></summary><nav aria-label="${esc(s.title)}"><ul class="${s.presets ? "fe-blocks" : "fe-parts"}">${items.join("")}</ul></nav></details>`;
    }).join("");
  }
  // which sections are open is a per-viewer convenience, kept with the other options
  root.querySelector(".fe-palette").addEventListener("toggle", (e) => {
    const id = e.target.dataset?.cat;
    if (id) { opt.cats = { ...opt.cats, [id]: e.target.open }; saveOptions(); }
  }, true);

  // ---- families: a popover chooses the size or count before placing (F21.1) ----
  const PARAM_NAMES = { n: "Inputs or channels", k: "Select lines", bits: "Bits", addr_bits: "Address bits", data_bits: "Data bits", words: "Words" };
  let familyPop = null;
  function closeFamily() { familyPop?.remove(); familyPop = null; }
  function openFamily(tile, type, viaKeyboard) {
    closeFamily();
    const params = pack.parametersOf(type), pick = Object.fromEntries(params.map((q) => [q.name, q.default]));
    const place = () => {
      const chosen = Object.fromEntries(Object.entries(pick).filter(([k, v]) => v !== params.find((q) => q.name === k).default));
      closeFamily();
      startPlacing(type, viaKeyboard, Object.keys(chosen).length ? chosen : null);
    };
    const pop = document.createElement("div");
    pop.className = "fe-popover"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", `${type}: choose a size`);
    pop.innerHTML = `<p class="label-mono">${esc(type)}</p>${params.map((q) => `<fieldset><legend>${esc(PARAM_NAMES[q.name] ?? q.name)}</legend><div class="fe-pop-values">${q.values.map((v) => `<button type="button" data-p="${esc(q.name)}" data-v="${v}" aria-pressed="${v === q.default}">${v}</button>`).join("")}</div></fieldset>`).join("")}${params.length > 1 ? `<button type="button" class="${BUTTON} fe-pop-place">Place</button>` : ""}<p class="fe-hint">Default: ${params.map((q) => q.default).join(", ")}. Esc closes.</p>`;
    pop.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (b) {
        pick[b.dataset.p] = Number(b.dataset.v);
        for (const x of pop.querySelectorAll(`[data-p="${b.dataset.p}"]`)) x.setAttribute("aria-pressed", String(x === b));
        if (params.length === 1) place();   // one choice: the click places
      }
      if (e.target.closest(".fe-pop-place")) place();
    });
    pop.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeFamily(); tile.focus(); } e.stopPropagation(); });
    const r = tile.getBoundingClientRect();
    pop.style.left = `${Math.min(r.left, window.innerWidth - 260)}px`; pop.style.top = `${r.bottom + 4}px`;
    document.body.append(pop);
    familyPop = pop;
    pop.querySelector('[aria-pressed="true"]')?.focus();
  }
  document.addEventListener("pointerdown", (e) => { if (familyPop && !familyPop.contains(e.target) && !e.target.closest(".fe-part")) closeFamily(); });

  function updateUI() {
    logicCalculationInput.checked = logicModeOf(doc) === "calculated";
    const timingLogicInput = root.querySelector("[data-logic-calculation]");
    if (timingLogicInput) timingLogicInput.checked = logicCalculationInput.checked;
    renderNodeLevels();
    const has = total(selection) > 0;
    const set = (cmd, enabled) => { const b = root.querySelector(`[data-cmd="${cmd}"]`); if (b) b.disabled = !enabled;   /* a host may leave out any button */ };
    const mirrorable = (placing && pack.mirrorable(placing.type)) ||
      selection.elements.some((id) => pack.mirrorable(doc.elements.find((e) => e.id === id)?.type));
    set("rotate", placing || selection.elements.length);
    set("mirror", mirrorable);
    set("delete", has);
    set("copy", has);
    set("paste", !!clipboard);
    set("undo", history.canUndo);
    set("redo", history.canRedo);
    for (const t of ["select", "wire", "port", "label", "solder"]) root.querySelector(`[data-cmd="${t}"]`)?.setAttribute("aria-pressed", String(tool === t));
    root.querySelector(`[data-cmd="gridhalf"]`)?.setAttribute("aria-pressed", String(opt.grid === 1));
    root.querySelector(`[data-cmd="gridfull"]`)?.setAttribute("aria-pressed", String(opt.grid === 2));
    svg.dataset.tool = tool;
    if (document.activeElement !== idInput) idInput.value = doc.id;
    if (document.activeElement !== titleInput) titleInput.value = doc.title ?? "";
    renderProps();
    const warnings = [...loadWarnings, ...D.lint(doc, pack)];
    const labelProblems = lastDrawing ? lastDrawing.problems.filter((p) => !p.endsWith("not typeset yet")) : [];
    warnings.push(...labelProblems);
    // A label that cannot be drawn is left out of the drawing: say so in the status line, once per new set of problems.
    const labelKey = labelProblems.join("; ");
    if (labelKey !== lastLabelProblems) {
      lastLabelProblems = labelKey;
      if (labelProblems.length) status(`Not drawn: ${labelProblems.join("; ")}.`, true);
    }
    $(".fe-warnings ul").innerHTML = warnings.map((w) => `<li>${esc(w)}</li>`).join("");
    $(".fe-warnings").hidden = !warnings.length;
    if (lastDrawing) {
      const { widthCm, heightCm } = exportSize(lastDrawing, opt.scale);
      syncSlide(); renderFrames(); syncLevels();
      $(".fe-size").textContent = lastDrawing.box ? `File size: ${widthCm.toFixed(2)} × ${heightCm.toFixed(2)} cm${opt.scale === 1 ? " (real size)" : ""}` : "Nothing to export yet.";
    }
    $(".fe-theme-note").textContent = privateRoles
      ? "Private theme loaded. It is kept in this browser only and is never saved in a figure or sent anywhere."
      : `Default theme (${loaded.theme.theme}) from the symbol pack${root.dataset.canvas === "dark" ? ", with the dark canvas mapping" : ""}.`;
  }

  // ---- the properties panel ---------------------------------------------------------------
  const field = (label, name, extra = "") => `<label class="form-label">${label} <input class="form-control form-control-sm" data-field="${name}" spellcheck="false" ${extra}></label>`;
  const choice = (label, name, opts, extra = "") => `<label class="form-label">${label} <select class="form-select form-select-sm" data-field="${name}" ${extra}>${opts.map(([v, t, off]) => `<option value="${v}"${off ? " disabled" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  const SIDE_OPTS = [["", "centred on the point"], ["left", "left of the point"], ["right", "right of the point"], ["up", "above the point"], ["down", "below the point"]];
  const levelOpts = () => [["", "none (default colour)"], ...LEVELS.map((l) => [l.value, `${l.value}: ${l.name}`, !pack.levelColour(l.value)])];
  const junctionIsFourWay = (id) => (junctionCounts(doc).get(id) ?? 0) >= pack.theme.junction.min_wires;

  const BLOCK_PIN_FIELDS = { blkLeft: "left", blkRight: "right", blkTop: "top", blkBottom: "bottom" };
  const blockFields = () =>
    choice("Shape", "blkShape", SHAPES.map((s) => [s, s])) +
    `<label class="form-label">Width (modules) <input class="form-control form-control-sm" type="number" min="1" step="1" data-field="blkW" title="A side needs one more module than it has pins."></label>` +
    `<label class="form-label">Height (modules) <input class="form-control form-control-sm" type="number" min="1" step="1" data-field="blkH" title="A side needs one more module than it has pins."></label>` +
    field("Text in the block (TeX or words)", "blkLabel") +
    field("Pins on the left", "blkLeft", 'title="Comma-separated pin names; append an optional label after a colon."') +
    field("Pins on the right", "blkRight", 'title="Comma-separated pin names; append an optional label after a colon."') +
    field("Pins on the top", "blkTop", 'title="Comma-separated pin names; append an optional label after a colon."') +
    field("Pins on the bottom", "blkBottom", 'title="Comma-separated pin names; append an optional label after a colon."');

  function propsModel() {
    const only = (list) => list.length === 1 && total(selection) === 1;
    const text = {}, values = {};
    const wires = selection.wires.map((id) => doc.wires.find((w) => w.id === id)).filter(Boolean);
    const els = selection.elements.map((id) => doc.elements.find((e) => e.id === id)).filter(Boolean);
    let html = "", key;
    if (pendingLabel) {
      key = "pending";
      html = `<p>New label at [${pendingLabel.at.join(", ")}]</p>${field("Label text (TeX, such as $A_0$)", "pendingText", 'title="Press Enter to add the label; Escape cancels."')}`;
    } else if (selectedJunction && junctionIsFourWay(selectedJunction)) {
      const j = doc.junctions.find((x) => x.id === selectedJunction);
      key = `junction:${selectedJunction}`;
      html = `<p><strong>Four-way junction</strong> at [${j.at.join(", ")}]</p>` +
        choice("Solder dot", "junctionConnected", [["true", "Present - connected"], ["false", "Absent - paths stay separate"]]) +
        "";
      values.junctionConnected = String(D.junctionConnected(doc, selectedJunction));
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
    if (!pendingLabel && (wires.length || els.length)) {
      const levels = new Set([...wires, ...els].map((x) => x.level ?? ""));
      const one = levels.size === 1 ? [...levels][0] : null;
      const what = els.length && wires.length ? "wires and elements" : els.length ? "elements" : "wires";
      const baseHtml = html;
      const netHtml = wires.length
        ? field("Net label", "wireNet", 'title="Signal name used by the timing diagram."')
        : "";
      const levelTitle = wires.some((wire) => doc.groups?.logic_generated_levels?.[wire.id] === wire.level)
        ? 'title="This gate-driven level is calculated from its input levels."'
        : "";
      const levelHtml = `<p class="fe-level" data-text="levelText"></p>${choice("Logic level", "level", levelOpts(), levelTitle)}`;
      let restHtml = "";
      key += "|level";
      const tagStyles = [...wires, ...els].map((item) => levelTagStyleOf(doc, item.id));
      const tagSides = new Set(tagStyles.map((style) => style.side ?? ""));
      const tagGaps = new Set(tagStyles.map((style) => style.gap ?? 0));
      restHtml += choice("Level tag position", "levelTagSide", [["", "automatic"], ["up", "above"], ["down", "below"], ["left", "left"], ["right", "right"]]) +
        field("Level tag offset (extra grid steps from its anchor)", "levelTagGap", 'type="number" min="-10" max="20" step="1"');
      values.levelTagSide = tagSides.size === 1 ? [...tagSides][0] : "";
      values.levelTagGap = tagGaps.size === 1 ? String([...tagGaps][0]) : "";
      if (wires.length) {
        const arrows = new Set(wires.map((w) => w.arrow ?? "none"));
        const buses = new Set(wires.map((w) => w.bus === undefined ? null : w.bus));
        const arrow = arrows.size === 1 ? [...arrows][0] : null;
        key += arrow === null ? "|mixed" : "";
        restHtml += choice("Net label position", "wireNetSide", [["", "automatic (above or right)"], ["up", "above"], ["down", "below"], ["left", "left"], ["right", "right"]]) +
          field("Net label offset", "wireNetGap", 'title="Extra grid steps away from the wire."') +
          choice("Arrowheads", "wireArrow", [...(arrow === null ? [["", "mixed (pick one)", true]] : []), ["none", "none"], ["end", "at the end"], ["start", "at the start"], ["both", "at both ends"]]) +
          `<label class="form-check"><input class="form-check-input" type="checkbox" data-field="wireBusEnabled" title="Show a bus slash, even when the bus label is blank."> <span class="form-check-label">Bus</span></label>` +
          field("Bus label (optional)", "wireBus", 'title="Leave blank to show the bus slash without a visible label."');
        values.wireBusEnabled = new Set(wires.map((w) => w.bus === undefined)).size > 1
          ? "mixed"
          : wires.every((w) => w.bus !== undefined);
        values.wireArrow = arrow ?? "";
        const nets = new Set(wires.map((w) => wireLabelOf(doc, w.id)));
        values.wireNet = nets.size === 1 ? [...nets][0] : "";
        const sides = new Set(wires.map((w) => wireLabelStyleOf(doc, w.id).side ?? "")), gaps = new Set(wires.map((w) => wireLabelStyleOf(doc, w.id).gap ?? 0));
        values.wireNetSide = sides.size === 1 ? [...sides][0] : "";
        values.wireNetGap = sides.size === 1 && gaps.size === 1 ? String([...gaps][0]) : "";
        values.wireBus = buses.size === 1 ? [...buses][0] ?? "" : "";
      }
      html = wires.length
        ? `${netHtml}${levelHtml}${baseHtml}${restHtml}`
        : `${levelHtml}${baseHtml}${restHtml}`;
      const name = LEVELS.find((l) => l.value === one);
      text.levelText = one === null ? "Level: mixed" : one === "" ? "Level: none (default colour)" : `Level: ${one} (${name.name}) on the selected ${what}`;
      values.level = one ?? "";
    }
    return { key, html, text, values };
  }

  let panelKey = null;
  function renderProps() {
    const m = propsModel();
    if (m.key !== panelKey) {
      propsEl.innerHTML = m.html;
      if (selection.elements.length) selectionPane.open = true;
      panelKey = m.key;
    }
    for (const el of propsEl.querySelectorAll("[data-text]")) el.textContent = m.text[el.dataset.text] ?? "";
    for (const el of propsEl.querySelectorAll("[data-field]")) {
      if (el === document.activeElement || !(el.dataset.field in m.values)) continue;
      if (el.type === "checkbox") {
        el.checked = m.values[el.dataset.field] === true;
        el.indeterminate = m.values[el.dataset.field] === "mixed";
      } else el.value = m.values[el.dataset.field];
    }
  }

  // The net label shows as you type (the other fields wait for Enter or leaving the field).
  propsEl.addEventListener("input", (e) => {
    if (e.target.dataset?.field !== "wireNet" || !selection.wires.length) return;
    commit(setWireLabels(doc, selection.wires, e.target.value.trim()), null);
  });

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
      } else if (name === "junctionConnected") {
        const connected = v === "true";
        commit(D.setJunctionConnected(doc, selectedJunction, connected), connected ? "Solder dot added: the junction is connected." : "Solder dot removed: the crossing paths are separate.");
      } else if (name === "wireNetSide" || name === "wireNetGap") {
        commit(setWireLabelStyle(doc, selection.wires, name === "wireNetSide" ? { side: v } : { gap: v }), "Net label placement changed.");
      } else if (name === "levelTagSide" || name === "levelTagGap") {
        const ids = [...selection.wires, ...selection.elements];
        commit(setLevelTagStyle(doc, ids, name === "levelTagSide" ? { side: v } : { gap: v }), "Level tag placement changed.");
      } else if (name === "wireNet") {
        commit(setWireLabels(doc, selection.wires, v.trim()), v.trim() ? `Net label ${v.trim()} set.` : "Net label cleared.");
      } else if (name === "level") {
        setLevel(v === "" ? null : v);
      } else if (name === "wireArrow") {
        if (v) commit(D.setWireStyle(doc, selection.wires, { arrow: v }), v === "none" ? "Arrowheads removed." : "Arrowheads set.");
      } else if (name === "wireBus") {
        const enabled = propsEl.querySelector('[data-field="wireBusEnabled"]')?.checked;
        const label = v.trim();
        commit(D.setWireStyle(doc, selection.wires, { bus: enabled || label ? label : null }), enabled || label ? "Bus mark set." : "Bus mark removed.");
      } else if (name === "wireBusEnabled") {
        const label = propsEl.querySelector('[data-field="wireBus"]')?.value.trim() ?? "";
        commit(D.setWireStyle(doc, selection.wires, { bus: e.target.checked ? label : null }), e.target.checked ? "Bus mark set." : "Bus mark removed.");
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
  /** The timing pane follows the circuit immediately: its node buttons and frames update after each edit. */
  function internalNodesForWires(wireIds) {
    const selected = new Set(wireIds), nets = D.deriveNets(doc, pack);
    return Object.entries(nets).filter(([, refs]) => D.wiresForRefs(doc, pack, refs).some((id) => selected.has(id))).map(([name]) => name);
  }
  function timingNodesForSelection() {
    const selectedWires = new Set(selection.wires), selectedPorts = new Set(selection.ports);
    if (!selectedWires.size && !selectedPorts.size) return [];
    const nets = D.deriveNets(doc, pack);
    const internalNames = Object.entries(nets).filter(([, refs]) =>
      refs.some((ref) => selectedPorts.has(ref)) || D.wiresForRefs(doc, pack, refs).some((id) => selectedWires.has(id)))
      .map(([name]) => name);
    const timingNames = (timingTool?.value.signal ?? []).filter((signal) => typeof signal?.name === "string" && signal.name)
      .filter((signal) => {
        const targets = targetsOf(doc, nets, signal.name, pack);
        return targets.wires.some((id) => selectedWires.has(id)) || targets.elements.some((id) => selectedPorts.has(id));
      }).map((signal) => signal.name);
    return timingNames.length ? timingNames : internalNames;
  }
  function syncTimingSelection() {
    timingTool?.setSelectedNodes(timingNodesForSelection());
  }
  function followTiming() {
    if (!timingTool) return;
    timingTool.setCircuit(D.serialize(doc, pack));
    timingTool.setFrame(selectedFrame > 0 ? selectedFrame - 1 : -1);
    syncTimingSelection();
  }

  function logicLevels(doc) {
    return JSON.stringify([...doc.wires, ...doc.elements].map((item) => [item.id, item.level ?? null]));
  }
  function changed(msg, previous = doc, { preserveLevels = false } = {}) {
    emit("change", { format: "circuit" });
    if (!preserveLevels) doc = ensureFrameZero(resolveLogic(doc, pack));
    refreshTruthPortList();
    if (previous.id !== doc.id) truthTableProjectChanged();
    if (!preserveLevels && selectedFrame > 0 && logicLevels(previous) !== logicLevels(doc)) syncCircuitLevelsToTiming(selectedFrame - 1);
    followTiming();
    applyBackdrop();
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
    if (selectedJunction && (!doc.junctions.some((j) => j.id === selectedJunction) || !junctionIsFourWay(selectedJunction))) selectedJunction = null;
  }

  /** Make `next` the document, recorded as one undo step. */
  function commit(next, msg, { preserveLevels = false } = {}) {
    next = ensureFrameZero(preserveLevels ? next : resolveLogic(next, pack));
    if (JSON.stringify(next) === JSON.stringify(doc)) return false;
    const previous = doc;
    history.record(doc);
    doc = next;
    prune();
    changed(msg, previous, { preserveLevels });
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
    const wires = D.levelWireIds(doc, selection.wires, pack);
    const n = wires.length + selection.elements.length;
    const noun = selection.elements.length ? "item" : "wire";
    const driven = drivenWireIds(doc, pack), overridesOutput = wires.some((id) => driven.has(id));
    let next = setPortLevelsForWires(D.setLevel(doc, selection.wires, level, selection.elements, pack), wires, level);
    // A level set by hand on a driven net is recorded for the simulator (scenario initial or force, F24), not evaluated here.
    if (overridesOutput && selectedFrame >= 0) next = setHandLevel(next, pack, wires.filter((id) => driven.has(id)), selectedFrame, level || null);
    if (selectedFrame >= 0) next = recaptureFrame(next, selectedFrame, [...wires, ...selection.elements, ...next.ports.filter((port) => D.wiresForRefs(next, pack, [port.id]).some((id) => wires.includes(id))).map((port) => port.id)]);
    const message = level ? `Level ${level} (${name}) set on ${count(n, noun)}.` : "Level cleared.";
    commit(next, selectedFrame > 0 && logicModeOf(doc) === "calculated" ? `${message} Recalculate timing to update computed levels.` : message, { preserveLevels: overridesOutput }   /* an input recalculates what it drives (and changed() syncs a timing frame's new values to its step); an output set by hand is a manual override and is kept */);
    if (selectedFrame > 0 && level) syncEditedNodeToTiming(wires, [], level, selection.elements);
  }

  function setPortLevelsForWires(next, wires, level, extraPorts = []) {
    const portIds = new Set(extraPorts);
    for (const port of next.ports) if (D.wiresForRefs(next, pack, [port.id]).some((id) => wires.includes(id))) portIds.add(port.id);
    const groups = { ...(next.groups ?? {}) }, levels = { ...(groups.port_levels ?? {}) };
    for (const id of portIds) { if (level) levels[id] = level; else delete levels[id]; }
    if (Object.keys(levels).length) groups.port_levels = levels; else delete groups.port_levels;
    next.groups = groups;
    return next;
  }

  function syncEditedNodeToTiming(wires, ports, level, elements = []) {
    if (!timingTool) return;
    const nets = D.deriveNets(doc, pack), updates = {};
    for (const signal of timingTool.value.signal) {
      if (!signal?.name) continue;
      const target = targetsOf(doc, nets, signal.name, pack);
      if (target.wires.some((id) => wires.includes(id)) || target.ports.some((id) => ports.includes(id)) || target.elements.some((id) => elements.includes(id))) updates[signal.name] = level;
    }
    if (Object.keys(updates).length) timingTool.setSignalLevels(selectedFrame - 1, updates);
  }

  function nodeLevelRows() {
    const rows = [], nets = D.deriveNets(doc, pack), seen = new Set();
    for (const port of doc.ports) {
      const wires = D.levelWireIds(doc, D.wiresForRefs(doc, pack, [port.id]), pack);
      rows.push({ name: port.label || port.id, wires, ports: [port.id] });
    }
    const named = [], unnamed = [];
    for (const wire of doc.wires) {
      if (seen.has(wire.id)) continue;
      const wires = D.levelWireIds(doc, [wire.id], pack);
      wires.forEach((id) => seen.add(id));
      const label = wires.map((id) => wireLabelOf(doc, id)).find(Boolean);
      const name = label || Object.entries(nets).find(([, refs]) => D.wiresForRefs(doc, pack, refs).some((id) => wires.includes(id)))?.[0] || `Unconnected ${wire.id}`;
      (label ? named : unnamed).push({ name, wires, ports: [] });
    }
    return [...rows, ...named, ...unnamed];
  }

  function renderNodeLevels() {
    if (!$(".fe-node-levels").open) return;
    const list = $(".fe-node-level-list");
    const rows = nodeLevelRows();
    list.innerHTML = rows.length ? rows.map((row, i) => {
      const values = [...new Set([...row.wires.map((id) => doc.wires.find((w) => w.id === id)?.level), ...row.ports.map((id) => doc.groups?.port_levels?.[id])].filter(Boolean))];
      const value = values.length === 1 ? values[0] : "";
      return `<label class="fe-node-level"><span data-node-name="${esc(row.name)}">${esc(row.name)}</span><select class="form-select form-select-sm" data-node-level="${i}" aria-label="Level for ${esc(row.name)}">${[["", "Unset"], ["0", "0"], ["1", "1"], ["X", "X"], ["Z", "Z"]].map(([v, label]) => `<option value="${v}"${v === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>`;
    }).join("") : `<p class="fe-hint">Add a port or wire to set its level.</p>`;
    const names = [...list.querySelectorAll("[data-node-name]")].map((el) => {
      try { return [el, texOf(el.dataset.nodeName)]; } catch { return [el, null]; }
    });
    typesetAll(names.map(([, tex]) => tex).filter(Boolean), typeset).then(() => {
      for (const [el, tex] of names) {
        const ts = tex && typeset.get(tex);
        if (!el.isConnected || !ts?.ok) continue;
        el.innerHTML = `<svg role="img" aria-label="${esc(el.dataset.nodeName)}" viewBox="${ts.left * 1000} ${-ts.height * 1000} ${ts.width * 1000} ${(ts.height + ts.depth) * 1000}" width="${ts.width}em" height="${ts.height + ts.depth}em"><g color="currentColor">${statusNodesMarkup(ts.nodes)}</g></svg>`;
      }
    }).catch((error) => status(`Could not typeset node names: ${error.message}`, true));
  }
  $(".fe-node-levels").addEventListener("toggle", renderNodeLevels);
  $(".fe-node-level-list").addEventListener("change", (event) => {
    const select = event.target.closest("[data-node-level]");
    if (!select) return;
    const row = nodeLevelRows()[Number(select.dataset.nodeLevel)];
    if (!row) return status("The node is no longer available.", true);
    const level = select.value || null;
    let next = setPortLevelsForWires(D.setLevel(doc, row.wires, level, [], pack), row.wires, level, row.ports);
    if (selectedFrame >= 0) next = recaptureFrame(next, selectedFrame, [...row.wires, ...row.ports]);
    const message = `${row.name}: ${level ?? "unset"} in Frame ${selectedFrame}.`;
    commit(next, selectedFrame > 0 && logicModeOf(doc) === "calculated" ? `${message} Recalculate timing to update computed levels.` : message, { preserveLevels: true });
    if (selectedFrame > 0 && level) syncEditedNodeToTiming(row.wires, row.ports, level);
  });

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

  function wireTarget(p, e = {}) {
    const h = targets(p).find((x) => ["pin", "junction", "port", "wire"].includes(x.kind) && !x.textOnly && (x.kind !== "wire" || x.tap));
    if (h) return h.kind === "pin" ? { kind: "pin", ref: h.ref, at: h.at } : h.kind === "wire" ? { kind: "wire", id: h.id, at: h.at } : { kind: h.kind, id: h.id, at: h.at };
    let at = snapStep(p);
    if (wiring && !e.shiftKey) {
      const last = wiring.via.at(-1) ?? wiring.fromAt;
      at = Math.abs(at[0] - last[0]) >= Math.abs(at[1] - last[1]) ? [at[0], last[1]] : [last[0], at[1]];
    } else if (wiring && !e.altKey) {
      // A straight leg snaps to 45 degrees (annotations snap_degrees, editor data, can change it); Alt gives any angle.
      const snap = Number(doc.groups?.snap_degrees ?? 45);
      at = snapAngle(wiring.via.at(-1) ?? wiring.fromAt, at, snap);
    }
    return { kind: "point", at };
  }

  function wireClick(p, e) {
    const t = wireTarget(p, e);
    if (!wiring) {
      wiring = { from: t, fromAt: t.at, via: [], routes: [] };
      status("Wire: click to add orthogonal corners; hold Shift while clicking for a straight leg (45-degree steps; Shift+Alt for any angle). Click a pin, junction or wire to finish; click twice or press Enter to end here; Esc cancels.");
      updateRubber(p, e);
      return;
    }
    if (t.kind === "point") {
      if (same(t.at, wiring.via.at(-1) ?? wiring.fromAt)) return finishWire(t, e);
      wiring.via.push(t.at);
      wiring.routes.push(e.shiftKey ? "straight" : "auto");
      updateRubber(p, e);
      return;
    }
    finishWire(t, e);
  }

  function finishWire(t, e = {}) {
    try {
      const via = [...wiring.via], routes = [...wiring.routes];
      if (t.kind === "point" && via.length && same(t.at, via.at(-1))) via.pop();
      else routes.push(e.shiftKey ? "straight" : "auto");
      const r = D.addWire(doc, pack, wiring.from, t, via, routes);
      if (r.id) commit(r.doc, `Added wire ${r.id}.`);
      else status("A wire needs some length.");
    } catch (e) {
      status(`Could not add the wire: ${e.message}`);
    }
    wiring = null; rubber = null;
    render();
  }

  function updateRubber(p, mods = {}) {
    if (!wiring) { rubber = null; return; }
    const shiftKey = !!mods.shiftKey;
    const t = wireTarget(p, { shiftKey, altKey: !!mods.altKey });
    rubber = route(endFor(wiring.from), endFor(t), wiring.via, null, [...wiring.routes, shiftKey ? "straight" : "auto"]);
    hover = t.kind !== "point" ? t.at : null;
    render();
  }

  function portClick(p) {
    const hits = targets(p);
    const wire = hits.find((hit) => hit.kind === "wire" && hit.tap);
    const at = wire ? wire.at : snapPoint(p);
    const side = D.exitSide(doc, pack, at);
    const dir = side === "right" ? "out" : "in";
    const nets = D.deriveNets(doc, pack);
    const netName = wire && Object.entries(nets).find(([, refs]) => D.wiresForRefs(doc, pack, refs).includes(wire.id))?.[0];
    const connectedWires = wire ? D.connectedWireIds(doc, pack, [wire.id]) : [];
    const label = connectedWires.map((id) => wireLabelOf(doc, id)).find(Boolean) ?? netName;
    const r = D.addPort(doc, pack, at, dir, wire?.id ?? null);
    const named = D.setPort(r.doc, pack, r.id, { side: side ?? (dir === "in" ? "left" : "right"), ...(label ? { label } : {}) });
    commit(named, `Placed port ${r.id}${label ? ` on net ${label}` : ""}.`);
    selection = { ...none(), ports: [r.id] };
    selectionPane.open = true;
    setTool("select");
    propsEl.querySelector('[data-field="portLabel"]')?.focus();
  }

  function labelClick(p) {
    const hit = targets(p).find((target) => ["wire", "element", "port"].includes(target.kind));
    if (hit) {
      selection = { ...none(), [hit.kind === "wire" ? "wires" : hit.kind === "port" ? "ports" : "elements"]: [hit.id] };
      selectionPane.open = true;
      panelKey = null;
      setTool("select");
      const field = hit.kind === "wire" ? "wireNet" : hit.kind === "port" ? "portLabel" : "elLabel";
      propsEl.querySelector(`[data-field="${field}"]`)?.focus();
      status(`Type the ${hit.kind === "wire" ? "net" : hit.kind} label in the panel.`);
      return;
    }
    const at = snapPoint(p);
    pendingLabel = { at, side: D.exitSide(doc, pack, at) };
    selection = none();
    selectionPane.open = true;
    panelKey = null;
    render();
    propsEl.querySelector('[data-field="pendingText"]')?.focus();
    status("Type the label in the panel and press Enter.");
  }

  function solderClick(p) {
    const hits = targets(p);
    const junction = hits.find((hit) => hit.kind === "junction" && junctionIsFourWay(hit.id));
    if (junction && !D.junctionConnected(doc, junction.id)) {
      commit(D.setJunctionConnected(doc, junction.id, true), "Solder dot added: the junction is connected.");
      return;
    }
    const at = snapStep(p);
    const ids = hits.filter((hit) => hit.kind === "wire" && hit.tap && same(hit.at, at)).map((hit) => hit.id);
    try { commit(D.connectWiresAt(doc, pack, at, ids), "Solder dot added: crossing wires are connected."); }
    catch (error) { status(error.message, true); }
  }

  // ---- commands ----------------------------------------------------------------------------
  const commands = {
    select: () => { setTool("select"); status("Select: click or drag a box; drag to move."); },
    wire: () => { setTool("wire"); status("Wire: click a pin, junction, wire or empty grid point to start; hold Shift for a straight leg at 45-degree steps, Shift+Alt for any angle."); },
    port: () => { setTool("port"); status("Port: click a point, a pin tip or a wire end."); },
    label: () => { setTool("label"); status("Label: click where the label goes."); },
    solder: () => { setTool("solder"); status("Solder dot: click the crossing to connect its wires."); },
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
    undo() { const prev = history.undo(doc); if (prev) { const current = doc; doc = prev; prune(); changed("Undone.", current); } },
    redo() { const next = history.redo(doc); if (next) { const current = doc; doc = next; prune(); changed("Redone.", current); } },
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
    fit: () => {
      if (opt.view === "timing") {
        if (timingTool) timingTool.fit(); else fitTimingWhenReady = true;
      } else view.fit(lastDrawing?.box ?? null);
    },
    new() {   // clears the figure and the Timing Diagram together (the figure can be brought back with Undo; the diagram cannot)
      if (timingTool) timingTool.clear(); else { store.remove(TIMING_SOURCE); store.remove(TIMING_SEND); }
      selectedFrame = 0;
      commit(D.newDoc(), "New: the figure and the timing diagram are cleared (Undo brings the figure back)."); selection = none(); loadWarnings = []; view.fit(null); render(); },
    open: () => fileInput.click(),
    /** F22.1b: paste or open SystemVerilog, import it in a Worker, replace the figure after a confirm (one Undo). */
    importsv: () => { svPanel ??= createSvPanel({ root, buttonClass: BUTTON, replace: (text) => load(text, true) }); svPanel.open(); },
    save() {
      const text = D.serialize(doc, pack);
      download(text, `${doc.id}.json`, "application/json");
      unsaved = false;   // the file has been handed to the browser; the saved-list copy below is only a backup
      let saves = [];
      try { saves = JSON.parse(store.get(SAVES) ?? "[]"); } catch { saves = []; }
      saves.unshift({ id: doc.id, saved: new Date().toISOString(), text });
      store.set(SAVES, JSON.stringify(saves.slice(0, 20)));
      status(`Saved ${doc.id}.json.`);
    },
    async export(format) {
      if (!format) return showExportChoices("view");
      if (format !== "svg" && format !== "png") return status("Choose SVG or PNG.", true);
      if (opt.view === "timing") {
        if (!timingTool) await mountTiming();
        return format === "svg" ? timingTool.exportSvg() : timingTool.exportPng();
      }
      try {
        const includeBackdrop = askBackdrop();
        const slide = opt.view === "slide", text = slide ? await slideNow({ includeBackdrop }) : await svgNow(false, doc, includeBackdrop);
        const name = `${doc.id}${slide ? "-slide" : ""}.${format}`;
        if (format === "svg") download(text, name, "image/svg+xml");
        else download(await pngOf(text), name, "image/png");
        status(`Exported ${name}.`);
      } catch (e) { status(e.message, true); }
    },
    async projectzip() {
      try {
        if (!timingTool) await mountTiming();
        const includeBackdrop = askBackdrop();
        const schematicJson = D.serialize(exportDocument(doc, includeBackdrop), pack);
        const schematicSvg = await svgNow(false, doc, includeBackdrop);
        const timing = await timingTool.exportAssets();
        const truthTable = truthTableSnapshot();
        const projectJson = `${JSON.stringify({
          schema: "figure-editor-project/1",
          schematic: JSON.parse(schematicJson),
          timing: JSON.parse(timing.source),
          ...(truthTable ? { truthTable } : {}),
        }, null, 2)}\n`;
        const files = [
          { name: "schematic.png", data: await pngOf(schematicSvg) },
          { name: "schematic.svg", data: schematicSvg },
          { name: "schematic.json", data: schematicJson },
          { name: "timing-diagram.png", data: timing.png },
          { name: "timing-diagram.svg", data: timing.svg },
          { name: "timing-diagram.json", data: timing.source },
        ];
        if (truthTable) {
          files.push({ name: "truth-table.csv", data: truthTable.csv });
          if (truthTable.latex) files.push({ name: "truth-table.tex", data: truthTable.latex });
        }
        files.push({ name: "source.json", data: projectJson });
        if (!PARTS.zip) throw new Error("ZIP export is part of the Figure Editor.");
        const zip = await zipStore(files);
        download(new Blob([zip], { type: "application/zip" }), `${doc.id}-project.zip`, "application/zip");
        status(`Exported ${doc.id}-project.zip with ${files.length} project files.`);
      } catch (error) { status(`Project ZIP failed: ${error.message}`, true); }
    },
    viewfigure: () => setView("figure"),
    viewtiming: () => setView("timing"),
    viewslide: () => setView("slide"),
    navframes() {
      if (!framesOf(doc).length) { status("No frames yet.", true); return; }
      framesWhat.value = opt.view === "timing" ? "timing" : opt.view === "slide" ? "slide" : "schematic";
      return commands.framesexport();
    },
    frameprev: () => stepFrame(-1),
    framenext: () => stepFrame(1),
    splitsreset() { const s = currentSlide(); if (s.layout in SLIDE_LAYOUTS) setSlide(withLayout(s, s.layout, { reset: true }), "Dividers back to the layout's defaults."); },
    addschematic: () => addRegion("schematic"),
    addtiming: () => addRegion("timing"),
    addtext: () => addRegion("text"),
    levelsreset() { commit(D.setStyleLevels(doc, {}), "Level colours are back to the theme's defaults."); },
    framesfromtiming() { populateFromTiming(); },
    framecapture() {
      commit(captureFrame(doc), null);
      const frames = framesOf(doc);
      selectedFrame = frames.length - 1;
      status(`Captured "${frames[selectedFrame].name}" (frame ${selectedFrame}) from the current levels.`);
      renderFrames();
    },
    framerecapture() {
      if (!frameSelected() || selectedFrame === 0) return;
      commit(recaptureFrame(doc, selectedFrame), `Frame "${framesOf(doc)[selectedFrame].name}" now holds the current levels.`);
    },
    async frametosignal() {
      if (selectedFrame === 0) { status("Frame 0 is the initial state, not a timing step."); return; }
      if (!timingTool) await mountTiming();
      let step = selectedFrame > 0 ? selectedFrame - 1 : null;
      if (step === null) {
        const answer = window.prompt("Timing step to receive the current schematic levels (1–64):", "1");
        if (answer === null) return;
        const destination = Number(answer);
        if (!Number.isInteger(destination) || destination < 1 || destination > 64) { status("Enter a timing step from 1 to 64.", true); return; }
        step = destination - 1;
      }
      const result = timingTool.setSignalLevels(step, circuitLevelsForTiming());
      if (!result.updated) { status(result.error ?? "No matching timing signals to update.", true); return; }
      populateFromTiming({ auto: true, quiet: true });
      timingTool.setFrame(step);
      status(`Sent the current schematic levels to timing step ${step + 1}.`);
    },
    framerename() {
      if (!frameSelected() || selectedFrame === 0) return;
      const name = window.prompt("Name of this frame", framesOf(doc)[selectedFrame].name);
      if (name && name.trim()) commit(renameFrame(doc, selectedFrame, name), `Renamed to "${name.trim()}".`);
    },
    frameup() { if (selectedFrame > 1) moveSelected(-1); },
    framedown() { if (selectedFrame > 0) moveSelected(1); },
    framedelete() {
      if (!frameSelected() || selectedFrame === 0) return;
      commit(removeFrame(doc, selectedFrame), "Frame deleted.");
      selectedFrame = Math.min(selectedFrame, framesOf(doc).length - 1);
      renderFrames();
    },
    async framesexport(format) {
      if (!format) return showExportChoices("frames");
      if (format !== "svg" && format !== "png") return status("Choose SVG or PNG.", true);
      const frames = framesOf(doc);
      if (!frames.length) { status("There are no frames yet.", true); return; }
      const what = framesWhat.value;
      try {
        const includeBackdrop = what !== "timing" && askBackdrop();
        if (what === "timing" && !timingTool) await mountTiming();
        for (const [i, f] of frames.entries()) {
          const at = applyFrame(doc, f), nn = numbered(i, frames.length), name = `${doc.id}-${nn}`;
          if (what === "timing") {
            await timingTool.exportFrame(i - 1, format, `${name}-timing.${format}`);
          } else {
            const keepSel = selectedFrame; selectedFrame = i;
            let text;
            try { text = what === "slide" ? await slideNow({ frame: i, includeBackdrop }) : await svgNow(false, at, includeBackdrop); }
            finally { selectedFrame = keepSel; }
            const content = format === "svg" ? text : await pngOf(text);
            download(content, `${name}.${format}`, format === "svg" ? "image/svg+xml" : "image/png");
          }
          await new Promise((r) => setTimeout(r, 200));   // so the browser takes every download
        }
        status(`Exported ${frames.length} ${what === "timing" ? "timing diagrams" : what === "slide" ? "slides" : "schematics"} as ${format.toUpperCase()}.`);
      } catch (e) { status(e.message, true); }
    },
    async framesslide() {
      const frames = framesOf(doc);
      if (!frames.length) { status("There are no frames yet: set the levels and press Capture frame."); return; }
      try {
        const text = await gridNow(frames, askBackdrop());
        download(text, `${doc.id}-all-frames.svg`, "image/svg+xml");
        download(await pngOf(text), `${doc.id}-all-frames.png`, "image/png");
        status(`Exported ${doc.id}-all-frames: ${frames.length} frames on one slide, SVG and PNG.`);
      } catch (e) { status(e.message, true); }
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
  exportDialog.addEventListener("click", (e) => {
    const option = e.target.closest("[data-export-format]");
    if (!option) return;
    const kind = pendingExport;
    pendingExport = null;
    exportDialog.close();
    if (kind === "frames") commands.framesexport(option.dataset.exportFormat);
    else if (kind === "view") commands.export(option.dataset.exportFormat);
  });
  exportDialog.addEventListener("close", () => { pendingExport = null; });

  /** What a timing region draws: the diagram the timing tool sent, in the given pack's roles, the marked step and the net colours as the options say. */
  const timingNameTex = (name) => { try { return texOf(name); } catch { return null; } };
  function timingFor(pk, step = selectedFrame) {
    if (!PARTS.timing) return null;
    try {
      const sent = JSON.parse(store.get(TIMING_SEND) ?? "null");
      if (!sent?.source) return null;
      const r = pk.theme.roles, lc = (l) => pk.levelColour(l) ?? r.ink;
      const names = new Set(), collect = (items) => {
        for (const item of items ?? []) {
          if (Array.isArray(item)) collect(typeof item[0] === "string" ? item.slice(1) : item);
          else if (typeof item?.name === "string" && item.name) names.add(item.name);
        }
      };
      collect(sent.source.signal);
      for (const raw of sent.source.edge ?? []) {
        const label = parseEdge(raw)?.label;
        if (label) names.add(label);
      }
      const nameTypeset = new Map([...names].map((name) => [name, timingNameTex(name)]).filter(([, tex]) => tex).map(([name, tex]) => [name, typeset.get(tex)]).filter(([, parsed]) => parsed));
      return {
        source: sent.source, ink: r.ink, accent: r.accent, paper: r.background,
        dataFills: [lc("1"), lc("0"), r.accent, lc("X"), lc("Z"), r.muted ?? r.ink, r.ink],
        levelFills: { unknown: r.unknown, floating: r.floating },
        signalLineColour: sent.source.config?.signalLineColour ?? r.ink,
        marker: opt.timingMarker && step > 0 ? step - 1 : null,
        levelColour: opt.timingColour ? (l) => pk.levelColour(l) ?? null : null,
        fontSize: textSizeOf(sent.source),
        signalNameSize: signalNameSizeOf(sent.source),
        arrowLabelSize: arrowLabelSizeOf(sent.source),
        lineWidth: lineWidthOf(sent.source),
        showNames: sent.source.config?.showNames !== false,
        nameTypeset, edgeLabelTypeset: nameTypeset,
      };
    } catch { return null; }
  }

  /** The schematic alone as the export options say; labels are typeset first. Throws if one cannot be drawn. */
  async function svgNow(_unused = false, at = doc, includeBackdrop = false) {
    await typesetAll(texNeeded(at, pack, { levelTags: opt.levelTags }), typeset);
    return exportSvg(at, packFor(opt.exportDark), { ...drawOpts(), includeBackdrop });   // light by default; dark only if asked
  }

  /** The slide (or one region of it, `only`) as an SVG file, in the export theme. `frame`: draw at that frame's levels, with its step marked. */
  async function slideNow({ only = null, frame = null, includeBackdrop = false } = {}) {
    const pk = packFor(opt.exportDark), s = currentSlide();
    const frames = framesOf(doc);
    const docs = [doc, ...frames.map((f) => applyFrame(doc, f))];
    const timing = timingFor(pk, frame ?? selectedFrame);
    const timingTex = [];
    if (timing) {
      const collect = (items) => { for (const item of items ?? []) {
        if (Array.isArray(item)) collect(typeof item[0] === "string" ? item.slice(1) : item);
        else if (typeof item?.name === "string" && item.name) { const tex = timingNameTex(item.name); if (tex) timingTex.push(tex); }
      } };
      collect(timing.source.signal);
      for (const raw of timing.source.edge ?? []) {
        const label = parseEdge(raw)?.label, tex = label && timingNameTex(label);
        if (tex) timingTex.push(tex);
      }
    }
    await typesetAll([...new Set([...docs.flatMap((d) => texNeeded(d, pk, { levelTags: opt.levelTags })), ...timingTex])], typeset);
    return slideSvg(doc, pk, s, { ...drawOpts(), only, frame, includeBackdrop, timing: timingFor(pk, frame ?? selectedFrame) });
  }

  const DPI = 300, MAX_PIXELS = 16000;

  /** The figure as a PNG at 300 dpi at its exported size (scale option included), on a transparent background. */
  async function pngNow() { return pngOf(await svgNow()); }

  async function pngOf(text) {
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


  // ---- level frames (F11.2) ---------------------------------------------------------------------------
  const frameSelected = () => { if (framesOf(doc)[selectedFrame]) return true; status("Select a frame in the list first."); return false; };
  function moveSelected(by) {
    if (!frameSelected() || selectedFrame === 0) return;
    const n = framesOf(doc).length, j = selectedFrame + by;
    if (j < 0 || j >= n) return;
    commit(moveFrame(doc, selectedFrame, by), null);
    selectedFrame = j;
    renderFrames();
  }
  function renderFrames() {
    const frames = framesOf(doc);
    if (selectedFrame >= frames.length) selectedFrame = frames.length - 1;
    const stepNo = $(".fe-stepno"); if (stepNo) stepNo.textContent = frames.length ? `/ ${frames.length - 1}` : "no frames";
    const stepIn = $(".fe-stepinput");
    if (stepIn) { stepIn.min = "0"; stepIn.max = String(Math.max(0, frames.length - 1)); stepIn.disabled = !frames.length;
    if (document.activeElement !== stepIn) stepIn.value = selectedFrame >= 0 ? String(selectedFrame) : ""; }
    { const b = $(`[data-cmd="frameprev"]`); if (b) b.disabled = selectedFrame <= 0; }
    { const b = $(`[data-cmd="framenext"]`); if (b) b.disabled = !frames.length || selectedFrame >= frames.length - 1; }
    { const b = $(`[data-cmd="navframes"]`); if (b) b.disabled = !frames.length; }
    { const b = $(`[data-cmd="framerecapture"]`); if (b) b.disabled = selectedFrame <= 0; }
    for (const c of ["framerename", "framedelete"]) { const b = $(`[data-cmd="${c}"]`); if (b) b.disabled = selectedFrame <= 0; }
    { const b = $(`[data-cmd="frameup"]`); if (b) b.disabled = selectedFrame <= 1; }
    { const b = $(`[data-cmd="framedown"]`); if (b) b.disabled = selectedFrame <= 0 || selectedFrame >= frames.length - 1; }
    const ol = $(".fe-frame-list");
    ol.innerHTML = frames.length ? frames.map((f, i) => `<li><button type="button" class="fe-frame-item${i === selectedFrame ? " is-selected" : ""}" data-frame="${i}" aria-pressed="${i === selectedFrame}">${numbered(i, frames.length)} ${esc(f.name)}</button></li>`).join("") : `<li class="fe-hint">No frames yet.</li>`;
  }
  $(".fe-frame-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-frame]");
    if (!b) return;
    selectedFrame = +b.dataset.frame;
    render();
    const f = framesOf(doc)[selectedFrame];
    const message = selectedFrame === 0 ? "Showing Frame 0: set initial levels on the canvas." : `Showing frame "${f.name}": its levels are on the canvas.`;
    commit(applyFrame(doc, f), message, { preserveLevels: true });
    timingTool?.setFrame(selectedFrame > 0 ? selectedFrame - 1 : -1);
    renderFrames();
  });

  // ---- frames from the timing diagram: one frame per step, levels from the signals that match wires, ports or elements ----
  function circuitLevelsForTiming() {
    let sent = null;
    try { sent = JSON.parse(store.get(TIMING_SEND) ?? "null"); } catch { sent = null; }
    if (!Array.isArray(sent?.signals)) return {};
    const nets = D.deriveNets(doc, pack), updates = {};
    for (const signal of sent.signals) {
      if (typeof signal?.name !== "string") continue;
      const targets = targetsOf(doc, nets, signal.name, pack);
      const levels = new Set([
        ...targets.wires.map((id) => doc.wires.find((wire) => wire.id === id)?.level),
        ...targets.elements.map((id) => doc.elements.find((element) => element.id === id)?.level),
      ].filter((level) => ["0", "1", "X", "Z"].includes(level)));
      if (levels.size) updates[signal.name] = levels.size === 1 ? [...levels][0] : "X";
    }
    return updates;
  }
  function syncCircuitLevelsToTiming(step) {
    if (!Number.isInteger(step) || step < 0) return;
    if (!timingTool) { pendingTimingSteps.add(step); return; }
    const result = timingTool.setSignalLevels(step, circuitLevelsForTiming());
    if (result.updated) status(`Updated timing step ${step + 1} from the schematic logic levels.`);
    else status(result.error ?? "No matching timing signals to update.", true);
  }
  function populateFromTiming({ auto = false, quiet = false, clearWhenEmpty = false } = {}) {
    if (!PARTS.timing) return;
    let sent = null;
    try { sent = JSON.parse(store.get(TIMING_SEND) ?? "null"); } catch { sent = null; }
    if (!sent?.signals?.length && !clearWhenEmpty) {
      if (!auto) status("Nothing sent yet: in the timing tool, press Send to schematic.");
      return;
    }
    const previousFrame = selectedFrame;
    const r = framesFromSignals(doc, D.deriveNets(doc, pack), sent?.signals ?? [], pack);
    // Automatic syncing never fills a figure from a diagram that names nothing in it (say a full-adder diagram and a lone block):
    // that would only add empty frames. Pressing Send, or a diagram that matches, still syncs.
    if (auto && (sent?.signals?.length ?? 0) > 0 && !r.matched.length) return;
    let synced = r.doc;
    if (auto) {   // frames captured past the diagram's last step stay until they are sent to timing; a resync must not wipe them
      const old = framesOf(doc), fresh = framesOf(synced);
      if (old.length > fresh.length) synced = { ...synced, groups: { ...(synced.groups ?? {}), frames: [...fresh, ...old.slice(fresh.length)] } };
    }
    const step = timingTool?.frame ?? -1;
    const last = framesOf(synced).length - 1;
    selectedFrame = step >= 0 ? Math.min(step + 1, last) : previousFrame < 0 ? -1 : Math.min(previousFrame, last);
    const frames = framesOf(synced);
    const next = selectedFrame >= 0 && frames[selectedFrame] ? applyFrame(synced, frames[selectedFrame]) : synced;
    commit(next, null, { preserveLevels: true });
    renderFrames();
    timingTool?.setFrame(selectedFrame > 0 ? selectedFrame - 1 : -1);
    if (!quiet) status(`Frame 0 and ${r.steps} timing steps are now synced. Drives: ${r.matched.join(", ") || "nothing"}.${r.unmatched.length ? ` No wire, port or element named: ${r.unmatched.join(", ")} (name a wire with its Net label).` : ""}`, !!r.steps && !r.matched.length);
  }
  function calculateTiming() {
    if (!timingTool) return status("Open the timing editor first.", true);
    if (logicModeOf(doc) !== "calculated") return status("Enable calculated logic levels before calculating timing.", true);
    const signals = timingTool.getSignals();
    if (!signals.length) return status("Add timing signals before calculating.", true);
    // Behaviour is circuit-model's simulator (simlevels.js). What it cannot calculate: a level that changes inside a step
    // (a fractional period or shift: each frame holds one level per step), and a calculated signal drawn with a period
    // or a shift (its calculated cells are its own wave characters).
    const inexact = signals.find((signal) => signal.exact === false);
    if (inexact) return status(`Cannot calculate with ${inexact.name}: with period ${inexact.period}, phase ${inexact.phase || 0} and delay ${inexact.delay || 0} its level changes inside a step, and a frame holds one level per step.`, true);
    const nets = D.deriveNets(doc, pack);
    // Timing-pane cells set by hand on a driven signal are forces in their frames (F24): record them from the frames.
    const synced = handLevelsFromFrames(framesFromSignals(doc, nets, signals, pack).doc, pack, 1);
    const driven = drivenWireIds(synced, pack);
    const shiftedOutput = signals.find((signal) => (signal.period !== 1 || signal.phase || signal.delay) && targetsOf(synced, nets, signal.name, pack).wires.some((id) => driven.has(id)));
    if (shiftedOutput) return status(`Cannot calculate ${shiftedOutput.name}: a calculated signal needs period 1 and zero phase and delay.`, true);
    const frames = framesOf(synced);
    let problem = null, results = [], forced = null;
    try {
      const levels = frames.map((frame) => ({ ...frame.levels }));   // inputs only count; hand-set driven levels are the scenario's (F24)
      const pulses = frames.slice(1).map((_, i) => signals.filter((signal) => signal.pulses[i]).flatMap((signal) => {
        const target = targetsOf(synced, nets, signal.name, pack);
        return [...target.wires, ...target.ports];
      }));
      const run = calculateSteps(synced, pack, levels, pulses);
      results = run.results; forced = run.forced;
      if (run.warnings.length) problem = `Feedback did not settle in ${run.warnings.length === 1 ? "one step" : `${run.warnings.length} steps`}; those outputs are X.`;
    } catch (error) {
      problem = `Calculation stopped: ${error.message}`;
    }
    if (results.length) {
      let next = setCalculatedFrames(synced, results, forced);
      const current = framesOf(next)[selectedFrame];
      if (current) next = applyFrame(next, current);
      commit(next, null, { preserveLevels: true });
      const rows = nodeLevelRows();
      const candidates = new Map(rows.filter((row) => !row.name.startsWith("Unconnected ")).map((row) => [row.name, [...row.wires, ...row.ports]]));
      for (const signal of signals) {
        const target = targetsOf(next, nets, signal.name, pack);
        candidates.set(signal.name, [...target.wires, ...target.ports]);
      }
      const updates = {};
      for (const [name, ids] of candidates) for (const [step, generated] of results.entries()) {
        const levels = [...new Set(ids.map((id) => generated[id]).filter(Boolean))];
        if (levels.length === 1) (updates[name] ??= {})[step] = levels[0];
      }
      if (Object.keys(updates).length) timingTool.setCalculatedLevels(updates);
      renderFrames();
    }
    status(problem ? `Calculated ${results.length} timing steps. ${problem}` : `Calculated ${results.length} timing steps.`, !!problem);
  }
  function selectTimingFrame(step) {
    if (!Number.isInteger(step) || step < 0) return;
    const index = step + 1, frame = framesOf(doc)[index];
    if (!frame) return;
    selectedFrame = index;
    commit(applyFrame(doc, frame), null, { preserveLevels: true });
    renderFrames();
  }
  window.addEventListener("storage", (e) => {
    if (e.key === TIMING_SEND) populateFromTiming({ auto: true, quiet: true, clearWhenEmpty: true });
  });

  /** One slide with every frame as a small figure, labelled with its name. */
  async function gridNow(frames, includeBackdrop = false) {
    const pk = packFor(opt.exportDark), size = slideSize(currentSlide().format);
    await typesetAll([...texNeeded(doc, pk, { levelTags: opt.levelTags }), ...frames.map((f) => frameTex(f.name))], typeset);
    return exportGridSvg(doc, pk, frames.map((f) => ({ name: f.name, doc: applyFrame(doc, f) })), size, { ...drawOpts(), includeBackdrop });
  }

  function download(content, name, type) {
    const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showExportChoices(kind) {
    pendingExport = kind;
    $("#fe-export-title").textContent = kind === "frames" ? "Export frames" : "Export current view";
    exportDialog.showModal();
  }

  /** Open a saved file. With `record`, it is an undo step; on start-up it is not. */
  function load(text, record = true) {
    const { doc: parsed, nets } = D.parse(text);
    const next = ensureFrameZero(resolveLogic(convertHandLevels(parsed, pack), pack));   // files from before F24: hand-set levels to scenario fields
    try { drawing(next, pack, { typeset }); D.lint(next, pack); } catch (e) { throw new Error(`the figure could not be drawn (${e.message})`); }   // a dry run: nothing changes if it fails
    loadWarnings = D.netsMatch(nets, D.deriveNets(next, pack)) ? [] :
      ["The file's nets did not match its drawing. Saving writes the nets the drawing makes."];
    if (record) { selectedFrame = 0; commit(next, `Opened ${next.id}.`); }
    else { doc = next; history.clear(); timingTool?.setCircuit(D.serialize(doc, pack)); }
    applyBackdrop();
    refreshTruthPortList();
    unsaved = false;   // what was just opened matches a file
    selection = none();
    selectedJunction = null;
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
    if (b) { if (pack.parametersOf(b.dataset.type).length) openFamily(b, b.dataset.type, e.detail === 0); else startPlacing(b.dataset.type, e.detail === 0); return; }
    const pre = e.target.closest("[data-preset]");
    const preset = pre && presetById(pre.dataset.preset);
    if (preset) startPlacing(BLOCK, e.detail === 0, structuredClone(preset.params));
  });
  // ---- the Timing Diagram section (F18): the same module as before, mounted once ----------------------------
  const tpBody = $(".fe-timing-body");
  async function mountTiming() {
    if (!PARTS.timing) return;
    if (timingTool) return;
    const { mount } = parts.timing;   // the Timing Diagram tool, lent by the composite
    timingTool = await mount(tpBody, {
      docked: true, betaFeatures: true, storageKey: TIMING_SOURCE, sendKey: TIMING_SEND, editorKey: AUTOSAVE,
      controlsRoot: $(".fe-timing-controls"),
      mergeConnectedNodes: true, allowTexSignalNames: true,
      typesetSignalNames: async (names) => {
        const texByName = new Map(names.map((name) => [name, texOf(name)]));
        await typesetAll([...new Set(texByName.values())], typeset);
        return new Map([...texByName].map(([name, tex]) => [name, typeset.get(tex)]));
      },
      texSignalName: (name) => texOf(name),
      onStatus: (m, err) => { if (opt.view === "timing") status(m, err); },
      onFrameChange: selectTimingFrame,
      onChange: () => {
        populateFromTiming({ auto: true, quiet: true, clearWhenEmpty: true });
        if (opt.slideView) syncSlide();
      },
    });
    const timingLogicInput = tpBody.querySelector("[data-logic-calculation]");
    timingLogicInput.checked = logicModeOf(doc) === "calculated";
    timingLogicInput.addEventListener("change", () => setCalculationMode(timingLogicInput.checked));
    tpBody.querySelector("[data-do=calculate-timing]").addEventListener("click", calculateTiming);
    timingTool.setCircuit(D.serialize(doc, pack));
    timingTool.setFrame(selectedFrame > 0 ? selectedFrame - 1 : -1);
    syncTimingSelection();
    if (refreshFramesWhenTimingReady) {
      refreshFramesWhenTimingReady = false;
      populateFromTiming({ auto: true, quiet: true });
    }
    for (const step of pendingTimingSteps) syncCircuitLevelsToTiming(step);
    pendingTimingSteps.clear();
    if (fitTimingWhenReady) { fitTimingWhenReady = false; timingTool.fit(); }
    setupTruthTable();
    if (opt.slideView) syncSlide();
  }

  function setupTruthTable() {
    const pane = tpBody.querySelector(".td-truth");
    if (!pane || pane.dataset.ready) return;
    pane.dataset.ready = "true";
    const inputNames = pane.querySelector("[data-truth-inputs]");
    const outputNames = pane.querySelector("[data-truth-outputs]");
    const tableInput = pane.querySelector("[data-truth-table]");
    const tableGrid = pane.querySelector("[data-truth-grid]");
    const tableMode = pane.querySelector("[data-truth-mode]");
    const latexOutput = pane.querySelector("[data-truth-latex]");
    const latexStatus = pane.querySelector("[data-truth-latex-status]");
    const portList = pane.querySelector("#td-truth-ports");
    const results = pane.querySelector(".td-truth-results");
    const parseNames = (input) => input.value.split(/[,\s;]+/).filter(Boolean);
    const storageKey = () => `${TRUTH_TABLE}:${encodeURIComponent(doc.id)}`;
    let lastDefaultHeader = "";
    let lastDefaultInputs = "";
    let lastDefaultOutputs = "";
    const refreshPorts = () => {
      const inputs = doc.ports.filter((port) => port.dir === "in").map((port) => port.id);
      const outputs = namedNetNames(doc).filter((name) => !inputs.includes(name));
      portList.innerHTML = namedNetNames(doc).map((name) => {
        const port = doc.ports.find((item) => item.id === name);
        const kind = port?.dir === "in" ? "Input" : port?.dir === "out" ? "Output" : "Net";
        return `<option value="${esc(name)}">${kind}</option>`;
      }).join("");
      if (tableMode.value === "arbitrary") return;
      for (const [field, direction] of [[inputNames, "in"], [outputNames, "out"]]) {
        const available = direction === "in" ? inputs : outputs;
        const previousDefault = direction === "in" ? lastDefaultInputs : lastDefaultOutputs;
        const chosen = parseNames(field);
        if (!chosen.length || field.value.trim() === previousDefault || chosen.some((name) => !available.includes(name))) {
          field.value = available.join(", ");
        }
      }
      lastDefaultInputs = inputNames.value.trim();
      lastDefaultOutputs = outputNames.value.trim();
    };
    const validateInputs = (names) => {
      if (!names.length) throw new Error("Choose at least one input port.");
      if (new Set(names).size !== names.length) throw new Error("Choose each input port only once.");
      const available = new Set(doc.ports.filter((port) => port.dir === "in").map((port) => port.id));
      for (const name of names) if (!available.has(name)) throw new Error(`"${name}" is not an input port in this circuit.`);
    };
    const validateOutputs = (names) => {
      if (!names.length) throw new Error("Choose at least one output net.");
      if (new Set(names).size !== names.length) throw new Error("Choose each output net only once.");
      const available = new Set(namedNetNames(doc));
      for (const name of names) if (!available.has(name)) throw new Error(`"${name}" is not a named net in this circuit.`);
    };
    const csvCell = (value) => /[",\t\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    const renderTableGrid = () => {
      let rows;
      try { rows = parseTable(tableInput.value); }
      catch { tableGrid.replaceChildren(); return; }
      tableGrid.innerHTML = `<table><thead><tr>${rows[0].map((name) => `<th scope="col" data-table-name="${esc(name)}">${esc(name)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((row, i) => `<tr>${row.map((value, j) => `<td><input class="form-control form-control-sm" data-table-row="${i + 1}" data-table-col="${j}" aria-label="Case ${i + 1}, ${esc(rows[0][j])}" value="${esc(value)}"></td>`).join("")}</tr>`).join("")}</tbody></table>`;
      const headings = [...tableGrid.querySelectorAll("[data-table-name]")];
      const pairs = headings.map((heading) => {
        try { return [heading, texOf(heading.dataset.tableName)]; } catch { return [heading, null]; }
      });
      typesetAll(pairs.map(([, tex]) => tex).filter(Boolean), typeset).then(() => {
        for (const [heading, tex] of pairs) {
          const parsed = tex && typeset.get(tex);
          if (!heading.isConnected || !parsed?.ok) continue;
          heading.innerHTML = `<svg role="img" aria-label="${esc(heading.dataset.tableName)}" viewBox="${parsed.left * 1000} ${-parsed.height * 1000} ${parsed.width * 1000} ${(parsed.height + parsed.depth) * 1000}" width="${parsed.width}em" height="${parsed.height + parsed.depth}em"><g color="currentColor">${statusNodesMarkup(parsed.nodes)}</g></svg>`;
        }
      }).catch((error) => { latexStatus.textContent = `Could not typeset table names: ${error.message}`; latexStatus.setAttribute("data-error", ""); });
    };
    const defaultHeader = () => [...new Set([...parseNames(inputNames), ...parseNames(outputNames)])].map(csvCell).join(",");
    const refreshTableHeader = (force = false) => {
      const current = tableInput.value.trim();
      const lines = current.split(/\r?\n/);
      const next = defaultHeader();
      const replace = force || !current || (lines.length === 1 && current === lastDefaultHeader);
      lastDefaultHeader = next;
      if (replace) {
        tableInput.value = next;
        refreshLatex();
        renderTableGrid();
      }
    };
    const showResults = (result) => {
      const passed = result.checks.filter((item) => item.pass).length;
      const unresolved = result.checks.reduce((count, item) => count + item.outputs.filter((output) => output.unresolved).length, 0);
      results.removeAttribute("data-error");
      results.innerHTML = `<p>${passed} of ${result.checks.length} cases match the circuit.${unresolved ? ` ${unresolved} output(s) unresolved (X).` : ""}</p><ol>${result.checks.map((item) => {
        const detail = item.outputs.map((output) => output.unresolved ? `${output.name}: UNRESOLVED (expected ${output.expected}, got X)` : output.pass ? `${output.name}: PASS` : `${output.name}: expected ${output.expected}, got ${output.actual}`).join("; ");
        return `<li data-pass="${item.pass}">Case ${item.case} (${Object.entries(item.inputs).map(([name, value]) => `${esc(name)}=${value}`).join(", ")}): ${esc(detail)}</li>`;
      }).join("")}</ol>`;
    };
    const displayError = (error) => {
      results.dataset.error = "true";
      results.innerHTML = `<p data-error>${esc(error.message)}</p>`;
    };
    const buildLatex = () => {
      if (!tableInput.value.trim()) throw new Error("Enter a header row and truth-table cases.");
      return latexTable(tableInput.value);
    };
    const refreshLatex = () => {
      if (!tableInput.value.trim()) {
        latexOutput.value = "";
        latexStatus.textContent = "";
        latexStatus.removeAttribute("data-error");
        return null;
      }
      try {
        latexOutput.value = buildLatex();
        latexStatus.textContent = "";
        latexStatus.removeAttribute("data-error");
        return latexOutput.value;
      } catch (error) {
        latexOutput.value = "";
        latexStatus.textContent = error.message;
        latexStatus.setAttribute("data-error", "");
        return null;
      }
    };
    const restoreProjectCopy = () => {
      tableInput.value = "";
      const saved = store.get(storageKey());
      if (!saved) { refreshTableHeader(true); refreshLatex(); return; }
      try {
        if (saved.length > 100000) throw new Error("the saved copy is too large");
        const copy = JSON.parse(saved);
        if (copy?.schema !== "figure-editor-truth-table/1" || typeof copy.inputs !== "string" ||
            typeof copy.outputs !== "string" || typeof copy.csv !== "string") {
          throw new Error("the saved copy has an unsupported format");
        }
        inputNames.value = copy.inputs;
        outputNames.value = copy.outputs;
        tableMode.value = copy.mode === "arbitrary" ? "arbitrary" : "circuit";
        lastDefaultInputs = inputNames.value.trim();
        lastDefaultOutputs = outputNames.value.trim();
        lastDefaultHeader = defaultHeader();
        tableInput.value = copy.csv;
        refreshLatex();
        renderTableGrid();
        latexStatus.textContent = "Loaded this project's saved copy.";
      } catch (error) {
        refreshTableHeader(true);
        refreshLatex();
        latexStatus.textContent = `Could not load the saved copy: ${error.message}`;
        latexStatus.setAttribute("data-error", "");
      }
    };
    const snapshot = () => {
      const csv = tableInput.value;
      if (!csv.trim()) return null;
      let latex = null, error = null;
      try { latex = latexTable(csv); } catch (e) { error = e.message; }
      return { schema: "figure-editor-truth-table/1", mode: tableMode.value, inputs: inputNames.value, outputs: outputNames.value, csv, latex, ...(error ? { error } : {}) };
    };
    truthTableSnapshot = snapshot;
    refreshTruthPortList = () => { refreshPorts(); refreshTableHeader(); };
    truthTableProjectChanged = () => { refreshPorts(); restoreProjectCopy(); };
    const applyResult = (result, message, showDiagram) => {
      timingTool.source = JSON.stringify(result.timing);
      selectedFrame = 0;
      commit({ ...doc, groups: { ...(doc.groups ?? {}), frames: result.frames } }, null);
      renderFrames();
      timingTool.setFrame(-1);
      status(message);
      if (showDiagram) tpBody.querySelector('[data-view="diagram"]').click();
    };
    refreshPorts();
    restoreProjectCopy();
    tableMode.addEventListener("change", () => {
      if (tableMode.value === "circuit") { lastDefaultInputs = ""; lastDefaultOutputs = ""; inputNames.value = ""; outputNames.value = ""; refreshPorts(); }
      refreshTableHeader(true);
      results.replaceChildren();
    });
    for (const field of [inputNames, outputNames]) field.addEventListener("input", () => refreshTableHeader());
    tableInput.addEventListener("input", () => { refreshLatex(); renderTableGrid(); });
    tableGrid.addEventListener("input", (event) => {
      const input = event.target.closest("[data-table-row]");
      if (!input) return;
      try {
        const rows = parseTable(tableInput.value);
        rows[Number(input.dataset.tableRow)][Number(input.dataset.tableCol)] = input.value;
        tableInput.value = rows.map((row) => row.map(csvCell).join(",")).join("\n");
        refreshLatex();
      } catch (error) { displayError(error); }
    });
    pane.addEventListener("click", (event) => {
      const action = event.target.closest("[data-truth-action]")?.dataset.truthAction;
      if (!action) return;
      try {
        if (action === "create" || (action === "generate" && tableMode.value === "arbitrary")) {
          const inputs = parseNames(inputNames), outputs = parseNames(outputNames);
          if (!inputs.length || !outputs.length || inputs.length > 6 || inputs.length + outputs.length > 32) throw new Error("Choose 1–6 inputs and at least one output, with at most 32 columns.");
          if (new Set([...inputs, ...outputs]).size !== inputs.length + outputs.length) throw new Error("Every input and output needs a unique name.");
          if (tableMode.value === "circuit") { validateInputs(inputs); validateOutputs(outputs); }
          const columns = [...inputs, ...outputs];
          tableInput.value = [columns.map(csvCell).join(","), ...Array.from({ length: 2 ** inputs.length }, (_, i) =>
            columns.map((_, j) => action === "generate" && j < inputs.length ? String((i >> (inputs.length - 1 - j)) & 1) : "").join(","))].join("\n");
          refreshLatex(); renderTableGrid();
          results.removeAttribute("data-error");
          results.textContent = `${2 ** inputs.length} cases ready to edit.`;
        } else if (action === "generate") {
          const inputs = parseNames(inputNames), outputs = parseNames(outputNames);
          validateInputs(inputs); validateOutputs(outputs);
          const generated = truthTable(doc, pack, inputs, outputs);
          const signals = new Map(generated.timing.signal.filter((signal) => signal.name).map((signal) => [signal.name, signal.wave]));
          const expand = (wave) => {
            let previous = "";
            return [...wave].map((value) => value === "." ? previous : (previous = value)).join("");
          };
          const waves = new Map([...signals].map(([name, wave]) => [name, expand(wave)]));
          const columns = [...inputs, ...outputs];
          tableInput.value = [columns.map(csvCell).join(","),
            ...Array.from({ length: generated.frames.length }, (_, step) => columns.map((name) => {
              const value = waves.get(name)[step];
              return inputs.includes(name) ? value : value.toUpperCase();
            }).map(csvCell).join(",")),
          ].join("\n");
          refreshLatex();
          renderTableGrid();
          results.removeAttribute("data-error");
          results.innerHTML = `<p>Generated ${generated.frames.length} cases. Edit the table, then check it against the circuit.</p>`;
          applyResult(generated, `Generated ${generated.frames.length} input cases.`, true);
        } else if (action === "check") {
          const checked = parseTruthTable(tableInput.value, doc, pack);
          showResults(checked);
          const passed = checked.checks.filter((item) => item.pass).length;
          const unresolved = checked.checks.reduce((count, item) => count + item.outputs.filter((output) => output.unresolved).length, 0);
          applyResult(checked, `${passed} of ${checked.checks.length} truth-table cases match the circuit.${unresolved ? ` ${unresolved} output(s) unresolved (X).` : ""}`, false);
        } else if (action === "save-copy") {
          const latex = refreshLatex();
          if (!latex) throw new Error(latexStatus.textContent || "Enter a valid truth table before saving a copy.");
          const copy = JSON.stringify({ schema: "figure-editor-truth-table/1", mode: tableMode.value, inputs: inputNames.value, outputs: outputNames.value, csv: tableInput.value, latex });
          if (!store.set(storageKey(), copy)) throw new Error("Could not save the truth table copy in this browser (storage may be unavailable or full).");
          latexStatus.textContent = "Saved the table and LaTeX with this project in this browser.";
          status("Saved a truth-table copy with this project.");
        } else if (action === "export-copy") {
          const latex = refreshLatex();
          if (!latex) throw new Error(latexStatus.textContent || "Enter a valid truth table before exporting a copy.");
          download(new Blob([latex], { type: "application/x-tex" }), `${doc.id}-truth-table.tex`, "application/x-tex");
          latexStatus.textContent = `Exported ${doc.id}-truth-table.tex.`;
          status(`Exported ${doc.id}-truth-table.tex.`);
        }
      } catch (error) { displayError(error); status(error.message, true); }
    });
  }
  /**
   * The three workspaces are sections of one stack: the one in view takes the whole window, the others slide away to their title bars
   * (CSS animates the rows). The side panes follow: each pane lists the workspaces it belongs to (data-views).
   */
  function setView(v) {
    opt.view = v; opt.slideView = v === "slide";
    root.dataset.workspace = v;
    for (const b of root.querySelectorAll("[data-sec-bar]")) b.setAttribute("aria-expanded", String(b.dataset.secBar === v));
    for (const p of root.querySelectorAll("[data-views]")) p.hidden = !p.dataset.views.split(" ").includes(v);
    setWorkspacePanes({ figure: v === "figure" ? 100 : 0, timing: v === "timing" ? 100 : 0, slide: v === "slide" ? 100 : 0 });
    saveOptions();
    if (v === "figure" || v === "slide") {
      if (timingTool) populateFromTiming({ auto: true, quiet: true });
      else refreshFramesWhenTimingReady = true;
    }
    if (v === "timing" && timingTool) {
      timingTool.setFrame(selectedFrame > 0 ? selectedFrame - 1 : -1);
      syncTimingSelection();
    }
    mountTiming(); syncSlide();
  }
  /** Step through the frames from the toolbar: the canvas shows that frame's levels, the timing diagram marks its step. */
  function goToFrame(n) {
    const frames = framesOf(doc);
    if (!frames.length || !Number.isFinite(n)) return;
    selectedFrame = Math.max(0, Math.min(frames.length - 1, Math.round(n)));
    const message = selectedFrame === 0 ? "Frame 0: initial levels." : `Frame ${selectedFrame} of ${frames.length - 1}: ${frames[selectedFrame].name}`;
    commit(applyFrame(doc, frames[selectedFrame]), message, { preserveLevels: true });
    timingTool?.setFrame(selectedFrame > 0 ? selectedFrame - 1 : -1);
    renderFrames();
  }
  $(".fe-stepinput")?.addEventListener("change", (e) => goToFrame(Number(e.target.value)));
  $(".fe-stepinput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") goToFrame(Number(e.target.value)); e.stopPropagation(); });
  function stepFrame(by) {
    const frames = framesOf(doc);
    if (!frames.length) return;
    goToFrame((selectedFrame < 0 ? (by > 0 ? -1 : frames.length) : selectedFrame) + by);
  }

  // ---- level colours (F17) ----------------------------------------------------------------------------
  const lcRows = [...root.querySelectorAll(".fe-lc-row")], lcWarn = $(".fe-lc-warnings");
  /** The colour a level has on a canvas now: the figure's choice, or the theme's default for that canvas. */
  function levelNow(level, dark) {
    const l = LEVELS.find((x) => x.value === level), chosen = doc.style?.levels?.[level]?.[dark ? "dark" : "light"];
    return chosen ?? (dark ? darkRoles()[l.role] : null) ?? loaded.baseTheme.roles[l.role] ?? "#000000";
  }
  function syncLevels() {
    for (const row of lcRows) {
      const level = row.dataset.level, mine = doc.style?.levels?.[level] ?? {};
      for (const inp of row.querySelectorAll("input")) {
        if (document.activeElement !== inp) inp.value = levelNow(level, inp.dataset.mode === "dark").toLowerCase();
        inp.classList.toggle("is-custom", !!mine[inp.dataset.mode]);
      }
      row.querySelector("button").disabled = !Object.keys(mine).length;
    }
    $('[data-cmd="levelsreset"]').disabled = !Object.keys(doc.style?.levels ?? {}).length;
    const msgs = [];
    for (const dark of [false, true]) {
      const bg = dark ? (darkRoles().background ?? loaded.baseTheme.roles.background) : loaded.baseTheme.roles.background;
      const colours = Object.fromEntries(LEVELS.map((l) => [l.value, levelNow(l.value, dark)]));
      for (const w of levelWarnings(colours, bg)) msgs.push(`${dark ? "Dark" : "Light"} canvas: ${w}`);
    }
    lcWarn.innerHTML = msgs.map((m) => `<li>${esc(m)}</li>`).join("");
  }
  for (const row of lcRows) {
    row.addEventListener("change", (e) => {
      const inp = e.target.closest("input"); if (!inp) return;
      commit(D.setStyleLevels(doc, withLevelColour(doc.style?.levels, row.dataset.level, inp.dataset.mode, inp.value)), `Level ${row.dataset.level}: ${inp.dataset.mode} colour set.`);
    });
    row.querySelector("button").addEventListener("click", () => commit(D.setStyleLevels(doc, Object.fromEntries(Object.entries(doc.style?.levels ?? {}).filter(([k]) => k !== row.dataset.level))), `Level ${row.dataset.level} is back on the theme default.`));
  }

  // ---- the slide (F19) ----
  const slideEls = { show: $('[name="fe-slide-show"]'), format: $('[name="fe-slide-format"]'), header: $('[name="fe-slide-header"]'), footer: $('[name="fe-slide-footer"]'), layout: $('[name="fe-slide-layout"]') };
  const regionsEl = $(".fe-slide-regions"), slideView = $(".fe-slideview"), slideBar = $(".fe-slidebar");
  opt.slideView = opt.slideView === true;
  let slideDraft = null;      // the slide while a region is being dragged (committed on release)
  let regionsKey = "";
  function currentSlide() { return slideDraft ?? slideOf(doc) ?? defaultSlide(); }
  function setSlide(next, msg) { commit(withSlide(doc, next), msg); }
  function addRegion(kind) {
    const s = currentSlide(), a = contentArea(s);
    let n = s.regions.length + 1; while (s.regions.some((r) => r.id === `r${n}`)) n++;
    setSlide({ ...s, layout: "custom", regions: [...s.regions, { id: `r${n}`, kind, label: KINDS[kind], x: a.x, y: a.y, w: Math.min(16, a.w), h: Math.min(10, a.h) }] }, `Added a ${KINDS[kind].toLowerCase()} region. Drag it into place in the slide view.`);
  }
  function syncSlide() {
    if (!PARTS.slide) return;
    const s = currentSlide(), frames = framesOf(doc);
    slideEls.show.checked = opt.slideView;
    slideEls.format.value = s.format; slideEls.layout.value = s.layout;
    const sp = splitsOf(s);   // a divider is editable only when the layout uses it
    for (const k of Object.keys(SPLITS)) {
      const row = $(`[data-split="${k}"]`), inp = row.querySelector("input");
      row.hidden = !(k in sp);
      if (document.activeElement !== inp) inp.value = k in sp ? String(Math.round(sp[k])) : "";
    }
    if (document.activeElement !== slideEls.header) slideEls.header.value = String(s.headerCm);
    if (document.activeElement !== slideEls.footer) slideEls.footer.value = String(s.footerCm);
    const key = JSON.stringify([s.regions.map((r) => [r.id, r.kind, r.label, r.frame]), frames.length]);
    if (key !== regionsKey && !regionsEl.contains(document.activeElement)) {
      regionsKey = key;
      regionsEl.innerHTML = s.regions.map((r) => `<li class="fe-region" data-r="${esc(r.id)}">
        <input class="form-control form-control-sm" data-f="label" value="${esc(r.label)}" aria-label="Label of region ${esc(r.id)}">
        <select class="form-select form-select-sm" data-f="kind" aria-label="Kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${k === r.kind ? " selected" : ""}>${v}</option>`).join("")}</select>
        ${r.kind === "schematic" ? `<select class="form-select form-select-sm" data-f="frame" aria-label="Levels shown"><option value="">Levels: as on the canvas</option>${frames.map((f, i) => `<option value="${i}"${r.frame === i ? " selected" : ""}>Levels: ${esc(numbered(i, frames.length))} ${esc(f.name)}</option>`).join("")}</select>` : ""}
        <span class="fe-theme-buttons">${r.kind === "text" ? "" : `<button type="button" class="${BUTTON}" data-part="svg">SVG</button><button type="button" class="${BUTTON}" data-part="png">PNG</button>`}<button type="button" class="${BUTTON}" data-part="del" aria-label="Delete region ${esc(r.id)}">Delete</button></span>
      </li>`).join("") || `<li class="fe-hint">No regions: pick a layout or add one.</li>`;
    }
    if (opt.slideView) renderSlideView();
  }
  /** The slide view: the slide as it will export (with the header, footer and text boxes shown), and each region's outline and resize handle. */
  function renderSlideView() {
    if (!PARTS.slide) return;
    const s = currentSlide(), { w, h } = slideSize(s.format), roles = pack.theme.roles;
    let body;
    try {
      const text = slideSvg(doc, pack, s, { ...drawOpts(), preview: true, timing: timingFor(pack) });
      body = text.slice(text.indexOf(">", text.indexOf("<svg")) + 1, text.lastIndexOf("</svg>")).replace(/<title>[\s\S]*?<\/title>/, "");
    } catch { body = ""; queueTypeset(); }
    const lw = 0.08, k = 0.9;
    const outlines = s.regions.map((r) => `<g data-region="${esc(r.id)}" style="cursor:move">
      <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${roles.accent}" fill-opacity="0.001" stroke="${roles.accent}" stroke-width="${lw}" stroke-dasharray="0.4 0.25"/>
      <text x="${r.x + 0.3}" y="${r.y + 0.3 + k}" font-size="${k}" font-family="var(--bs-font-monospace)" fill="${roles.accent}">${esc(r.label)}</text>
      <rect data-handle="1" x="${r.x + r.w - 1}" y="${r.y + r.h - 1}" width="1" height="1" fill="${roles.accent}" style="cursor:nwse-resize"/>
    </g>`).join("");
    slideBar.innerHTML = `<span class="label-mono">Layout</span>${Object.entries(SLIDE_LAYOUTS).map(([k, v]) => `<button type="button" class="fe-layout" data-layout="${k}" aria-pressed="${s.layout === k}" title="${esc(v.name)}">${layoutThumb(k, s, roles)}<span>${esc(v.name)}</span></button>`).join("")}`;
    slideView.setAttribute("viewBox", `-1 -1 ${w + 2} ${h + 2}`);
    slideView.innerHTML = `<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="${roles.accent}" stroke-width="${lw * 1.5}"/>${body}${outlines}`;
  }
  slideView?.addEventListener("pointerdown", (e) => {
    const g = e.target.closest("[data-region]");
    if (!g) return;
    const id = g.dataset.region, resize = !!e.target.closest("[data-handle]"), base = currentSlide();
    const at = (ev) => { const p = slideView.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(slideView.getScreenCTM().inverse()); };
    const p0 = at(e);
    slideView.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const p = at(ev), dx = Math.round(p.x - p0.x), dy = Math.round(p.y - p0.y);
      slideDraft = nudgeRegion(base, id, resize ? { dw: dx, dh: dy } : { dx, dy });
      renderSlideView();
    };
    const up = () => {
      slideView.removeEventListener("pointermove", move);
      const next = slideDraft; slideDraft = null;
      if (next && JSON.stringify(next) !== JSON.stringify(base)) setSlide(next, resize ? "Region resized." : "Region moved.");
      else syncSlide();
    };
    slideView.addEventListener("pointermove", move);
    slideView.addEventListener("pointerup", up, { once: true });
  });
  slideBar?.addEventListener("click", (e) => { const b = e.target.closest("[data-layout]"); if (b) setSlide(withLayout(currentSlide(), b.dataset.layout, { reset: true }), `Layout: ${SLIDE_LAYOUTS[b.dataset.layout].name}.`); });
  for (const k of Object.keys(SPLITS)) $(`[name="fe-split-${k}"]`).addEventListener("change", (e) => {
    const s = currentSlide();
    if (!(s.layout in SLIDE_LAYOUTS)) return status("Pick a layout first: dividers belong to a layout.");
    setSlide(withSplit(s, k, Number(e.target.value)), `${SPLITS[k].name} set.`);
  });
  slideEls.show.addEventListener("change", () => { opt.slideView = slideEls.show.checked; saveOptions(); syncSlide(); });
  slideEls.format.addEventListener("change", () => setSlide(withLayout({ ...currentSlide(), format: slideEls.format.value }, currentSlide().layout === "custom" ? "over" : currentSlide().layout), "Slide size changed; the layout was fitted again."));
  for (const k of ["header", "footer"]) slideEls[k].addEventListener("change", () => {
    const s = { ...currentSlide(), [`${k}Cm`]: Number(slideEls[k].value) || 0 };
    setSlide(s.layout === "custom" ? s : withLayout(s, s.layout), `${k === "header" ? "Header" : "Footer"} height changed.`);
  });
  slideEls.layout.addEventListener("change", () => setSlide(withLayout(currentSlide(), slideEls.layout.value, { reset: true }), `Layout: ${SLIDE_LAYOUTS[slideEls.layout.value].name}.`));
  regionsEl.addEventListener("change", (e) => {
    const li = e.target.closest("[data-r]"), f = e.target.dataset.f;
    if (!li || !f) return;
    const s = currentSlide(), v = e.target.value;
    const regions = s.regions.map((r) => {
      if (r.id !== li.dataset.r) return r;
      const n = { ...r };
      if (f === "label") n.label = v.trim() || KINDS[r.kind];
      if (f === "kind") { n.kind = v; delete n.frame; }
      if (f === "frame") { if (v === "") delete n.frame; else n.frame = Number(v); }
      return n;
    });
    setSlide({ ...s, layout: f === "label" || f === "frame" ? s.layout : "custom", regions }, "Region changed.");
  });
  regionsEl.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-part]"), li = e.target.closest("[data-r]");
    if (!b || !li) return;
    const id = li.dataset.r, s = currentSlide();
    if (b.dataset.part === "del") { setSlide({ ...s, layout: "custom", regions: s.regions.filter((r) => r.id !== id) }, "Region deleted."); return; }
    try {
      const text = await slideNow({ only: id, includeBackdrop: askBackdrop() }), name = `${doc.id}-${id}`;
      if (b.dataset.part === "svg") download(text, `${name}.svg`, "image/svg+xml"); else download(await pngOf(text), `${name}.png`, "image/png");
      status(`Exported ${name}.${b.dataset.part} at the region's size.`);
    } catch (err) { status(err.message, true); }
  });
  syncSlide();
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
    tagPtInput.value = String(opt.levelTagPt);
    render();
  });
  tagPtInput.value = String(opt.levelTagPt);
  tagPtInput.addEventListener("change", () => {
    const v = +tagPtInput.value;
    opt.levelTagPt = v >= 4 && v <= 48 ? v : 8;
    saveOptions();
    tagPtInput.value = String(opt.levelTagPt);
    render();
  });
  tagColourInput.checked = opt.levelTagColour;
  tagColourInput.addEventListener("change", () => { opt.levelTagColour = tagColourInput.checked; saveOptions(); render(); });
  canvasInput.value = opt.canvas;
  canvasInput.addEventListener("change", () => { opt.canvas = canvasInput.value; saveOptions(); applyCanvas(); render(); status(`Canvas: ${canvasInput.selectedOptions[0].text}.`); });
  exportDarkInput.checked = opt.exportDark;
  exportDarkInput.addEventListener("change", () => { opt.exportDark = exportDarkInput.checked; saveOptions(); status(opt.exportDark ? "SVG and PNG exports will use the dark theme." : "SVG and PNG exports will use the default light theme."); });
  for (const [n, k] of [["fe-tmarker", "timingMarker"], ["fe-tcolour", "timingColour"]]) {
    const box = $(`[name="${n}"]`); box.checked = !!opt[k];
    box.addEventListener("change", () => { opt[k] = box.checked; saveOptions(); render(); });
  }
  tagsInput.checked = !!opt.levelTags;
  tagsInput.addEventListener("change", () => { opt.levelTags = tagsInput.checked; saveOptions(); render(); queueTypeset(); });
  netNamesInput.checked = opt.netNames;
  netNamesInput.addEventListener("change", () => { opt.netNames = netNamesInput.checked; saveOptions(); render(); });
  // ---- backdrop to trace over -------------------------------------------------------------
  const bdOpacity = $('[name="fe-bd-opacity"]'), bdScale = $('[name="fe-bd-scale"]'), bdX = $('[name="fe-bd-x"]'), bdY = $('[name="fe-bd-y"]');
  const backdropInput = $(".fe-backdrop-file");
  function askBackdrop() {
    return !!doc.groups?.backdrop && window.confirm("Include the backdrop in this export?");
  }
  function applyBackdrop() {
    const backdrop = doc.groups?.backdrop;
    if (!backdrop) { view.setBackdrop(null); $(".fe-backdrop-controls").hidden = true; return; }
    const w = backdrop.width * backdrop.scale, h = backdrop.height * backdrop.scale;
    view.setBackdrop({ href: backdrop.href, x: backdrop.cx - w / 2, y: backdrop.cy - h / 2, width: w, height: h, opacity: backdrop.opacity });
    $(".fe-backdrop-controls").hidden = false;
    bdOpacity.value = String(Math.round(backdrop.opacity * 100)); bdScale.value = String(Math.round(backdrop.scale * 100));
    bdX.value = String(Math.round(backdrop.cx * 2)); bdY.value = String(Math.round(-backdrop.cy * 2));
  }
  function importBackdrop(text, name) {
    const r = sanitizeSvg(text);
    setBackdrop({ href: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.svg)}`, width: r.width, height: r.height, cx: view.cam.cx, cy: view.cam.cy, scale: 1, opacity: 0.5 }, `Loaded ${name} as a backdrop.`);
    $(".fe-backdrop-pane").open = true;
  }
  function setBackdrop(value, message) {
    const groups = { ...(doc.groups ?? {}) };
    if (value) groups.backdrop = checkedBackdrop(value); else delete groups.backdrop;
    commit({ ...D.clone(doc), groups }, message, { preserveLevels: true });
  }
  commands.backdropopen = () => backdropInput.click();
  commands.backdropremove = () => setBackdrop(null, "Backdrop removed.");
  bdOpacity.addEventListener("change", () => { if (doc.groups?.backdrop && bdOpacity.value !== "") setBackdrop({ ...doc.groups.backdrop, opacity: Math.min(1, Math.max(0, +bdOpacity.value / 100)) }, "Backdrop opacity changed."); });
  bdScale.addEventListener("change", () => { if (doc.groups?.backdrop && +bdScale.value >= 5) setBackdrop({ ...doc.groups.backdrop, scale: Math.min(20, +bdScale.value / 100) }, "Backdrop scale changed."); else applyBackdrop(); });
  for (const input of [bdX, bdY]) input.addEventListener("change", () => { if (doc.groups?.backdrop) setBackdrop({ ...doc.groups.backdrop, cx: (+bdX.value || 0) / 2, cy: -(+bdY.value || 0) / 2 }, "Backdrop position changed."); });
  backdropInput.addEventListener("change", async () => {
    const f = backdropInput.files[0]; backdropInput.value = "";
    if (!f) return;
    try {
      if (f.size > MAX_SVG_BYTES) throw new Error("image exceeds the 5 MB limit");
      if (/\.svg$/i.test(f.name) || f.type === "image/svg+xml") importBackdrop(await f.text(), f.name);
      else if (/\.png$/i.test(f.name) || f.type === "image/png") {
        const href = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("could not read the PNG"));
          reader.readAsDataURL(new Blob([f], { type: "image/png" }));
        });
        const img = new Image(); img.src = href; await img.decode();
        if (img.naturalWidth > 16000 || img.naturalHeight > 16000) throw new Error("PNG dimensions exceed 16000 pixels");
        setBackdrop({ href, width: img.naturalWidth * 2.54 / 96 / 0.5, height: img.naturalHeight * 2.54 / 96 / 0.5, cx: view.cam.cx, cy: view.cam.cy, scale: 1, opacity: 0.5 }, `Loaded ${f.name} as a backdrop.`);
      } else throw new Error("choose an SVG or PNG image");
    } catch (error) { status(`Could not load backdrop: ${error.message}`, true); }
  });

  fileInput.addEventListener("change", () => {
    const f = fileInput.files[0];
    fileInput.value = "";
    if (f) { startUi?.close(); openFile(f); }
  });
  async function openFile(f) {
    const isSvg = /\.svg$/i.test(f.name) || f.type === "image/svg+xml";
    const limit = isSvg ? MAX_SVG_BYTES * 6 : MAX_SVG_BYTES * 5;
    if (f.size > limit) { status(`Could not open ${f.name}: it is ${(f.size / 1e6).toFixed(1)} MB, over the ${limit / 1e6} MB limit. The figure on the canvas is unchanged.`, true); return; }
    try {
      const text = await f.text();
      if (isSvg || /^\s*<(\?xml|svg)/.test(text)) {
        const circuit = circuitFromSvg(text);
        if (circuit) { load(circuit); status(`Opened ${doc.id} from the circuit inside ${f.name}.`); }
        else importBackdrop(text, f.name);
      } else load(text);
    } catch (e) { status(`Could not open ${f.name}: ${e.message}. The figure on the canvas is unchanged.`, true); }
  }
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
  function setCalculationMode(checked) {
    const mode = checked ? "calculated" : "manual";
    commit(setLogicMode(doc, pack, mode), mode === "manual"
      ? "Calculated levels cleared. Set logic levels manually."
      : "Calculated logic levels are on.");
  }
  logicCalculationInput.addEventListener("change", () => setCalculationMode(logicCalculationInput.checked));

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

  function wireHandleAt(p) {
    if (total(selection) !== 1 || selection.wires.length !== 1) return null;
    const wire = doc.wires.find((item) => item.id === selection.wires[0]);
    if (!wire) return null;
    for (const side of ["from", "to"]) {
      const end = D.endpoint(doc, pack, wire[side]);
      if (end && Math.hypot(end.at[0] - p[0], end.at[1] - p[1]) <= 0.9) return { id: wire.id, side };
    }
    return null;
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
    if (tool === "wire") { wireClick(p, e); return; }
    if (tool === "port") { portClick(p); return; }
    if (tool === "label") { labelClick(p); return; }
    if (tool === "solder") { solderClick(p); return; }
    const wireHandle = wireHandleAt(p);
    if (wireHandle) {
      drag = { kind: "wire-end", ...wireHandle, start: p, base: doc, moved: false };
      svg.setPointerCapture(e.pointerId);
      status("Drag the wire end to a pin, port, wire or grid point.");
      return;
    }
    const handle = blockHandleAt(p);
    if (handle) {
      drag = { kind: "resize", id: handle.el.id, handle: handle.id, start: p, base: doc, el: handle.el };
      svg.setPointerCapture(e.pointerId);
      status("Drag to resize the block in whole modules. One drag is one undo step.");
      return;
    }
    const hits = targets(p);
    const junction = hits.find((h) => h.kind === "junction" && junctionIsFourWay(h.id));
    if (junction) {
      selection = none();
      selectedJunction = junction.id;
      hoverWire = null;
      drag = null;
      const pane = root.querySelector('.fe-left details[data-views="figure"]');
      if (pane) pane.open = true;
      render();
      return;
    }
    selectedJunction = null;
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
      if (c && !doc.wires.find((w) => w.id === k)?.route?.includes("straight")) {   // a lone orthogonal wire: drag slides the run sideways
        const index = nearestOnPolyline(p, c).segment;
        drag = { kind: "segment", id: k, index, horizontal: c[index][1] === c[index + 1][1], start: p, base: doc, d: 0 };
        const names = internalNodesForWires(selection.wires);
        if (names.length) statusWithNodes(names, `selected. Drag sideways to move this run; Delete removes it.`);
        else status("Unconnected node selected. Drag sideways to move this run; Delete removes it.");
      } else {
        drag = { kind: "move", start: p, base: doc, sel: structuredClone(selection), delta: [0, 0] };
        if (c) {
          const names = internalNodesForWires(selection.wires);
          if (names.length) statusWithNodes(names, "selected. Drag to move it; Delete removes it.");
          else status("Unconnected node selected. Drag to move it; Delete removes it.");
        }
      }
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
    if (drag?.kind === "wire-end") {
      const at = snapStep(p);
      if (Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) < 0.5) return;
      const hit = hitTest(drag.base, pack, p).find((item) =>
        ["pin", "junction", "port", "wire"].includes(item.kind) && !item.textOnly &&
        (item.kind !== "wire" || (item.id !== drag.id && item.tap)));
      const target = hit ? hit.kind === "pin" ? { kind: "pin", ref: hit.ref, at: hit.at }
        : { kind: hit.kind, id: hit.id, at: hit.at } : { kind: "point", at };
      try { doc = D.moveWireEnd(drag.base, pack, drag.id, drag.side, target); drag.moved = true; }
      catch (err) { doc = drag.base; drag.moved = false; status(err.message, true); }
      render();
      return;
    }
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
      if (wiring) updateRubber(p, e);
      else { const t = wireTarget(p, e); const h = t.kind !== "point" ? t.at : null; if (!same(h, hover)) { hover = h; render(); } }
    }
  });

  /** Highlight the wire a click would pick, and show which way its run slides (the cursor). */
  function updateHoverWire(p) {
    const t = targets(p).find((h) => ["port", "wire", "label", "element"].includes(h.kind));
    const id = t?.kind === "wire" ? t.id : null;
    const c = id ? D.allCorners(doc, pack).get(id) : null;
    const i = c ? nearestOnPolyline(p, c).segment : 0;
    const dir = c ? (c[i][0] !== c[i + 1][0] && c[i][1] !== c[i + 1][1] ? "wire-diagonal" : c[i][1] === c[i + 1][1] ? "wire-h" : "wire-v") : "";
    if (id === hoverWire && (svg.dataset.hit ?? "") === dir) return;
    hoverWire = id;
    if (dir) svg.dataset.hit = dir; else delete svg.dataset.hit;
    render();
  }

  const endDrag = () => {
    if (drag?.kind === "wire-end") {
      if (drag.moved && JSON.stringify(doc) !== JSON.stringify(drag.base)) { history.record(drag.base); changed("Moved a wire end.", drag.base); }
      else doc = drag.base;
    } else if (drag?.kind === "resize") {
      if (doc !== drag.base && JSON.stringify(doc) !== JSON.stringify(drag.base)) { history.record(drag.base); changed("Resized the block.", drag.base); }
      else doc = drag.base;
    } else if (drag?.kind === "segment") {
      if (doc !== drag.base) { history.record(drag.base); changed("Moved a wire run.", drag.base); }   // the whole drag is one undo step
    } else if (drag?.kind === "move" && !same(drag.delta, [0, 0])) {
      history.record(drag.base);   // the whole drag is one undo step
      changed("Moved.", drag.base);
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
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "f" || e.ctrlKey || e.metaKey || e.altKey) return;
    e.stopImmediatePropagation();
    if (e.target.closest("input, textarea, select, [contenteditable=true]")) return;
    e.preventDefault();
    if (!helpEl.open && !startUi?.isOpen) commands.fit();
  }, true);
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
      else { selection = none(); selectedJunction = null; render(); }
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

  let startUi = null;
  // ---- start ----------------------------------------------------------------------------------
  view.setGrid(opt.grid);
  renderPalette();
  render();
  view.fit(null);
  let opened = false, openError = null;
  if (options.open) {
    try {
      const checked = openableUrl(options.open, document.baseURI, location.origin);
      if (checked.error) throw new Error(checked.error);
      const url = checked.url;
      const r = await fetch(url, { credentials: "omit", redirect: "error" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      load(await r.text(), false);
      opened = true;
      status(`Opened ${doc.id} from ${url.pathname.split("/").pop()}.`);
    } catch (e) { openError = `Could not open the link: ${e.message}`; status(openError, true); }
  }
  const saved = !opened && store.get(AUTOSAVE);
  if (saved) {
    try { load(saved, false); status("Restored the autosaved figure."); } catch (e) { status(`The autosaved figure could not be read (${e.message}). It is left alone until your next edit replaces it.`, true); }
  }
  // The example: load it, build its truth-table frames and seed the timing source when it is empty. True when it loaded.
  async function loadExample() {
    try {
      load(await (await fetch(new URL("../examples/full-adder.json", import.meta.url))).text(), false);
      const tt = truthTable(doc, pack, ["A", "B", "Cin"], ["S", "Cout"]);
      doc = ensureFrameZero({ ...doc, groups: { ...(doc.groups ?? {}), frames: tt.frames } });
      if (!store.get(TIMING_SOURCE)) store.set(TIMING_SOURCE, JSON.stringify(tt.timing));
      timingTool?.source !== undefined && (timingTool.source = JSON.stringify(tt.timing));
      render(); renderFrames();
      return true;
    } catch { return false; /* the example could not load: start empty */ }
  }
  // U1.1: with no ?open= and no autosave the editor asks how to start; it no longer loads the example unasked.
  if (startAction({ opened: opened || !!openError, saved }) === "chooser") {
    startUi = createStartChooser({
      root, buttonClass: BUTTON, openIcon: ICONS.open, exampleSrc: new URL("../examples/full-adder.svg", import.meta.url).href,
      pickFile: () => fileInput.click(),
      onFile: openFile,
      choose: async (id) => {
        if (id === "open") { status("Open: drop a .json or .svg file, or choose one."); return; }
        if (id === "example" && await loadExample()) { status(EXAMPLE_STATUS); svg.focus(); return; }
        emptyChosen = true; syncEmptyState(); status(EMPTY_STATUS); svg.focus();
      },
    });
    startUi.open();
  } else if (!opened && !saved) {   // a link that could not be opened: the example, as before, with the reason kept on screen
    await loadExample();
    status(EMPTY_STATUS);
  }

  if (openError) status(openError, true);   // the start-up messages above must not hide why the link was not opened

  setView(new URLSearchParams(location.search).get("view") ?? opt.view ?? "figure");

  root.dataset.parts = Object.entries(PARTS).filter(([, v]) => v).map(([k]) => k).join(" ") || "schematic";
  return {
    get doc() { return doc; },
    /** Run a toolbar command by name (the interface's command()). */
    command: (name, args) => { if (!commands[name]) throw new Error(`the Schematic Editor has no command "${name}"`); return commands[name](args); },
    commandNames: () => Object.keys(commands),
    load: (text) => load(text),
    /** Typeset what the figure needs, then the SVG as exported (options as set on the page). */
    exportSvg: svgNow,
    png: pngNow,
    save: () => D.serialize(doc, pack),
    typesetting: () => queueTypeset(),
  };
}
