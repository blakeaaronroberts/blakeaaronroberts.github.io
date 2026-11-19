# Figure Editor

Stub (the Scribe writes the documentation).

The composite (R1): the Schematic Editor (`tools/schematic-editor/`) and the Timing Diagram (`tools/timing/`), with
slide export, ZIP export and the LaTeX truth table. It reaches the other tools only through their `src/index.js`.

**API:** `mount(element, { pack, open })` from `src/index.js`; the shared interface in `tools/shared/src/tool.js`.
Saved work lives under `figure-editor/*`; the timing diagram under `timing-diagram/*`, shared with the Timing Diagram page.

**Commands**

```
quarto run tools/figure-editor/test/run.js
quarto run tools/figure-editor/test/browser/check.js
```
