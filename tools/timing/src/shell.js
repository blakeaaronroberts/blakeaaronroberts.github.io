// The timing tool's two layouts. Both carry the same hooks (classes, data-do, data-size), so app.js drives either one.
// pageShell: the standalone Timing Diagram page (the Figure Editor's shell, editor.css). dockShell: the pane docked in the
// Figure Editor. In both, the middle is two swappable views: Edit (the step editor) and Diagram (the drawing).

const views = (B) => `
      <div class="td-tabs" role="tablist" aria-label="View">
        <button type="button" class="${B}" role="tab" data-view="edit" aria-selected="true">Edit</button>
        <button type="button" class="${B}" role="tab" data-view="diagram" aria-selected="false">Diagram</button>
        <button type="button" class="${B}" role="tab" data-view="source" aria-selected="false" title="The diagram as WaveDrom source: copy it out, or paste one in">WaveDrom source</button>
      </div>
      <div class="td-edit" role="tabpanel" aria-label="Edit the steps">
        <div class="td-addbar"><span class="label-mono">Add a node</span><span class="td-chips"></span><button type="button" class="td-chip" data-do="add-all">All</button><button type="button" class="td-chip" data-do="add-custom">Other…</button><button type="button" class="td-chip" data-do="add-spacer" title="An empty lane between signals">Spacer</button></div>
        <p class="td-flag" role="status"></p>
        <div class="td-brushes" role="toolbar" aria-label="What a click on a step sets"></div>
        <div class="td-grid"></div>
        <div class="td-stepsbar"><span class="label-mono">Steps</span><button type="button" class="${B}" data-do="steps-" aria-label="Fewer steps">−</button><span class="td-nsteps"></span><button type="button" class="${B}" data-do="steps+" aria-label="More steps">+</button>
          <span class="fe-hint">Cycle: a click steps through 0, 1, X, Z, data; right-click goes back. Shift-click holds the step before. Double-click a data step to label it. ⚙ on a signal sets its period, phase and group.</span></div>
        <div class="td-edges"></div>
      </div>
      <div class="td-view" role="tabpanel" aria-label="Diagram" hidden><div id="WaveDrom_Display_0"></div></div>
      <div class="td-source" role="tabpanel" aria-label="WaveDrom source" hidden>
        <textarea class="form-control td-srctext" spellcheck="false" aria-label="WaveDrom source"></textarea>
        <div class="fe-theme-buttons"><button type="button" class="${B}" data-do="src-apply">Use this source</button><button type="button" class="${B}" data-do="src-copy">Copy</button><span class="fe-hint">Any WaveDrom diagram: paste one in and press Use this source.</span></div>
      </div>`;

const bandPane = () => `
        <details class="fe-pane"><summary class="label-mono">Head and foot</summary><div class="td-pad">
          ${["head", "foot"].map((b) => `<fieldset class="td-band"><legend class="label-mono">${b === "head" ? "Head" : "Foot"}</legend>
            <label class="form-label">Text <input class="form-control form-control-sm" data-band="${b}" data-key="text"></label>
            <label class="form-label">Number step edges from <input class="form-control form-control-sm" type="number" data-band="${b}" data-key="tick" placeholder="none"></label>
            <label class="form-check"><input class="form-check-input" type="checkbox" data-band="${b}" data-key="tock"> <span class="form-check-label">Number the steps (middles)</span></label>
            <label class="form-label">Number every <input class="form-control form-control-sm" type="number" min="1" step="1" data-band="${b}" data-key="every"></label></fieldset>`).join("")}
        </div></details>`;

const sizePane = (B) => `
        <details class="fe-pane"><summary class="label-mono">Size</summary><div class="td-pad">
          <label class="form-label">Width (px) <input class="form-control form-control-sm" type="number" min="100" max="4000" step="10" data-size="w"></label>
          <label class="form-label">Height (px) <input class="form-control form-control-sm" type="number" min="40" max="4000" step="10" data-size="h"></label>
          <label class="form-label">Step width (WaveDrom hscale) <input class="form-control form-control-sm" type="number" min="0.25" max="8" step="0.25" data-size="hscale"></label>
          <div class="fe-theme-buttons"><button type="button" class="${B}" data-do="natural">Natural size</button></div>
        </div></details>`;
const framesPane = (B) => `
        <details class="fe-pane td-frames" open hidden><summary class="label-mono">Frames</summary><div class="td-pad"><label class="form-label">Frame <select class="form-select form-select-sm" data-do="frame"></select></label><div class="fe-theme-buttons"><button type="button" class="${B}" data-do="frames-export">Export frames</button></div></div></details>`;
const credit = `<p class="fe-hint td-credit">Source format based on <a href="https://wavedrom.com">WaveDrom</a>. The drawing is this site's own code.</p>`;

export const pageShell = (B) => `
    <div class="fe-toolbar">
      <div class="fe-group">
        <button type="button" class="${B}" data-do="export">Export SVG</button>
        <button type="button" class="${B}" data-do="export-png" title="PNG at 300 dpi">Export PNG</button>
        <label class="${B} td-file">Open circuit…<input type="file" accept=".json,application/json" data-do="open" hidden></label>
      </div>
      <div class="fe-group fe-group-end"><a class="btn btn-sm fe-btn" aria-pressed="false" href="../figure-editor/">Figure Editor</a><a class="btn btn-sm fe-btn" aria-pressed="true" aria-current="page" href="./">Timing Diagram</a></div>
    </div>
    <div class="fe-palette">${sizePane(B)}${bandPane()}${framesPane(B)}</div>
    <main class="td-center">${views(B)}</main>
    <div class="fe-side">
      <details class="fe-pane" open>
        <summary class="label-mono">Slide</summary>
        <div class="td-pad">
          <div class="fe-theme-buttons"><button type="button" class="${B}" data-do="fit-slide" title="Size the diagram to the timing region of the Figure Editor's slide">Fit to slide</button><button type="button" class="${B}" data-do="send" title="Send this diagram to the Figure Editor's slide">Send to Figure Editor</button></div>
          <p class="fe-hint">Send also fills the editor's frames from the steps.</p>
        </div>
      </details>
      <details class="fe-pane" open><summary class="label-mono">About</summary><div class="td-pad">${credit}</div></details>
    </div>
    <p class="fe-status td-status" role="status" aria-live="polite"></p>`;

export const dockShell = (B) => `
    <div class="td-dockbar">
      <button type="button" class="${B}" data-do="export">Export SVG</button>
      <button type="button" class="${B}" data-do="export-png" title="PNG at 300 dpi">Export PNG</button>
      <label class="${B} td-file">Open circuit…<input type="file" accept=".json,application/json" data-do="open" hidden></label>
      <button type="button" class="${B}" data-do="fit-slide" title="Size the diagram to the timing region of the slide">Fit to slide</button>
      <button type="button" class="${B}" data-do="send" title="Put this diagram on the slide and fill the frames from its steps">Send to slide</button>
      <p class="fe-status td-status" role="status" aria-live="polite"></p>
    </div>
    <div class="td-dockbody">
      <div class="td-center">${views(B)}</div>
      <div class="td-dockside">${sizePane(B)}${bandPane()}${framesPane(B)}<div class="td-pad">${credit}</div></div>
    </div>`;
