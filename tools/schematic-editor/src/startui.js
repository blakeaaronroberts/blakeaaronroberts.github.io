// U1.1: the start chooser's dialog. It only builds the dialog and reports the choice; app.js does what each choice means.
// Choices come from start.js (keys 1, 2, 3; Escape and the close button are Empty figure). "Open…" swaps the dialog's body
// for a drop zone: a dropped file goes to `onFile`, "Choose file…" to `pickFile` (the editor's own file input).

import { CHOICES, choiceForKey } from "./start.js";

const TEXT = {
  example: ["Full adder example", "Eight frames and a timing diagram"],
  empty: ["Empty figure", "Place elements, press W to wire"],
  open: ["Open…", "A saved .json or an SVG"],
};

export function createStartChooser({ root, buttonClass, exampleSrc, openIcon, choose, onFile, pickFile }) {
  const option = ({ id, key }) => `
    <button type="button" class="fe-start-option" data-start="${id}" aria-keyshortcuts="${key}">
      <span class="fe-start-preview fe-start-preview-${id}" aria-hidden="true">${id === "example" ? `<img src="${exampleSrc}" alt="">` : id === "open" ? `<svg class="fe-icon" viewBox="0 0 16 16" focusable="false">${openIcon}</svg>` : ""}</span>
      <span class="fe-start-text"><strong>${TEXT[id][0]}</strong><span>${TEXT[id][1]}</span></span>
      <kbd class="fe-start-key" aria-hidden="true">${key}</kbd>
      ${id === "example" ? `<span class="fe-start-tag">Recommended</span>` : ""}
    </button>`;
  root.insertAdjacentHTML("beforeend", `
    <dialog class="fe-start" aria-labelledby="fe-start-title">
      <div class="fe-start-choose">
        <div class="fe-start-head">
          <h2 id="fe-start-title">Start a figure</h2>
          <button type="button" class="fe-start-close" data-start="empty" aria-label="Close">✕</button>
        </div>
        <p class="fe-start-intro">Autosave stays in this browser; use Save to take a figure to another computer.</p>
        <div class="fe-start-options">${CHOICES.map(option).join("")}</div>
      </div>
      <div class="fe-start-drop" hidden>
        <h2 id="fe-start-drop-title">Drop a figure here</h2>
        <p>A saved figure (.json) or an SVG</p>
        <div class="fe-start-actions">
          <button type="button" class="${buttonClass} fe-start-pick">Choose file…</button>
          <button type="button" class="${buttonClass} fe-start-back">Back</button>
        </div>
      </div>
    </dialog>`);
  const dialog = root.querySelector(".fe-start");
  const choosePane = dialog.querySelector(".fe-start-choose"), dropPane = dialog.querySelector(".fe-start-drop");
  const first = () => dialog.querySelector('.fe-start-option[data-start="example"]');
  const show = (drop) => {
    choosePane.hidden = drop; dropPane.hidden = !drop;
    dialog.setAttribute("aria-labelledby", drop ? "fe-start-drop-title" : "fe-start-title");
  };
  const pick = (id) => {
    if (id === "open") { show(true); dropPane.querySelector(".fe-start-pick").focus(); choose("open"); return; }
    dialog.close();
    choose(id);
  };

  dialog.addEventListener("click", (e) => { const b = e.target.closest("[data-start]"); if (b) pick(b.dataset.start); });
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); pick("empty"); });   // Escape
  dialog.addEventListener("keydown", (e) => {
    e.stopPropagation();   // the editor's own keys (W, P, 0 1 X Z, ?) stay quiet while the dialog is up
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const id = choiceForKey(e.key);
    if (id && e.key !== "Escape") { e.preventDefault(); pick(id); }
  });
  dropPane.querySelector(".fe-start-pick").addEventListener("click", pickFile);
  dropPane.querySelector(".fe-start-back").addEventListener("click", () => { show(false); first().focus(); });
  dropPane.addEventListener("dragover", (e) => { e.preventDefault(); dropPane.dataset.over = ""; });
  dropPane.addEventListener("dragleave", () => { delete dropPane.dataset.over; });
  dropPane.addEventListener("drop", (e) => {
    e.preventDefault(); delete dropPane.dataset.over;
    const f = e.dataTransfer?.files?.[0];
    if (f) { dialog.close(); onFile(f); }
  });

  return {
    open() { show(false); dialog.showModal(); first().focus(); },
    close() { if (dialog.open) dialog.close(); },
    get isOpen() { return dialog.open; },
  };
}
