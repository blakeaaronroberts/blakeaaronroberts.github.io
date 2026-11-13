# Proposal: figure editor (F1.1)

Status: approved by Blake, 2026-11-12, with the decisions in section 10. Batch F1 in `docs/STEWARD_HANDOFF.md`;
VISION.md §6 (target 0) and §7 (web-tool structure). No code until this plan is approved.

**Goal.** A page at `tools/figure-editor/` (unlisted, `noindex`). You place symbol-pack
elements on the grid, draw orthogonal wires that stay on their pins, save the figure as
circuit-schema JSON and export a real-size SVG (copy as PNG comes in F3). It uses plain
ES modules and SVG, with no build step and no framework.

**What exists today** (checked 2026-11-12; toolbox at `2c5f21d`):
- **No symbol pack yet.** The export is item H-M004, not built. The 22 elements in
  `manimations/exports/elements/` have no pin data.
- **`circuit-model`** is public and empty: no files, tags or releases.
- **The schema is v0.1**, with no mirroring.
- **`style.toml`** has no `unknown` or `floating` colour roles yet.

## 1. Data model
- The document in memory *is* a schema object: `elements`, `ports`, `wires`,
  `junctions`, `labels`.
- **New for v0.2**, to be agreed in `circuit-model`, not invented here:
  - `mirror: true` flips an element about its local vertical axis, applied before
    `rotation`.
  - `level` on a wire (F3).
- **Nets are derived on save, never edited.** A union-find runs over pin tips, ports
  and junctions, joined by wires, taps and touching tips, so "drawing realises the
  nets" (lint 4) always holds.
- **Routed corners, junction counts and joints are recomputed** from the document and
  never stored.
- **Coordinates:** integer grid steps with y pointing up. The view flips y once, at
  render time.

## 2. Wires: anchoring and rubber-banding
- **Ends** are references: `"el.pin"`, a port id, a junction id, or a free end
  `[x, y]`.
- **Drawing a wire (W):**
  - Each click adds a corner, constrained to horizontal or vertical moves.
  - Clicked corners are stored as `via`.
  - The final click on a pin, port or wire sets `to`.
- **Corners** come from a JavaScript port of `route()` (`manimations/toolbox/wire.py`):
  - a wire leaves a pin along its direction
  - each leg is one L or one grid-snapped Z
  - each waypoint is a turn
- **When parts move:**
  - Wire ends follow their pin tips, and the router redraws the first and last legs.
  - A wire's corners move only when the whole wire is in the moved selection.
- **Lint warnings** (never blocking):
  - a wire running through an element
  - a wire leaving or entering a pin from behind

## 3. Junctions
- **Creating one:** ending a wire on another wire adds `junctions[] {on, at}`, and the
  new wire ends at that junction's id.
- **Dot rule, as in the toolbox:** a tap counts 2 and each wire ending there adds 1.
  The dot appears at 4 or more, so a T-junction has none.
- **Crossings:** wires that cross without a junction are not connected and get no dot.
- **After a reroute:** if moving a part reroutes the tapped wire so `at` falls off it,
  the junction moves to the nearest grid point on the new route.
- **Line-end joints** match `Circuit._line_end`: a full dot at corners, and a seam
  patch where two lines meet in a straight line.

## 4. Undo
- **Snapshot history:** each finished command pushes a frozen copy of the document,
  keeping about 200 levels.
- **Drags** count as one step.
- **Redo** is cleared by any new edit.
- **Autosave** writes to `localStorage` after a short pause and keeps the last 10
  manual saves.

## 5. Symbol pack
- **Loading:** `index.json` (types and statuses) and `theme.json` (roles, line width,
  grid) are fetched at startup; `<type>.json` and `.svg` on first use.
- **Bodies** become `<symbol>`s.
- **Leads** are drawn from pin data, like wires, so they can be coloured by logic level.
- **Palette:** approved elements, plus a "Show drafts" switch.
- **No colours or sizes in editor code.** Every one comes from `theme.json` or from a
  private theme loaded from a file and kept only in the browser.
- **`symbol-pack/`** is written only by `scripts/copy-symbol-pack.mjs` from a tagged
  release, with a `VERSION` file. It is never edited by hand.

## 6. Labels (F3)
- Labels are TeX, typeset in the browser by MathJax 4's SVG output.
- The bundle is `tex-mml-svg-mathjax-stix2.js` from the site's pinned
  `@mathjax/mathjax-stix2-font@4.1.3`.
- With `fontCache: "none"`, every glyph is an inline outline.

