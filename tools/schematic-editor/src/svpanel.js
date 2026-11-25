// The Import SystemVerilog panel (F22.1b): paste or open .sv files, pick the top module, see the problems with their lines, and
// replace the figure after a confirm (one Undo brings the old figure back). The work is svjob.js's: a Worker, 20 seconds, 200 KB.
// The panel only builds the dialog and keeps its state; the editor gives it `replace(circuitText)` (an undoable load).

import { MAX_INPUT_BYTES, candidateTops, formatProblem, prepareFiles, runImport } from "../../shared/src/svjob.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The character range of line `line` (1-based) in `text`: [start, end). */
export function lineRange(text, line) {
  let start = 0;
  for (let n = 1; n < line; n++) { const i = text.indexOf("\n", start); if (i < 0) return [text.length, text.length]; start = i + 1; }
  const end = text.indexOf("\n", start);
  return [start, end < 0 ? text.length : end];
}

export function createSvPanel({ root, buttonClass, replace, run = runImport }) {
  let dialog = null, el = null;
  const state = { files: [{ name: "pasted.sv", text: "" }], current: 0, result: null, token: 0, keys: [] };

  const build = () => {
    root.insertAdjacentHTML("beforeend", `
      <dialog class="fe-sv-dialog" aria-labelledby="fe-sv-title">
        <h2 id="fe-sv-title">Import SystemVerilog</h2>
        <p class="fe-sv-note">The import runs in this browser; nothing is uploaded. Structural code only for now: <code>always</code> blocks are reported with their line, not imported. The limit is ${MAX_INPUT_BYTES / 1024} KB in all.</p>
        <div class="fe-sv-bar">
          <button type="button" class="${buttonClass} fe-sv-open">Open .sv…</button>
          <input type="file" class="fe-sv-file" accept=".sv,.v,.svh,.vh,text/plain" multiple hidden>
          <label class="fe-sv-which-label" hidden>File <select class="fe-sv-which"></select></label>
          <label>Top module <select class="fe-sv-top"><option value="">automatic</option></select></label>
        </div>
        <textarea class="fe-sv-text" spellcheck="false" rows="14" aria-label="SystemVerilog source" placeholder="Paste SystemVerilog here, or open a .sv file."></textarea>
        <p class="fe-sv-status" role="status" aria-live="polite"></p>
        <ol class="fe-sv-problems"></ol>
        <p class="fe-sv-confirm" hidden></p>
        <div class="fe-sv-actions">
          <button type="button" class="${buttonClass} fe-sv-run">Import</button>
          <button type="button" class="${buttonClass} fe-sv-replace" hidden>Replace the figure</button>
          <button type="button" class="${buttonClass} fe-sv-close">Close</button>
        </div>
      </dialog>`);
    dialog = root.querySelector(".fe-sv-dialog");
    const q = (s) => dialog.querySelector(s);
    el = { text: q(".fe-sv-text"), status: q(".fe-sv-status"), problems: q(".fe-sv-problems"), top: q(".fe-sv-top"), which: q(".fe-sv-which"),
      whichLabel: q(".fe-sv-which-label"), file: q(".fe-sv-file"), run: q(".fe-sv-run"), replace: q(".fe-sv-replace"), confirm: q(".fe-sv-confirm") };

    el.text.addEventListener("input", () => { state.files[state.current].text = el.text.value; invalidate(); });
    el.top.addEventListener("change", invalidate);
    el.which.addEventListener("change", () => { state.current = Number(el.which.value); el.text.value = state.files[state.current].text; });
    q(".fe-sv-open").addEventListener("click", () => el.file.click());
    el.file.addEventListener("change", openFiles);
    el.run.addEventListener("click", importNow);
    el.replace.addEventListener("click", replaceNow);
    q(".fe-sv-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => { state.token++; });   // an answer that arrives after the panel is closed is dropped
    el.problems.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-key]");
      if (b) showLine(b.dataset.key, Number(b.dataset.line));
    });
  };

  const say = (text, error = false) => { el.status.textContent = text; el.status.classList.toggle("fe-sv-error", error); };
  const listFiles = () => {
    el.which.innerHTML = state.files.map((f, i) => `<option value="${i}"${i === state.current ? " selected" : ""}>${esc(f.name)}</option>`).join("");
    el.whichLabel.hidden = state.files.length < 2;
  };
  /** Anything the result depended on changed: the confirm goes away, the problems stay until the next run. */
  function invalidate() { state.result = null; el.replace.hidden = true; el.confirm.hidden = true; }

  async function openFiles() {
    const chosen = [...el.file.files];
    el.file.value = "";
    if (!chosen.length) return;
    const big = chosen.find((f) => f.size > MAX_INPUT_BYTES);
    if (big) { say(`${big.name} is too large: ${Math.ceil(big.size / 1024)} KB, and the limit is ${MAX_INPUT_BYTES / 1024} KB in all.`, true); return; }
    state.files = await Promise.all(chosen.map(async (f) => ({ name: f.name, text: await f.text() })));
    state.current = 0;
    el.text.value = state.files[0].text;
    listFiles(); invalidate();
    el.problems.innerHTML = "";
    say(`Opened ${state.files.map((f) => f.name).join(", ")}.`);
  }

  function showLine(key, line) {
    const i = state.keys.indexOf(key);
    if (i >= 0 && i !== state.current) { state.current = i; el.text.value = state.files[i].text; listFiles(); }
    const [a, b] = lineRange(el.text.value, line);
    el.text.focus();
    el.text.setSelectionRange(a, b);
    const lineHeight = parseFloat(getComputedStyle(el.text).lineHeight) || 18;
    el.text.scrollTop = Math.max(0, (line - 3) * lineHeight);
  }

  function showProblems(problems) {
    el.problems.innerHTML = problems.map((p) => {
      const text = esc(formatProblem(p));
      return p.file && p.line ? `<li><button type="button" class="fe-sv-problem" data-key="${esc(p.file)}" data-line="${p.line}" title="Select this line">${text}</button></li>` : `<li>${text}</li>`;
    }).join("");
  }

  function fillTops(names, chosen) {
    el.top.innerHTML = `<option value="">automatic</option>` + names.map((n) => `<option value="${esc(n)}"${n === chosen ? " selected" : ""}>${esc(n)}</option>`).join("");
  }

  async function importNow() {
    const prepared = prepareFiles(state.files);
    state.keys = prepared.files ? Object.keys(prepared.files) : [];
    el.problems.innerHTML = "";
    invalidate();
    if (prepared.error) { say(prepared.error, true); return; }
    const token = ++state.token;
    el.run.disabled = true;
    say("Importing…");
    const top = el.top.value || undefined;
    const r = await run(prepared.files, { top });
    if (token !== state.token) return;
    el.run.disabled = false;
    if (!r.circuit) {
      showProblems(r.problems);
      const tops = candidateTops(r.problems);
      if (tops.length) { fillTops(tops, null); say("More than one module could be the top. Choose one, then import again.", true); }
      else say(`${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}; nothing was imported.`, true);
      return;
    }
    state.result = r.circuit;
    const modules = Object.keys(r.circuit.modules ?? {});
    fillTops([r.circuit.id, ...modules].filter((n, i, a) => n && a.indexOf(n) === i), top ?? null);
    showProblems(r.problems);
    say(`Imported ${r.circuit.id}: ${r.circuit.elements.length} elements${modules.length ? `, ${modules.length} module${modules.length === 1 ? "" : "s"}` : ""}.`);
    el.confirm.textContent = "Replace the figure with this circuit? The current figure is replaced; Undo (Ctrl+Z) brings it back.";
    el.confirm.hidden = false;
    el.replace.hidden = false;
  }

  function replaceNow() {
    if (!state.result) return;
    try {
      replace(JSON.stringify(state.result, null, 2) + "\n");
      dialog.close();
    } catch (e) { say(`The figure could not be replaced: ${e.message}`, true); }
  }

  return {
    open() {
      if (!dialog) build();
      listFiles();
      dialog.showModal();
      el.text.focus();
    },
  };
}
