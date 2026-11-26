// U1.4: the parts of the first-run help that touch the page: toolbar tooltips, the toast and the tour's spotlight and popover.
// What the steps say and when the tour starts is in tour.js (tested). Colours come from the site's roles in editor.css.

import { tipText } from "./tour.js";

const el = (tag, cls, html = "") => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Tooltips for every `[data-tip]` button inside `root`: on hover and on keyboard focus, with the keys from aria-keyshortcuts. */
export function tooltips(root) {
  const tip = el("div", "fe-tip");
  tip.setAttribute("role", "tooltip"); tip.hidden = true;
  root.append(tip);
  let on = null;
  const show = (b) => {
    const { label, keys } = tipText(b.dataset.tip, b.getAttribute("aria-keyshortcuts"));
    tip.innerHTML = `<span>${esc(label)}</span>${keys.map((k) => `<kbd>${esc(k)}</kbd>`).join("")}`;
    tip.hidden = false; on = b;
    const r = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.max(4, Math.min(innerWidth - w - 4, r.left + r.width / 2 - w / 2))}px`;
    // U1.5: a toolbar button's tip hangs from the toolbar's lower edge; a button with no room below it (the status bar's) gets it above
    const bar = b.closest(".fe-toolbar"), below = bar ? bar.getBoundingClientRect().bottom : r.bottom + 2;
    tip.style.top = `${below + h > innerHeight ? r.top - h - 4 : below}px`;
  };
  const hide = () => { tip.hidden = true; on = null; };
  const target = (e) => e.target.closest?.("[data-tip]");
  root.addEventListener("mouseover", (e) => { const b = target(e); if (b && b !== on) show(b); });
  root.addEventListener("mouseout", (e) => { const b = target(e); if (b && !b.contains(e.relatedTarget)) hide(); });
  root.addEventListener("focusin", (e) => { const b = target(e); if (b && b.matches(":focus-visible")) show(b); });
  root.addEventListener("focusout", hide);
  root.addEventListener("click", hide);
  root.addEventListener("keydown", (e) => { if (e.key === "Escape" && !tip.hidden) hide(); }, true);
}

/** A short message at the bottom of the editor; role="status" so it is read aloud. */
export function createToast(toastEl, ms = 3800) {
  let timer = 0;
  return (text) => {
    clearTimeout(timer);
    toastEl.innerHTML = `${esc(text)} <kbd aria-hidden="true">?</kbd>`;
    toastEl.hidden = false;
    timer = setTimeout(() => { toastEl.hidden = true; }, ms);
  };
}

/**
 * The tour's spotlight and popover. `tour` is a createTour() state; `run(cmd)` runs an editor command (a step's extra
 * button); `onEnd(how)` hears "done" or "skipped". The spotlight never catches clicks, so the target stays usable.
 */
export function createTourUi({ root, tour, run, onEnd, onChange = () => {} }) {
  const spot = el("div", "fe-tour-spot"), pop = el("div", "fe-tour-pop");
  const layer = el("div", "fe-tour"); layer.hidden = true;
  pop.setAttribute("role", "dialog"); pop.setAttribute("aria-labelledby", "fe-tour-title"); pop.setAttribute("aria-describedby", "fe-tour-body");
  layer.append(spot, pop);
  root.append(layer);

  const place = () => {
    const s = tour.step; if (!s) return;
    let t = root.querySelector(s.target);
    let r = t?.getBoundingClientRect();
    if (!r || (!r.width && !r.height)) r = { left: innerWidth / 2 - 80, top: innerHeight / 2 - 40, width: 160, height: 80, right: innerWidth / 2 + 80, bottom: innerHeight / 2 + 40 };
    const pad = 2, pw = pop.offsetWidth || 300, ph = pop.offsetHeight || 160;
    Object.assign(spot.style, { left: `${r.left + pad}px`, top: `${r.top + pad}px`, width: `${Math.max(0, r.width - 2 * pad)}px`, height: `${Math.max(0, r.height - 2 * pad)}px` });
    let x, y;
    if (s.place === "right") { x = r.right + 16; y = r.top + 80; }
    else if (s.place === "above") { x = r.left + 24; y = r.top - 14 - ph; }
    else if (s.place === "center") { x = r.left + r.width / 2 - pw / 2; y = r.top + r.height / 2 - ph / 2; }
    else { x = r.right - pw; y = r.bottom + 14; }
    pop.style.left = `${Math.max(8, Math.min(innerWidth - pw - 8, x))}px`;
    pop.style.top = `${Math.max(8, Math.min(innerHeight - ph - 8, y))}px`;
  };

  const render = () => {
    const s = tour.step;
    layer.hidden = !s;
    onChange(tour);
    if (!s) return;
    const bars = Array.from({ length: tour.total }, (_, i) => `<i${i < tour.index ? " data-on" : ""}></i>`).join("");
    pop.innerHTML = `
      <div class="fe-tour-head"><span class="label-mono">${tour.index} / ${tour.total}</span><span class="fe-tour-bars" aria-hidden="true">${bars}</span><button type="button" class="fe-tour-skip" data-tour="skip">Skip tour</button></div>
      <h3 id="fe-tour-title">${esc(s.title)}</h3>
      <p id="fe-tour-body">${esc(s.body)}</p>
      <div class="fe-tour-foot">
        ${tour.index > 1 ? `<button type="button" class="btn btn-sm fe-btn" data-tour="back">Back</button>` : ""}
        ${s.action ? `<button type="button" class="btn btn-sm fe-btn" data-tour="action">${esc(s.actionLabel)}</button>` : ""}
        <button type="button" class="btn btn-sm fe-btn fe-tour-next" data-tour="next">${tour.isLast ? "Done" : "Next"} <span aria-hidden="true">↵</span></button>
      </div>`;
    place();
    pop.querySelector(".fe-tour-next").focus({ preventScroll: true });
  };

  const end = (how) => { render(); if (how) onEnd(how); };
  pop.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tour]"); if (!b) return;
    const what = b.dataset.tour;
    if (what === "skip") end(tour.skip());
    else if (what === "back") { tour.back(); render(); }
    else if (what === "action") { run(tour.step.action); place(); }
    else if (what === "next") { const how = tour.next(); how === "done" ? end(how) : render(); }
  });
  // Enter is Next and Esc is Skip while the tour runs; the editor's own keys do not see them. The arrow keys are left alone.
  root.addEventListener("keydown", (e) => {
    if (!tour.active) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(tour.skip()); }
    else if (e.key === "Enter" && (e.target.matches('[data-tour="next"]') || !e.target.closest("button, input, textarea, select, summary"))) { e.preventDefault(); e.stopPropagation(); const how = tour.next(); how === "done" ? end(how) : render(); }
  }, true);
  addEventListener("resize", () => { if (tour.active) place(); });
  return { start() { tour.start(); render(); }, refresh: () => { if (tour.active) place(); }, get running() { return tour.active; } };
}
