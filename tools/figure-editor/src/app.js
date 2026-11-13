// The figure editor page: tools, pointer and keyboard handling, commands, save and load.
//
//   import { mount } from "./src/app.js";
//   mount(element, { pack: "./symbol-pack/", open: "examples/full-adder.json" });
//
// Every change to the figure goes through the pure functions in doc.js; this file
// only decides which one to call and records it for undo.

import { loadPack } from "./pack.js";
import * as D from "./doc.js";
import { History } from "./history.js";
import { exportSvg } from "./export.js";
import { hitTest, inBox } from "./hit.js";
import { route } from "./router.js";
import { createView, thumbnail } from "./view.js";

const AUTOSAVE = "figure-editor/autosave";
const SAVES = "figure-editor/saves";       // the last 10 manual saves
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const snapStep = (p) => [Math.round(p[0]) || 0, Math.round(p[1]) || 0];
const snapModule = (p) => [2 * Math.round(p[0] / 2) || 0, 2 * Math.round(p[1] / 2) || 0];   // parts sit on whole modules
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const none = () => ({ elements: [], wires: [] });

const BUTTON = "btn btn-sm btn-outline-secondary";
const btn = (cmd, label, keys = "", extra = "") =>
  `<button type="button" class="${BUTTON}" data-cmd="${cmd}"${keys ? ` aria-keyshortcuts="${keys}" title="${label} (${keys.replace(/\+/g, "+")})"` : ""}${extra}>${label}</button>`;

