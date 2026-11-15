# Timing module

Stub (the Scribe writes the documentation).

One copy of the timing tool, used in two places (F18):
- the standalone Timing Diagram page, `tools/timing-diagram/index.qmd`;
- the Timing Diagram pane docked in the Figure Editor, `tools/figure-editor/`.

**API**
- `mount(element, { docked, onSend })` from `src/app.js`. `docked: true` uses the compact pane layout;
  `onSend` is called after "Send to frame". Returns `{ render, setCircuit(text), source, last }`.
- `drawTiming(value, options)` from `src/draw.js`: WaveDrom-format source in, vector SVG text out (DOM-free).

**Command**

```
quarto run tools/timing/test/run.js
```
