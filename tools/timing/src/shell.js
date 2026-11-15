// The timing tool's two layouts. Both carry the same hooks (classes, data-do, data-size), so app.js drives either one.
// pageShell: the standalone Timing Diagram page (the Figure Editor's shell, editor.css). dockShell: the pane docked in the Figure Editor.

export const pageShell = (B) => `
    <div class="fe-toolbar">
      <div class="fe-group">
        <button type="button" class="${B}" data-do="tidy">Tidy</button>
        <button type="button" class="${B}" data-do="export">Export SVG</button>
        <button type="button" class="${B}" data-do="export-png" title="PNG at 300 dpi">Export PNG</button>
        <label class="${B} td-file">Open circuit…<input type="file" accept=".json,application/json" data-do="open" hidden></label>
      </div>
      <div class="fe-group fe-group-end"><a class="btn btn-sm fe-btn" aria-pressed="false" href="../figure-editor/">Figure Editor</a><a class="btn btn-sm fe-btn" aria-pressed="true" aria-current="page" href="./">Timing Diagram</a></div>
    </div>
    <div class="fe-palette">
      <details class="fe-pane" open>
        <summary class="label-mono">Size</summary>
        <div class="td-pad">
          <label class="form-label">Width (px) <input class="form-control form-control-sm" type="number" min="100" max="4000" step="10" data-size="w"></label>
          <label class="form-label">Height (px) <input class="form-control form-control-sm" type="number" min="40" max="4000" step="10" data-size="h"></label>
          <div class="fe-theme-buttons"><button type="button" class="${B}" data-do="natural">Natural size</button></div>
        </div>
      </details>
      <details class="fe-pane td-nodes" open hidden>
        <summary class="label-mono td-nodes-title">Nodes</summary>
        <div class="td-pad"><div class="td-chips"></div><button type="button" data-do="add-all" class="td-chip">Add starter lines for all</button><div class="td-flag" role="status"></div></div>
      </details>
    </div>
    <main class="td-center">
      <textarea class="td-src form-control" spellcheck="false" aria-label="WaveDrom source"></textarea>
      <div class="td-view"><div id="WaveDrom_Display_0"></div></div>
    </main>
    <div class="fe-side">
      <details class="fe-pane" open>
        <summary class="label-mono">Slide</summary>
        <div class="td-pad">
          <div class="fe-theme-buttons"><button type="button" class="${B}" data-do="fit-slide" title="Size the diagram to the timing part of the editor's slide frame">Fit to slide</button><button type="button" class="${B}" data-do="send" title="Send this diagram to the Figure Editor's slide frame">Send to schematic</button></div>
          <p class="fe-hint">Send also fills the editor's frames from the steps.</p>
        </div>
      </details>
      <details class="fe-pane" open>
        <summary class="label-mono">Delay</summary>
        <div class="td-pad td-delays"></div>
      </details>
      <details class="fe-pane td-frames" open hidden>
        <summary class="label-mono">Frames</summary>
        <div class="td-pad"><label class="form-label">Frame <select class="form-select form-select-sm" data-do="frame"></select></label><div class="fe-theme-buttons"><button type="button" class="${B}" data-do="frames-export">Export frames</button></div></div>
      </details>
      <details class="fe-pane" open>
        <summary class="label-mono">About</summary>
        <div class="td-pad"><p class="fe-hint td-credit">Source format based on <a href="https://wavedrom.com">WaveDrom</a>. The drawing is this site's own code.</p></div>
      </details>
    </div>
    <p class="fe-status td-status" role="status" aria-live="polite"></p>`;

export const dockShell = (B) => `
    <div class="td-dockbar">
      <button type="button" class="${B}" data-do="tidy">Tidy</button>
      <button type="button" class="${B}" data-do="export">Export SVG</button>
      <button type="button" class="${B}" data-do="export-png" title="PNG at 300 dpi">Export PNG</button>
      <label class="${B} td-file">Open circuit…<input type="file" accept=".json,application/json" data-do="open" hidden></label>
      <button type="button" class="${B}" data-do="fit-slide" title="Size the diagram to the timing part of the slide frame">Fit to slide</button>
      <button type="button" class="${B}" data-do="send" title="Put this diagram in the slide frame and fill the frames from its steps">Send to frame</button>
      <p class="fe-status td-status" role="status" aria-live="polite"></p>
    </div>
    <div class="td-dockbody">
      <textarea class="td-src form-control" spellcheck="false" aria-label="WaveDrom source"></textarea>
      <div class="td-view"><div id="WaveDrom_Display_0"></div></div>
      <div class="td-dockside">
        <details class="fe-pane"><summary class="label-mono">Size</summary><div class="td-pad">
          <label class="form-label">Width (px) <input class="form-control form-control-sm" type="number" min="100" max="4000" step="10" data-size="w"></label>
          <label class="form-label">Height (px) <input class="form-control form-control-sm" type="number" min="40" max="4000" step="10" data-size="h"></label>
          <div class="fe-theme-buttons"><button type="button" class="${B}" data-do="natural">Natural size</button></div>
        </div></details>
        <details class="fe-pane"><summary class="label-mono">Delay</summary><div class="td-pad td-delays"></div></details>
        <details class="fe-pane td-frames" hidden><summary class="label-mono">Frames</summary><div class="td-pad"><label class="form-label">Frame <select class="form-select form-select-sm" data-do="frame"></select></label><div class="fe-theme-buttons"><button type="button" class="${B}" data-do="frames-export">Export frames</button></div></div></details>
        <details class="fe-pane td-nodes" hidden><summary class="label-mono td-nodes-title">Nodes</summary><div class="td-pad"><div class="td-chips"></div><button type="button" data-do="add-all" class="td-chip">Add starter lines for all</button><div class="td-flag" role="status"></div></div></details>
        <p class="fe-hint td-credit td-pad">Source format based on <a href="https://wavedrom.com">WaveDrom</a>. The drawing is this site's own code.</p>
      </div>
    </div>`;