export async function mount(root, options = {}) {
  const base = new URL(options.pack ?? "./symbol-pack/", document.baseURI);
  root.innerHTML = `<p class="fe-status" role="status">Loading the symbol pack…</p>`;
  let pack;
  try {
    pack = await loadPack(async (p) => {
      const r = await fetch(new URL(p, base));
      if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
      return r.text();
    });
  } catch (e) {
    root.innerHTML = `<p class="fe-status" role="alert">Could not load the symbol pack: ${esc(e.message)}</p>`;
    return null;
  }

  root.innerHTML = `
  <div class="fe">
    <div class="fe-toolbar" role="toolbar" aria-label="Figure editor">
      <div class="btn-group" role="group" aria-label="Tool">
        ${btn("select", "Select", "Escape", ' aria-pressed="true"')}${btn("wire", "Wire", "W", ' aria-pressed="false"')}
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
        ${btn("new", "New")}${btn("open", "Open…")}${btn("save", "Save", "Control+S")}${btn("export", "Export SVG")}
      </div>
      <input type="file" class="fe-file" accept=".json,application/json" hidden>
    </div>
    <div class="fe-main">
      <nav class="fe-palette" aria-label="Elements">
        <ul>${pack.types().map((t) => `<li><button type="button" class="fe-part" data-type="${esc(t)}" title="${esc(pack.def(t).description)}">${thumbnail(pack, t)}<span>${esc(t)}</span></button></li>`).join("")}</ul>
      </nav>
      <div class="fe-stage">
        <svg class="fe-canvas" tabindex="0" role="application" aria-label="Figure canvas" xmlns="http://www.w3.org/2000/svg"></svg>
      </div>
      <div class="fe-side" role="region" aria-label="Figure properties">
        <label class="form-label">Figure id <input class="form-control form-control-sm" name="fe-id" spellcheck="false"></label>
        <label class="form-label">Title <input class="form-control form-control-sm" name="fe-title"></label>
        <section class="fe-props" aria-label="Selection"></section>
        <section class="fe-warnings" aria-label="Warnings"><ul></ul></section>
      </div>
    </div>
    <p class="fe-status" role="status" aria-live="polite"></p>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const svg = $(".fe-canvas"), statusEl = $(".fe-status"), fileInput = $(".fe-file");
  const idInput = $('[name="fe-id"]'), titleInput = $('[name="fe-title"]');
  const view = createView(svg, pack);

  // ---- state ---------------------------------------------------------------------------
  let doc = D.newDoc();
  const history = new History();
  let selection = none();
  let tool = "select";               // select | wire | place
  let placing = null;                // {type, rotation, mirror}
  let wiring = null;                 // {from: target, fromAt, via: [...]}
  let drag = null;
  let pointer = null;                // last pointer position, grid steps
  let hover = null, ghost = null, rubber = null, boxSel = null;
  let clipboard = null, pasteCount = 0;
  let loadWarnings = [];
  let spaceHeld = false;
  let lastDrawing = null;
  let autosaveTimer = null;

  const status = (msg) => { statusEl.textContent = msg; };

  // ---- rendering -------------------------------------------------------------------------
  function render() {
    lastDrawing = view.render({ doc, selection, ghost, rubber, hover, box: boxSel });
    updateUI();
  }

  function updateUI() {
    const has = selection.elements.length + selection.wires.length > 0;
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
    root.querySelector('[data-cmd="select"]').setAttribute("aria-pressed", String(tool === "select"));
    root.querySelector('[data-cmd="wire"]').setAttribute("aria-pressed", String(tool === "wire"));
    svg.dataset.tool = tool;
    if (document.activeElement !== idInput) idInput.value = doc.id;
    if (document.activeElement !== titleInput) titleInput.value = doc.title ?? "";
    renderProps();
    const warnings = [...loadWarnings, ...D.lint(doc, pack)];
    $(".fe-warnings ul").innerHTML = warnings.map((w) => `<li>${esc(w)}</li>`).join("");
    $(".fe-warnings").hidden = !warnings.length;
  }

  function renderProps() {
    const el = selection.elements.length === 1 && !selection.wires.length && doc.elements.find((e) => e.id === selection.elements[0]);
    const w = selection.wires.length === 1 && !selection.elements.length && doc.wires.find((x) => x.id === selection.wires[0]);
    const end = (e) => (D.isPoint(e) ? `[${e.join(", ")}]` : e);
    let html;
    if (el) {
      const def = pack.def(el.type);
      html = `<dl>
        <dt>Element</dt><dd>${esc(el.id)}: ${esc(el.type)}</dd>
        <dd>${esc(def?.description ?? "")}</dd>
        <dt>Position</dt><dd>[${el.at.join(", ")}] grid steps</dd>
        <dt>Rotation</dt><dd>${el.rotation ?? 0}°</dd>
        <dt>Mirror</dt><dd>${pack.mirrorable(el.type) ? (el.mirror ? "on" : "off") : "not available: the symbol pack does not mark this element mirrorable"}</dd>
      </dl>`;
    } else if (w) {
      html = `<dl><dt>Wire</dt><dd>${esc(w.id)}: ${esc(end(w.from))} to ${esc(end(w.to))}</dd>
        <dt>Corners clicked</dt><dd>${(w.via ?? []).length}</dd></dl>`;
    } else if (selection.elements.length || selection.wires.length) {
      html = `<p>${count(selection.elements.length, "element")} and ${count(selection.wires.length, "wire")} selected</p>`;
    } else {
      html = `<p>${count(doc.elements.length, "element")}, ${count(doc.wires.length, "wire")}</p>`;
    }
    $(".fe-props").innerHTML = html;
  }

  // ---- editing ---------------------------------------------------------------------------
  function changed(msg) {
    render();
    if (msg) status(msg);
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => store.set(AUTOSAVE, D.serialize(doc, pack)), 800);
  }

  function prune() {
    const els = new Set(doc.elements.map((e) => e.id)), ws = new Set(doc.wires.map((w) => w.id));
    selection = { elements: selection.elements.filter((id) => els.has(id)), wires: selection.wires.filter((id) => ws.has(id)) };
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
    hover = null;
    render();
  }

  function startPlacing(type, viaKeyboard) {
    if (viaKeyboard) {
      // No pointer: place at the middle of the view and select it, so arrow keys can move it.
      const c = view.cam, at = snapModule([c.cx * 2, -c.cy * 2]);
      const r = D.addElement(doc, pack, type, at);
      commit(r.doc, `Placed ${r.id}. Arrow keys move it; R rotates.`);
      selection = { elements: [r.id], wires: [] };
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

  function endFor(t) {
    if (t.kind === "pin") return D.endpoint(doc, pack, t.ref);
    return { at: t.at, dir: null };
  }

  function wireTarget(p) {
    const h = hitTest(doc, pack, p).find((x) => x.kind !== "element");
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

  // ---- commands ----------------------------------------------------------------------------
  const commands = {
    select: () => { setTool("select"); status("Select: click or drag a box; drag to move."); },
    wire: () => { setTool("wire"); status("Wire: click a pin, junction, wire or empty grid point to start."); },
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
      if (!selection.elements.length && !selection.wires.length) return;
      const n = selection.elements.length + selection.wires.length;
      commit(D.deleteSelection(doc, pack, selection), `Deleted ${count(n, "item")}.`);
      selection = none();
      render();
    },
    undo() { const prev = history.undo(doc); if (prev) { doc = prev; prune(); changed("Undone."); } },
    redo() { const next = history.redo(doc); if (next) { doc = next; prune(); changed("Redone."); } },
    copy() {
      if (!selection.elements.length && !selection.wires.length) return;
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
    selectAll() { selection = { elements: doc.elements.map((e) => e.id), wires: doc.wires.map((w) => w.id) }; render(); },
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
    export() {
      download(exportSvg(doc, pack), `${doc.id}.svg`, "image/svg+xml");
      status(`Exported ${doc.id}.svg.`);
    },
  };

  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
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
    view.fit(lastDrawing?.box ?? null);
  }

  // ---- input -------------------------------------------------------------------------------
  root.querySelector(".fe-toolbar").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmd]");
    if (b && commands[b.dataset.cmd]) commands[b.dataset.cmd]();
  });
  root.querySelector(".fe-palette").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (b) startPlacing(b.dataset.type, e.detail === 0);
  });
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files[0];
    fileInput.value = "";
    if (!f) return;
    try { load(await f.text()); } catch (e) { status(`Could not open ${f.name}: ${e.message}`); }
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
      selection = { elements: [r.id], wires: [] };
      if (!e.shiftKey) setTool("select"); else render();
      return;
    }
    if (tool === "wire") { wireClick(p); return; }
    const hits = hitTest(doc, pack, p);
    let target = hits.find((h) => h.kind === "element" || h.kind === "wire");
    if (!target) { const pin = hits.find((h) => h.kind === "pin"); if (pin) target = { kind: "element", id: pin.ref.split(".")[0] }; }
    if (target) {
      const list = target.kind === "element" ? "elements" : "wires";
      const isSel = selection[list].includes(target.id);
      if (e.shiftKey) {
        selection = { ...selection, [list]: isSel ? selection[list].filter((x) => x !== target.id) : [...selection[list], target.id] };
      } else if (!isSel) {
        selection = { ...none(), [list]: [target.id] };
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
      selection = drag.add
        ? { elements: [...new Set([...drag.add.elements, ...got.elements])], wires: [...new Set([...drag.add.wires, ...got.wires])] }
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
    if (ctrl && k === "z" && !e.shiftKey) return run("undo");
    if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) return run("redo");
    if (ctrl && k === "c") return run("copy");
    if (ctrl && k === "v") return run("paste");
    if (ctrl && k === "a") return run("selectAll");
    if (ctrl && k === "s") return run("save");
    if (ctrl || e.altKey) return;
    if (e.target.closest("button") && (e.key === "Enter" || e.key === " ")) return;   // let buttons work
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
    if (k === "r") return run("rotate");
    if (k === "m") return run("mirror");
    if (k === "f") return run("fit");
    if (e.key === "Delete" || e.key === "Backspace") return run("delete");
    if (e.key === "+" || e.key === "=") return run("zoomin");
    if (e.key === "-") return run("zoomout");
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (arrows[e.key]) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      if (selection.elements.length || selection.wires.length) {
        const step = selection.elements.length ? 2 : 1;          // a module for parts; a grid step for wires alone
        commit(D.moveSelection(doc, pack, selection, [dx * step, dy * step]), "Moved.");
      } else view.panBy(-dx * 40, dy * 40);
    }
  });

  // ---- start ----------------------------------------------------------------------------------
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
  if (!opened && !saved) status("Pick an element on the left to place it, or press W to draw a wire.");

  return {
    get doc() { return doc; },
    load: (text) => load(text),
    exportSvg: () => exportSvg(doc, pack),
    save: () => D.serialize(doc, pack),
  };
}