## 7. Export
- **The SVG is built from the document:**
  - viewBox: the bounding box plus one module of margin
  - `width` and `height` in cm: real size times the scale option
  - transparent background
  - inline paths with resolved colours
  - no fonts, `href` links or CSS classes
  - `<title>` and `<desc>` holding the figure's alt text
- **Copy as PNG (F3):** the SVG is drawn to a canvas at 300 dpi and copied with
  `navigator.clipboard.write`.

## 8. File layout
```
tools/figure-editor/
  index.qmd            page shell (noindex); <div id="editor">; module script
  README.md            stub: inputs, outputs, mount() API
  src/   app.js doc.js geometry.js router.js junctions.js history.js pack.js
         view.js keys.js export.js labels.js tools/{select,place,wire,pan}.js
  symbol-pack/         copied release + VERSION
  scripts/copy-symbol-pack.mjs
  test/  *.test.js
```
- **`_quarto.yml`** gains `tools/*/index.qmd` in the render list and `tools/**` in
  resources.
- **`tools/_metadata.yml`** adds the `noindex` include.
- **`mount(el, options)`** lets an exploration embed the editor later.

## 9. Test plan
- **`node --test`:**
  - the router on shared fixtures (input to corners), checked against the Python
    router. The fixtures belong in `circuit-model`.
  - rotate and mirror
  - junction counts and dots
  - nets and lint
  - undo
  - a save-and-load round trip that changes nothing
  - export: no `<text>` and no `href`, with sizes in cm
- **Browser check:** a headless screenshot of a sample figure with a joint, a corner,
  a T-junction and a four-way junction, checked at 4× zoom.
- **Manual check:** Blake opens an export in Inkscape and PowerPoint.

## 10. Decisions (Blake, 2026-11-12)

The plan is approved with these answers. Where they differ from sections 1 to 9,
these answers win.

1. **Symbol pack: yes.**
   - The toolbox exporter is already built and checked: **21 elements** (not 22),
     **44 files**.
   - **Units:**
     - The SVGs are in modules (0.5 cm) with y pointing down.
     - The JSON is in grid steps (0.25 cm) with y pointing up.
     - The exporter's docstring documents both. The editor converts between them **in
       one place only**.
2. **Pinned copy, whatever `circuit-model`'s visibility.** No submodule.
   - `scripts/copy-symbol-pack.mjs` copies `symbols/` from the local checkout at
     `../circuit-model` into `tools/figure-editor/symbol-pack/`.
   - Next to the copy, it writes a manifest with the source commit or tag.
   - Nobody edits the copied files by hand.
   - Until symbol pack v0.1 is tagged, F2 may copy from the untagged export, provided
     the manifest records the commit. Re-copy from the tag once it exists.
3. **Mirroring.**
   - Build against **schema v0.2**: v0.1 plus an optional `mirror` on each element.
     Don't wait for the `circuit-model` builder to publish the schema file. Validate
     against it once it lands.
   - Mirror only elements whose pack JSON has `"mirrorable": true`. If the flag is
     missing, the element isn't mirrorable. The exported SVGs carry their text as
     outlined paths, which mirroring would print backwards.
   - For other elements, disable the mirror command but keep rotate.
   - The toolbox adds the flag separately.
4. **Grid.**
   - Stay in the schema's integer grid steps. Parts snap to whole modules (2 steps).
   - Wire corners may use half-module steps. A half module is exactly one 0.25 cm step,
     so it is always an integer.
   - If a position ever can't be stored as an integer grid step, stop and ask Blake.
     Never introduce fractions.
5. **Partial figures save freely.**
   - Unconnected inputs and nets with no driver show as warnings and never block a save.
   - This is a slide tool, not a checker.
6. **Colour.**
   - Wire colours come only from roles in the pack's `theme.json`.
   - If `unknown` or `floating` is missing there, those two level choices are greyed
     out. The editor never invents a colour and never edits a theme file. The toolbox
     adds the roles.
   - Exports get an optional 0/1/X/Z tag next to each wire: a per-figure toggle, off by
     default.
   - On screen, a selected wire's level is always shown as text, in the properties
     panel or on hover, so the level never depends on colour alone.
7. **No Node.**
   - The core is plain ES modules with no DOM: the model, wire anchoring, junction
     rules, undo and SVG export.
   - It is tested with Quarto's bundled Deno (`quarto run`).
   - If that proves unworkable, stop and ask before installing anything.

**Scope** stays as F1 says. F2 starts in a fresh session.
