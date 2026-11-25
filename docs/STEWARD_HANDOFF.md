undefinedDone | Branch beta-f5-2. 138 Deno tests pass (new: block, marks, element-level). Samples in examples/: ripple-carry-blocks (4-bit ripple-carry adder in block form, carry running right to left, arrowheads) and cla-chevron (N-bit CLA in chevron form, three buses marked N, arrowheads), each as .js, .json and .svg, built by scripts/build-sample.js through the editor's own edit calls. test/fixtures/mathjax.json now holds 62 real MathJax strings (the old 16 are byte-identical); scripts/tex-needed.js lists what the capture page needs. 4x zoom check done at about 15x on the exported SVG: chevron notch, arrowhead tip and bus slash show no gap (one thing seen and fixed: the first CLA layout put two bus labels one module apart, so the operands now run across first). Browser checks: blocks, marks, levels. Review stop: Blake to look at the two samples. |undefinedDone | Branch beta-f5-2. Any element, block or pack symbol takes a level (0, 1, X, Z) from the side panel or the 0, 1, X, Z keys, alone or with wires selected. The body (outline, glyphs, a block's middle text) takes the level's colour role; leads keep their wire's colour or the ink; pin labels and the element's own label stay ink. Colours come only from roles (a theme without the role gets a lint warning and the default colour). The level shows as text on request: the Level tags option now tags elements too (just right of the top-right corner). Saved as element "level" between label and params. Browser check (quarto run tools/figure-editor-beta/test/browser/check.js levels): light and dark outline colour, SVG export holds only ink and the level role, PNG export has the level colour, tag text appears, level survives reload; zero black in dark. |undefinedDone | Branch beta-f5-2, beta page only. New src/marks.js (DOM-free). Arrowhead: a filled sharp triangle with no stroke, so its tip is exactly the pin, port, wire or free point it points at (tests); sized from the theme's line width (9 line widths long, 6 wide); the wire's line is shortened to end inside the head, where the head is wider than the line, so nothing pokes past the tip and no seam shows; a short run shrinks the head, two heads share one run; no joint is drawn under a head. Per wire: none, start, end or both, from the side panel; a wire may start or end unattached, so a free-standing arrow works. Bus mark: a slash across the middle of the wire's longest run, with its label (TeX or words) past the slash's upper end. Both are saved as C5 defines (none and empty are left out), drawn in the canvas and in SVG and PNG export, take the wire's level colour, and are light in dark mode. Checked at 15x zoom on the exported file: the notch is one round join, an arrowhead meets a pin lead at its tip with no gap, the slash crosses the wire cleanly. Level tags and a bus label share the middle of a wire; if both are on they can overlap (not fixed). |---
title: "Steward handoff: site"
repo: blakeaaronroberts.github.io
doc-type: handoff
updated: 2026-11-13
---

# Steward handoff: site

The single queue of approved work for builder agents in this repository.
The Steward writes it, and adds a batch only after Blake approves it. Blake
starts a batch by pointing a builder at it by name. VISION.md outranks this
file.

## Current state

Sync of 2026-11-25, 11:45 (Pacific). Facts only; work lives in the batches below.

**Changed since the last sync (2026-11-24)**
- Merged to `main`: F22.0 and F22.1a (Blake reviewed the demo; deployed), F22.1b (Import SystemVerilog panel, slang only, Web Worker, pin `model-v0.14.0`; review approved by Blake 2026-11-25; `slang.wasm.gz` is 1.5 MB on first visit), and the L1 tools (truth table, K-map, solver, Send to Figure Editor; drafts, in Blake's review). L5 (circuit analyser) was merged earlier as a draft.
- Batch U1 (first-run redesign) approved by Blake 2026-11-24 from the design package in `proposals/first-run-redesign/`. U1.0 plan returned and Blake answered it on 2026-11-25 (see U1 below). U1.1 is unblocked by F22.1b's merge. U1.6 stays deferred; the navbar restyle moves to a later batch U2.
- Found and fixed in F22.1b: saving dropped `params.module` (an F22.1a bug).
- Unowned: 8 failing browser scenarios in `check.js` (row T-fix), failing the same way on `main`.
- circuit-model has tagged `model-v0.15.0` (SystemVerilog export, C11.3 and C11.4) and `model-v0.15.1` (clock rule, C18); the editors pin `model-v0.14.0`.

**Waiting**
- Blake: review the L1 and L5 pages (`docs/REVIEW_L1.md`) and the Import panel in daily use; approve or edit the U1 on-screen strings at each review stop; decide which T-fix expectations change; the PLL co-author's consent and the CSNN advisor's OK; his institution's course-material policy.
- Builder: U1.1, then U1.4 (start chooser, tour); F22.1c (behavioural code through YoWASP) needs a plan first (delivery of a roughly 17 MB engine file); F22.2 to F22.4 (hierarchy, export, testbench; pin `model-v0.15.1`); later F23, F27, F20, F26.

## How builders use this file

- Do only the batch Blake names, in step order, and stop at every review stop.
- Where a step says "Scribe item H-…", follow that prompt in
  `docs/SCRIBE_HANDOFF.md` exactly. Any **amendment** written under the step
  here takes precedence over the Scribe's text.
- When a step is finished, set its Status (Open, In progress, Done, Blocked,
  Waiting) and add a one-line note: the commit SHA, or why it was kept or
  blocked. Change nothing else in this file, and never delete rows.
- If a doc no longer matches the code, add a line under "Notes for the Scribe"
  at the bottom. Don't edit the doc yourself; the Scribe owns docs.
- Every push in this repo still gets the privacy scan (CLAUDE.md, Privacy).

## Batches

**Order of work (Blake, 2026-11-19).** R1.1 to R1.5 are merged. **F28 and F29 are done; F24 is done and F25 is mostly done (2026-11-24). Now F22.0 (SystemVerilog plan, Blake's priority), then the rest of F25, then F23.1 (FSM plan, C15 is tagged), then F27 (figure fixes), then F20, T2.3, F21.2 to F21.3, then F9 and F11 (simulator tag exists), then F8. F13 follows circuit-model C8; F22 follows C11 (engine memo); F23 follows circuit-model C15 and the R1 merge. F26 runs before launch. A second site session may work L1, then L5 (after circuit-model C17), then L2, then L3, inside `tools/logic/` and `tools/equations/` only. Archived batches: `docs/handoff-archive.md`.

| Batch | Intent | Status | Approved by Blake |
|---|---|---|---|
| S4 | Make sure this repo's commits use Blake's GitHub noreply address, not a university or work email | Done | 2026-11-12 |
| F2 | Figure editor v1 core: place, move, rotate and mirror elements on the grid; wires that stay anchored to pins; save, load and SVG export | Done | 2026-11-12 |
| F3 | Figure editor v1 finish: labels in STIX Two, wire level colours, PNG copy, private theme, shortcuts, draft toggle | Done | 2026-11-12 |
| F4 | Figure editor options before launch: grid, whole-figure line weight (thin, regular, bold) and a dark theme, saved with the figure | Open | 2026-11-13 |
| F8 | Figure editor: box select, copy and paste, align and distribute, label editing, shortcuts | Open | 2026-11-13 |
| F10 | Figure editor: slide frame for arranging the schematic and timing diagram | Open | 2026-11-13 |
| F9 | Figure editor: play a scenario, timing diagram linked to the wires | Open | 2026-11-13 |
| F11 | Figure editor: animated SVG, animated PNG and per-transition exports | Open | 2026-11-13 |
| F13 | Figure editor: KiCad import | Open | 2026-11-13 |
| F14 | Promote the beta editor to stable | In progress | 2026-11-13 |
| F17 | Editor: configurable level colours | Done | 2026-11-13 |
| T2 | Timing tool: transition timing, arrows between transitions, per-transition exports | Open | 2026-11-13 |
| F18 | One stable Figure Editor with a minimisable Timing pane | Open | 2026-11-14 |
| F19 | Slide export: sizes, regions, layouts, parts and whole | Open | 2026-11-14 |
| F20 | Frames: frame window or playhead, per-frame export | Open | 2026-11-14 |
| F21 | N-input and N-output variants and a calmer Elements pane | Open | 2026-11-14 |
| F22 | SystemVerilog in the Figure Editor (blocked on C11; import runs in the browser only if the C11.0 spike passes, otherwise the editor loads the importer's JSON) | Open | 2026-11-14 |
| L1 | Logic mini-tools: truth table, K-map, SOP and POS, Boolean solver | Open | 2026-11-14 |
| L5 | Circuit analyser: from a drawn circuit (later also SystemVerilog) say whether it is fully combinational and, if so, show truth table, minterms and maxterms, SOP, POS, minimal forms and LaTeX (Blake's request, 2026-11-23; modelled on his ModelSim `module_generic.do`) | Open | 2026-11-23 |
| L2 | Converters from chapters 1 to 5 | Open | 2026-11-14 |
| L3 | Equation library, core 100 to 300 level | Open | 2026-11-14 |
| F28 | Timing diagram: bars end in a slanted edge into 0 or 1, and the hatch pastes into PowerPoint as clean vector lines (no SVG pattern) | Done | 2026-11-23 |
| U1 | First run: a quieter pre-launch page, a release home where Projects, Explorations and Tools sit side by side, and a Figure Editor that asks how to start and shows a short tour | Open | 2026-11-24 |
| F29 | Timing diagram: signals cut at the right edge, phase and delay fill, hidden signals and names, view auto-fit (Blake confirmed 2026-11-24; phase holds the last value) | Done | 2026-11-23 |
| F24 | Editor uses scenario `initial` and `force` (circuit-model C14) instead of its own hand-set Frame 0 values | Open | 2026-11-19 |
| F25 | Hardening and records from the 2026-11-20 reviews: CI gates, privacy scan, integrity hashes, housekeeping, licence table | Open | 2026-11-20 |
| F26 | Self-host fonts, MathJax, WaveDrom and DigitalJS (before launch) | Open (before launch) | 2026-11-20 |
| F27 | Figure fixes from the Aesthetic review: K-map page, DigitalJS plate, editor demo | Open | 2026-11-20 |
| F23 | FSM tool: state diagram, transition table and equations kept in sync (waits for circuit-model C15) | Open | 2026-11-19 |
| R1 | Reconcile the Copilot beta into modular tools: Schematic Editor (drawing pane) and Figure Editor (composite), one copy of the code, simulator from circuit-model | Open | 2026-11-19 |

---

### S4: commit identity

**Why now.** Blake set his global git email to his GitHub noreply address
(2026-11-12). A repo-level setting would override it, and no new commit
should carry a university or work address (VISION.md section 3).

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| 1 | Run `git config --local user.email` in this repo. If it prints anything, run `git config --local --unset user.email`, then confirm `git config user.email` prints the noreply address | Steward, approved by Blake 2026-11-12 | Done | No local email set (nothing to unset); effective `user.email` is the noreply address from global config. History untouched. |

**Scope limits:** git configuration only. Don't rewrite history.

**Review stop:** report what step 1 printed before and after, then wait.

---

### F4: figure editor options before launch (grid, line weight, dark theme)

**Why now.** Blake wants these in the editor before it goes live (2026-11-13).
They build on the `figure-editor` branch, after F3.

**Blake's decisions (2026-11-13).**
- **Grid option.** Show or hide the grid dots, and snap on or off. The grid
  is a view setting kept in the browser, never in the saved file and never in
  an export. Dot spacing and colour come from the pack's `theme.json`.
- **Line weight.** Three presets: thin, regular (the default) and bold. One
  choice for the whole figure, never per element. The editor does **not**
  scale strokes itself, because that leaves gaps and notches at joints. It
  loads the matching pack (`symbols`, `symbols-thin`, `symbols-bold` in
  `circuit-model`), whose files the toolbox drew at that weight. Wires and
  junction dots take their widths from that pack's `theme.json`.
- **Theme.** `default` (Okabe-Ito on light) and `dark`. Each symbol colour is
  marked with a `data-role` attribute; the editor recolours by role from the
  chosen theme (`theme.json`, or `theme-dark.json` beside it). The VISION.md line for
  the dark theme was approved by Blake on 2026-11-13.
- The figure's weight and theme are saved in the figure's optional `style`
  block (batch C4 in `circuit-model`), so a reload looks the same. Private
  themes are never named in a saved figure.
- A private theme loaded from a local file keeps working.

**Prerequisites.** F3 is done, and `circuit-model` has tag `symbols-v0.3.0`
(toolbox batch E0.3 and `circuit-model` batch C4). Do not start before then.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F4.1 | Grid option: show or hide, snap on or off, as a view setting kept in the browser. Exports never contain the grid | Steward, approved by Blake 2026-11-13 | Open | |
| F4.2 | Weights: extend the copy script to pin all three packs from the tag, with a manifest and hashes for each; a weight selector that loads the matching pack. Check that every element has the same pin positions in all three packs, and stop if not | Steward, approved by Blake 2026-11-13 | Open | |
| F4.3 | Theme: recolour symbols by `data-role` from the chosen theme; theme selector; canvas background; wire level colours in each theme; the export uses the chosen weight and theme. No hard-coded colour in the editor | Steward, approved by Blake 2026-11-13 | Open | VISION.md line approved by Blake 2026-11-13 |
| F4.4 | Save and load the `style` block (weight and theme); validate against `circuit.schema.json`; load figures without one as regular and default | Steward, approved by Blake 2026-11-13 | Open | |
| F4.5 | Tests and checks: Deno tests for the style round trip, recolouring and pack switching; a sample figure exported at thin, regular and bold and in dark; the 4x zoom check on a joint, a corner and a four-way junction at every weight and in dark; privacy scan | Steward, approved by Blake 2026-11-13 | Open | |

**Scope limits.** No change in `manimations` or `circuit-model`. No per-element
weights. No new dependency without asking.

**Mandatory.** Draw only from the packs. Exported SVG has no external
references, fonts or CSS variables. Keep the F2 and F3 tests passing.

**Review stop.** Show Blake the sample at all three weights and in dark, plus
a screenshot with the grid on and off, then wait. Going live (merging into
`main`) is Blake's separate decision.

---

### F8: editing tools

**Why now.** Faster figure building (Blake, 2026-11-13). Waits until F5 ships.

**Blake's decisions.** Box select; copy, paste and duplicate; align and
distribute; in-place label editing (including LaTeX); keyboard shortcuts
(Delete, rotate, undo, copy and paste, arrow-key nudge) with a cheat sheet.
If budget runs out, drop in this order: align, label editing, the rest.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F8.1 | Box select and move | Steward, approved by Blake 2026-11-13 | Open | |
| F8.2 | Copy, paste, duplicate and shortcuts | Steward, approved by Blake 2026-11-13 | Open | |
| F8.3 | Label editing in place | Steward, approved by Blake 2026-11-13 | Open | |
| F8.4 | Align and distribute | Steward, approved by Blake 2026-11-13 | Open | |

---

### F10: slide frame

**Blake's decisions (2026-11-13).** A slide-size rectangle (16:9 default, 4:3
option) on the canvas where the schematic and the timing diagram are arranged
together. Export the frame as one figure, or the schematic or the diagram on its
own, at real size.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F10.1 | Slide frame, placement of the schematic and timing diagram, export of the frame or of either part | Steward, approved by Blake 2026-11-13 | Folded into F19 | beta-f10 was already merged to main (1b46d5e); F19 builds on its frame.js and replaces the canvas frame outline (b616d67). |

---

### F9: play a scenario

**Prerequisites.** circuit-model tag with C6 and C7 (copied in with the pinned
copy script, like the symbol pack; never import from the circuit-model repo
directly).

**Blake's decisions (2026-11-13).**
- Load or create a scenario (input ports, steps). Play, pause and step. Wires
  and level-coloured elements take their colour from the trace at each step; no
  moving marks.
- A timing diagram drawn from the same trace, in the lecture look, beside or
  below the schematic, with the current step marked, and arrangeable in the F10
  slide frame.
- Signal state never relies on colour alone: show the value as text on request.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F9.1 | Scenario editing and playback driven by the pinned simulator | Steward, approved by Blake 2026-11-13 | Open | |
| F9.2 | Linked timing diagram with current-step marker | Steward, approved by Blake 2026-11-13 | Open | |
| F9.3 | Tests: full adder and D flip-flop scenarios match the simulator's trace | Steward, approved by Blake 2026-11-13 | Open | |

---

### F11: animation exports

**Blake's decisions (2026-11-13).**
- Animated SVG (self-playing, CSS or SMIL, no script), animated PNG (APNG,
  built in the browser with no new dependency), and **per-transition** export:
  one SVG or PNG per step, numbered, so the steps go on successive slides.
- Each export works for the slide frame, the schematic alone or the timing
  diagram alone. Default theme unless the dark-export option is on.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F11.1 | Animated SVG | Steward, approved by Blake 2026-11-13 | Open | |
| F11.2 | Per-transition SVG and PNG sequence | Steward, approved by Blake 2026-11-13 | Interim, no simulator | Beta editor only. Frames panel: Capture frame, select (shows its levels), rename, reorder, update, delete; Export frames (one SVG + PNG per frame, 01, 02..., schematic alone or slide frame) and Export all on one slide (grid of small figures, names as outlined paths, slide size). **Frames are stored in the figure's `groups` map under `"frames"`** (the only free-form map the editor round-trips); NOT in a schema field: Blake or circuit-model should confirm `groups` accepts that shape. Tests: test/levelframes.test.js, browser scenario `frames`. |
| F11.3 | APNG | Steward, approved by Blake 2026-11-13 | Open | |

---

### F13: KiCad import in the editor

**Prerequisites.** circuit-model tag with C8. An "Import KiCad" action that runs
the pinned importer in the browser and opens the result; report unknown parts
(imported as blocks) in a short list.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F13.1 | Import action, error reporting, fixture test | Steward, approved by Blake 2026-11-13 | Open | |

---

### F14: snapshot the beta to stable

**Blake's decisions (2026-11-13, revised).** Blake wants a safe copy of the
working beta. Copy the beta over `tools/figure-editor/` as a frozen stable
release and **keep the beta page** for further development (no redirect, no
removal of the duplicate yet). First tag the current stable state
`editor-stable-before-snapshot` so it can be restored. The stable page keeps the
stable-page look without the beta banner, and its saved figures and autosave
keys stay separate from the beta's.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F14.1 | Tag, copy beta to stable without the banner, separate autosave keys, tests, deploy | Steward, approved by Blake 2026-11-13 | Done | Tag editor-stable-before-snapshot set; beta copied over tools/figure-editor/ as frozen stable, no banner, own keys (figure-editor/...); beta page kept; 155 tests and browser checks pass. |

---
---|---|---|---|
| F14.1 | Promote, remove the duplicate, redirect, tests | Steward, approved by Blake 2026-11-13 | Done | 87e2e6f (with F18.1): one stable URL tools/figure-editor/ named Figure Editor with the beta's features; tools/figure-editor-beta/ is now a redirect page (keeps ?open=); beta browser storage copied once into figure-editor/ keys, beta keys left in place; saved list cap 10 to 20; tag editor-stable-before-snapshot kept; 170 tests and browser checks (dark, frames) pass. |

---

### F17: configurable level colours

**Blake's decisions (2026-11-13).** In the THEME section the user can choose the
colour for each level role (0, 1, X, Z) for light and for dark. The defaults stay
in the theme files; a choice is saved in the figure's `style` block as a role
override, never as a hard-coded colour in code. Warn when a pair has poor
contrast or is hard to tell apart for colour-blind viewers. A reset restores the
defaults. Exports use the figure's choice.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F17.1 | Role override UI, saved in the figure, contrast warning, reset, export uses it | Steward, approved by Blake 2026-11-13 | Done | 38161fc: Theme pane, Level colours: a light and a dark colour per level (0, 1, X, Z), saved in style.levels exactly as the model-v0.3.1 schema defines it (other style fields kept); the figure's choice overrides the theme and a private theme on the canvas and in every export; contrast below 3:1 and level pairs under a colour difference of 20 (normal, protan, deutan, tritan vision) warn; per-level and all-levels reset. Tag model-v0.3.1 (commit 4fb47aa) pinned in tools/figure-editor/MODEL_PIN.json. 183 tests pass. **Schema conflict for Blake or the Steward:** frames, net labels, slide and divider settings are stored in groups (groups.frames, groups.wire_labels, groups.wire_label_style, groups.slide), but the schema's groups means buses (name to a list of port ids), so a figure with them fails circuit-model validation. circuit-model needs a place for editor data (for example a style.editor or a top-level extension object), or those features must save outside the circuit file. |

---

### T2: timing tool, timing and arrows

**Blake's decisions (2026-11-13).**
- Adjust timing of transitions: a per-signal phase and a diagram-wide step width
  (WaveDrom `phase` and `hscale`), and per-step spacing by editing the wave.
- Arrows from one transition to another: a small UI that adds WaveDrom edge
  markers (`node` letters and `edge` strings) between chosen steps, with a label.
- Export a figure per transition: one SVG and one PNG per step, numbered, each
  with the diagram's step marker, and, once frames exist, the schematic at that
  step.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| T2.1 | Phase and step width controls | Steward, approved by Blake 2026-11-13 | Done | 0a0362b, db96edc (Blake 2026-11-14): step editor replaces source text; per-signal phase, period and delay; step width (hscale) in Size. |
| T2.2 | Edge and arrow UI with labels | Steward, approved by Blake 2026-11-13 | Done | db96edc: node brush puts letters on steps; Arrows list (from, shape: straight, curve or square with heads, to, label); drawn by draw.js. Revised: the Edit view is four steps (Signals, Arrows, Title and ticks, Look); a Look setting draws edges slanted (WaveDrom) or square. 4b0f807: beta four-way solder-dot connectivity and a saved, numbered, alternating-row WaveDrom source editor. a8c89f7: TeX signal names and edge titles (including slide exports), configurable colours for data values 3-9, independent arrow-line and arrowhead size/colour; `{}` spacers confirmed and round-trip; diagram remains visible above open look controls. Beta refinements in 800e1ab (Blake authorized publication 2026-11-15): Fit, signal-line colour and theme-role X/Z fills; draggable and keyboard-resizable panes; Source editor and F-to-Fit refinements. Tests: 32 timing, 198 beta and 185 stable pass; timing, source-editor, layout/Fit and solder-dot browser checks pass. |
| T2.3 | Per-transition export of the diagram, then with schematic frames | Steward, approved by Blake 2026-11-13 | Open | Schematic frames exist in the editor (see F11.2). Timing tool now reads the frames from the editor autosave or an opened circuit .json (`groups.frames`), a Frame list marks that step (frame i = wave character i, so a frame is one step; hscale respected) with a rounded translucent band, and Export frames writes one SVG per frame with its marker (timing-diagram-01.svg, ...; SVG only, no PNG yet). Not done: T2.1, T2.2, the combined schematic-plus-diagram slide per frame (needs F9 layout). Rounded line ends and corners on the timing diagram (stroke-linecap/linejoin round, rule kept inside the exported SVG): done, tools/timing-diagram/src/app.js. |

---

### F18: Figure Editor: one stable tool, Timing pane inside

Intent: the editor becomes one stable tool named **Figure Editor** (retire "beta" wording once F14 is done). It contains a minimisable Timing Diagram pane; the standalone Timing Diagram page stays and both use the same module, so there is one copy of the code. Review stop after F18.3.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F18.1 | Rename to Figure Editor everywhere users see it; one stable URL, beta kept as a hidden preview only if needed | Steward, approved by Blake 2026-11-14 | Done | 87e2e6f (with F14.1): page title, navbar buttons, Tools menu and messages say Figure Editor; no beta preview kept (the beta URL redirects). |
| F18.2 | Move the timing tool into a shared module; dock it as a minimisable, resizable pane in the editor with a splitter | Steward, approved by Blake 2026-11-14 | Done | 53d2d29: code moved to tools/timing/ (src, test, timing.css, README stub); mount(el, {docked}) gives the page or the pane layout; pane under the canvas, minimise button, splitter (drag or arrow keys), state kept in the editor options; exports always light; dark canvas has zero black strokes in the pane. 182 tests pass. |
| F18.3 | Standalone Timing Diagram page loads the same module; the two can send a circuit's node names and a scenario to each other (copy and file, no server) | Steward, approved by Blake 2026-11-14 | Done | 53d2d29: page imports ../timing/src/app.js (no fork). Node names reach the timing tool from the editor (pane: live; page: the editor's autosave, or Open circuit .json); the scenario reaches the editor by Send (browser storage). Blake 2026-11-14: done for now, no clipboard copy. |

---

### F19: Slide export: layouts, regions, auto-scale

Intent: replace the slide outline with a real slide export. The user sets the slide size, the header and footer heights, and which regions exist (schematic, timing diagram, text placeholder). The text itself is written in PowerPoint, so the placeholder is only a labelled box that shows where it goes and is never exported as content. Content scales to fit its region. About six suggested layouts come from common good presentation practice (schematic over diagram, side by side, large schematic with caption strip, diagram only, 2 by 2 frames, text left and figure right). Exports: the whole slide as SVG or PNG, and the schematic and the diagram separately, each at its slot size, as SVG or PNG. Review stop after F19.4.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F19.1 | Slide size presets (16:9 default, 4:3) and numeric header and footer heights, saved in the figure | Steward, approved by Blake 2026-11-14 | Done | b616d67: groups.slide in the figure (format, header and footer cm, layout, regions); sizes from frame.js. |
| F19.2 | Regions with labels, drag and resize on a module grid, auto-scale content to its region keeping line weights as drawn (never scaled strokes: re-draw at slot size) | Steward, approved by Blake 2026-11-14 | Done | b616d67: slide view; drag to move, corner to resize, whole modules, kept on the slide; schematic scaled with strokes kept at drawn width, timing re-laid out at the region size. |
| F19.3 | Six layout presets that fill the regions; placeholder box for PowerPoint text, excluded from export | Steward, approved by Blake 2026-11-14 | Done | b616d67: eight layouts (over, side, caption, diagram only, 2 by 2 frames, text left, and two with the timing diagram across the bottom and text and schematic splitting the top) with editable divider percentages (top height, left width, caption strip), each with a default, saved in groups.slide.splits; text regions only in the slide view, never exported. |
| F19.4 | Export whole slide (SVG, PNG) and each part separately at its slot size (SVG, PNG); tests and one screenshot | Steward, approved by Blake 2026-11-14 | Done | b616d67: Slide as SVG/PNG, each region SVG/PNG at its slot size; test/slide.test.js (6 tests), browser checks pass, one screenshot. |

---

### F20: Frames: frame window or playhead, per-frame export

Intent: frame-by-frame export. The timing diagram shows the current frame window. A switch chooses what defines a frame: the playhead (one step) or the frame window (a span of steps). Each frame exports on its own and as a slide grid using F19. Frames come from the simulator trace once C7 exists; until then manual frames stay. Review stop after F20.3.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F20.1 | Frame window drawn on the timing diagram; drag its edges; switch playhead or window | Steward, approved by Blake 2026-11-14 | Open | |
| F20.2 | Per-frame export of schematic and diagram together or separately (uses F19 slots), numbered files | Steward, approved by Blake 2026-11-14 | Open | |
| F20.3 | Frames from a `trace` when one is loaded; manual frames remain as fallback | Steward, approved by Blake 2026-11-14 | Open | |

---

### F21: N-input and N-output variants, with a calm palette

Intent: any gate with N inputs, muxes and decoders of any size, without crowding the Elements pane. The pane shows one entry per family; a small popover on placing it chooses the number of inputs, outputs or select lines. Symbols come from the symbol pack (toolbox batch E8). Add a search box and a recents row to the pane. Review stop after F21.3.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F21.1 | Family entries and popover (inputs 2 to 8, mux and decoder sizes, bubbles per input), saved in the circuit as parameters | Steward, approved by Blake 2026-11-14 | Done | c53eb85 (branch f21-1, not merged): symbol pack pinned to symbols-v0.3.0 (7cda209; 162 elements, variants as files and_gate--n3). Elements pane: one entry per family, the draft ones marked DRAFT and dashed, each under its category (new categories for 0.3: Data converters; sequential, arithmetic, passive and sources lists extended); replaced families (mux2, decoder2to4) hidden. Families (18) show their range and open a popover on click: one choice places at once, several choices have a Place button; the choice is saved as the element's params, e.g. {"n": 4}, and drawn, exported and wired as that variant. The Show drafts switch is gone. Not done: bubbles per input (the pack has no such parameter), and changing a placed element's size afterwards. Stopped here as asked: F21.2 and F21.3 untouched. 185 tests pass; browser checks adjusted for the bigger pack (the all-elements figure is too small to count black pixels). |
| F21.2 | Search box and recents row in the Elements pane; keyboard usable | Steward, approved by Blake 2026-11-14 | Open | |
| F21.3 | Tests and one screenshot of the pane in light and dark | Steward, approved by Blake 2026-11-14 | Open | |

---

### F22: SystemVerilog in the Figure Editor

Intent: the finished editor and simulator speak SystemVerilog (VISION section 6, item 2). Import a module (synthesizable subset taught in the course) and get a schematic with its hierarchy, and a timing diagram from a testbench or scenario. Export a circuit as a SystemVerilog module and testbench. The language handling lives in circuit-model batch C11 and its tag; the editor only calls it. Blocked until C11 exists and the engine memo has been decided by Blake.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F22.1 | Import panel: paste or open a .sv file, show errors with line numbers, place the result with auto layout that Blake can then tidy | Steward, approved by Blake 2026-11-14 | Waiting | Plan only, no code: proposals/f22-systemverilog-plan.md (uncommitted), waiting for Blake's OK and five decisions in its section 8. REVIEW STOP |
| F22.0 | Plan only: how the Figure Editor takes SystemVerilog (`circuit/0.4`, modules, `model-v0.11.0`), what GitHub Pages serves for a `.wasm`, whether import runs in the browser | Blake, 2026-11-24 | Done | Blake's goal (2026-11-24): SystemVerilog in, schematic and timing diagram out, as soon as possible. Plan decisions by Blake, 2026-11-24 (see PLAN-sv.md section 8): browser adapter is circuit-model C11.1b (no copy in the site); release 1 has no behavioural code (F22.1c adds it through YoWASP); Web Worker, 20 second limit, 200 KB cap; import replaces the figure after a confirm with one Undo, inserting waits for F22.2; F22.1a first; if levels cannot be calculated through module instances F22.1a ships with a stated limit shown once in the UI. Pin changed: model-v0.12.0 or newer, and F22.1b waits for the tag with the sign-extension fix. Landed on main with F25.2 to F25.4. Branch f22-0: tools/figure-editor/PLAN-sv.md (supersedes the untracked proposals/f22-systemverilog-plan.md). Pages gzips a `.wasm` on the fly (tested on a 5 MB file; the 75 MB YoWASP file is untested); import runs in the browser in two stages (slang alone, then Yosys) and needs a browser adapter from circuit-model first. Found: `simlevels.js` drops module instances, so levels need work in F22.1a. Six decisions in its section 8. No F22 code. |
| F22.1a | Pin `model-v0.12.0` (or newer); `circuit/0.4` read and write with `modules` kept; a block's `params.module`; calculated levels through module instances; Open takes the importer's JSON | Steward, approved by Blake 2026-11-14; order and pin changed by Blake 2026-11-24 | Done, approved by Blake 2026-11-24 | Branch f22-1a, merged to main (deployed). MODEL_PIN.json: model-v0.12.0 (1e65a2a; same circuit.schema.json as v0.11.0); copy-model.js also copies sim/flatten.mjs and the demo (sv_demo.json, demo.sv, its scenario and trace) into tools/shared/test/model/. doc.js reads 0.2, 0.3 and 0.4, keeps `modules` as read, writes 0.4 only when `modules` is non-empty (else 0.2 or 0.3 as before); block.js allows `module` (a name). simlevels.js passes instances and `modules` to the simulator, so levels run through them: no limit needed, and the demo's register loads on the rising edge (7 tests in test/modules.test.js, written first and failing; 248 pass). Look: figure-editor page with the demo opened (screenshot checked). **Known limits (all three go to F22.1b):** module blocks draw no pin names; a block's label can sit over wires (the importer's layout is shown as is); a hand-set level on an instance's output wire is treated as an input (`drivenWireIds` knows only gate and flip-flop outputs). `?open=` (follow-up commit bac8e2b): `openableUrl` in tools/shared/src/openurl.js accepts only this site's files or a blob: made by this origin, refuses the rest with a readable message that stays on screen, and the fetch sends no credentials and refuses redirects; the Schematic Editor already refused other origins, so this tightens it (blob: of other origins, logins, redirects) and makes the refusal visible. Checked in a browser: a same-site file, a blob made by the page (the L1 hand-off flow), the examples, and a refused address. The Figure Editor passes `?open=` to the Schematic Editor; the Timing Diagram page takes no `?open=`. 253 schematic tests Not yet: opening a module's inside (F22.2). **Blake: open examples/sv_demo.json in the editor.** REVIEW STOP |
| F22.1b | Import panel (paste or open .sv, Worker, 20 second limit, 200 KB cap, problem list with lines, replaces the figure after a confirm with one Undo); slang only | Blake, 2026-11-24 | Done, review stop | Branch f22-1b, merged to main 2026-11-25 (review approved by Blake); privacy scan clean after Blake added tools/shared/src/sv/ and _site/tools/shared/src/sv/ to `vendored` (committed here as Blake wrote it). Pin model-v0.14.0 (319a6d9); copy-model.js has a third set, tools/shared/src/sv/ (the 15 files the importer reaches, slang.mjs and slang.wasm.gz, NOTICES.md; MANIFEST, `-text`, manifests.test.js). Worker: tools/shared/src/sv-worker.js; page side svjob.js (200 KB in UTF-8 bytes, 20 s, never throws: a Worker error, a failed download or the limit is a problem); panel src/svpanel.js, toolbar button "Import SystemVerilog". Candidate tops (the importer's "name one of") fill the Top module choice; a successful import lists the module names there too. Replace needs a click on "Replace the figure"; it is `load(text, true)`, one Undo step. First items done: module blocks draw their pin names (kind `pinname`, not selectable), a block's label stays in the middle only when it fits clear of pin names and wires, else goes under the block. **Bug found and fixed (F22.1a):** saving dropped `params.module` (canonicalParams), so a saved demo lost its instances. Tests first: svjob.test.js (the real importer in Deno: structural import and drawing, an error with its line, two candidate tops), blocklabels.test.js, modules.test.js; 272 schematic, 78 timing, 30 composite. Browser: `check.js svimport`, light and dark, all pass (an error in a paste names line 2; the whole demo.sv is refused with its line, since its register is behavioural; the demo's structural half opens as a file and replaces the figure; one Undo restores; a second changes nothing). The 8 failing timing scenarios are a separate item (below). The scan had flagged third_party/NOTICES.md (third-party authors' emails); resolved by Blake's `vendored` entries. **demo.sv is refused until F22.1c:** its load_register uses `always_ff`, which needs Yosys; import the structural half, or open examples/sv_demo.json with Open. **Measured on Pages after the deploy (2026-11-25):** slang.wasm.gz is served as `Content-Type: application/gzip` with no `Content-Encoding`, 1,492,993 bytes on the wire with or without `Accept-Encoding: gzip, br` (the file itself; Pages does not compress it again), `Cache-Control: max-age=600`, first bytes 1f 8b, so the loader's own decompression runs. About 1.5 MB per first visit. Limits: pin names are the importer's bit names (a1, sum2), crowded on small blocks; a hand-set level on an instance's output wire is still treated as an input; no Yosys (F22.1c). REVIEW STOP |
| F22.1c | Behavioural code (`always_comb`, `always_ff`) through YoWASP | Blake, 2026-11-24 | Open | After F22.1b |
| T-fix | 8 failing browser scenarios in `check.js` (timing viewer and arrows, per-shape arrow styles, slide timing bounds, separate sizes, large outlined labels, clock of period 2). Not part of F22.1b | none | Unowned | Found 2026-11-25: they fail identically on main (checked on a clean build of origin/main), and on f22-1b; one more scenario (`interface`) timed out on the main run only. Likely stale after F28/F29 (clipPath and pattern gone, see F28.5's note) and the clock limit lifted in R1.4. Needs an owner and Blake's decision on which expectations change. |
| F22.2 | Hierarchy: instantiate modules as blocks, open a block to see its inside | Steward, approved by Blake 2026-11-14 | Open | |
| F22.3 | Export circuit as .sv module and testbench; download; round trip check on the course examples | Steward, approved by Blake 2026-11-14 | Open | |
| F22.4 | Testbench or scenario drives the Timing pane through the simulator | Steward, approved by Blake 2026-11-14 | Open | |

---

### U1: first run (design handoff, 2026-11-24)

Intent: a quieter pre-launch page, a release home with Projects, Explorations and Tools as three equal sections, and a Figure Editor that asks how to start (and fixes the first-open hint that is overwritten at once) and shows a short tour. Package: `proposals/first-run-redesign/` (`STEWARD_NOTE.md`, `README.md` the builder's spec, `design/First Run v2.dc.html` the clickable reference; a design reference, not code to copy). Approved by Blake 2026-11-24 as a batch; **no on-screen string is approved yet**, and U1.0 returns the list.

Rules for every step: site repository only; colours and fonts through existing roles (the one new token is `--role-rule-soft`, derived from rule and background); no new dependency; no copyright or licence notice (so **drop the "© 2026" footer** from U1.3); do not write Blake's prose, use his text or a placeholder; the pre-launch page links to nothing; keep every existing command, key and storage key; signal state never by colour alone, visible focus, `prefers-reduced-motion` respected; privacy scan before any push. U1.1 to U1.5 touch `tools/schematic-editor/src/app.js` and `tools/figure-editor/src/index.js`, as F22.1b does: **do not run them at the same time as F22.1b**; take the one that is already merged first. The unzipped package replaces the zip; never commit the zip.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| U1.0 | Read the package and the reference. Reply with a short plan per step (files touched, tests to add), the list of on-screen strings (verbatim, new, placeholder), and any conflict with CLAUDE.md or VISION.md; write nothing to the site | Design handoff, approved by Blake 2026-11-24 | Done | Plan returned; Blake answered 2026-11-25: the placeholder Exploration card and the K-Maps template text are dropped from the home page; the Tools listing shows only approved tools (no Logic tools yet); a two-step tour (Elements, wiring) on the Schematic Editor page with its own `schematic-editor/tour-seen` key; arrow keys unchanged and the words about arrow keys come out of the tour text; the navbar restyle (Screen 3) is out of U1 and becomes batch U2, the loading skeleton stays in U1.5; `--role-rule-soft` is derived with `color-mix` in `custom.scss`. The chooser strings are built as written and marked not approved; Blake approves or edits them at the U1.1 review stop. |
| U1.1 | Editor start chooser (Full adder example / Empty figure / Open…, keys 1 2 3, Esc = empty) when there is no `?open=` and no autosave; fix the overwritten status line; autosave and `?open=` unchanged | README "Screen 5" | Open | Unblocked: F22.1b merged 2026-11-25. Smallest step; fixes a real bug. REVIEW STOP (chooser, light and dark) |
| U1.2 | Pre-launch page: more room above the title block, "Site under construction" with its status dot; still no navigation and no internal links | README "Screen 1" | Open | |
| U1.3 | Release home: bio (verbatim), sticky three-part section bar, three listings with one card style (Projects, Explorations from Quarto listings; Tools from a small YAML file). No copyright footer | README "Screen 2" | Open | Goes live only at launch. REVIEW STOP (light and dark) |
| U1.4 | Tour (three steps, spotlight), toolbar tooltips with keys, Keys dialog restyled from `KEYS`, toast, Tour button; seen state `figure-editor/tour-seen` | README "Screen 5, 6" | Open | REVIEW STOP (three screenshots) |
| U1.5 | Toolbar and status bar: figure name and autosave state, Export as the one filled button, "Frame n/8", grid step, zoom | README "Screen 4" | Open | |
| U1.6 | Editor layout: settings panes in a right column, Timing Diagram and Slide as tabs under the canvas, Elements search | README "Screen 4, layout" | Deferred (Blake, 2026-11-24: after F22.1b merges) | Overlaps F21.2 (Elements search): decide which batch owns the search field |
| U1.7 | Deno tests for the chooser and tour state; browser checks (first open, autosave restore, `?open=`, tour skip and replay, light and dark); one screenshot per changed page; privacy scan | CLAUDE.md render cadence | Open | |

Note for the Scribe once built: a "First open" section in the Figure Editor and Schematic Editor READMEs. Note for the IP Inspector: `proposals/first-run-redesign/design/support.js` is the design tool's runtime for the reference file; confirm its provenance, and it never ships on the site.

---

### F28: Timing diagram: bar-to-level transitions and PowerPoint-safe hatching (top priority)

Blake's report (2026-11-23): (1) when a filled-bar value (X, data, any bar) is followed by 0 or 1, the bar ends in a point, as a hexagon does. A typical timing diagram instead has the bar's edge run the whole way across to the new level. (2) Pasted into PowerPoint, the X hatch shows a strange background pattern that changes as the slide is zoomed.

Cause (read from `tools/timing/src/draw.js`, `flush()` and the `<pattern>` in `defs`): every bar closes at a single point `[xr, ym]`; the hatch is an SVG `<pattern>` with `patternTransform="rotate(45)"` plus a `clipPath`. PowerPoint turns patterns into a tiled bitmap, so it scales oddly, and clip paths are also handled poorly.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F28.1 | Add a failing test first: for bar then `0`, the bar's last vertex is at the low level (top edge ends at `yl`, bottom edge stays on `yl`, no point at `ym`); bar then `1` mirrors it (bottom edge rises to `yh`). Bar to bar, and bar to `z`, keep today's crossing or point shape. Check the same for X after 0 and 1 (entry side already slants; confirm) | `draw.js` `flush()` | Done | Branch f28, not merged. tools/timing/test/barends.test.js (10 tests, written first and failing): bar then 0 or 1 ends in one slanted edge, plain and centred; bar to bar, Z and end of wave keep the point; 0 or 1 then bar already slanted full height. |
| F28.2 | Fix the end shape in `flush()` using the next run's level; make sure the level line that follows joins the slanted edge with no gap or notch (round joins) | `draw.js` | Done | draw.js flush(): the end uses the next step level; the level line starts where the edge ends. |
| F28.3 | Replace the hatch pattern with explicit vector lines: compute the 45 degree segments clipped to each bar's polygon (a convex shape, so simple line clipping) and emit them as one plain `<path>` of `M L` segments, stroke only. No `<pattern>`, no `patternTransform`, no `clipPath` on bars. Spacing and stroke width stay as now so the look is unchanged | `draw.js` | Done | X hatch is one stroke-only path of 45 degree M L segments (lines on x + y = k * 6 sqrt 2, as the old pattern), cut to the bar in code; outline drawn separately. |
| F28.4 | The plot-area `clipPath` also goes: clip the geometry in code instead, or confirm no shape needs it. Add a test that exported SVG contains none of `<pattern`, `patternTransform`, `clipPath`, `<filter`, `<mask`; fill-opacity on bar fills becomes a pre-mixed solid colour | `draw.js`, tests | Done | clipPath gone: signal lines, bars and Z fills are cut to the plot area in code. Bar fills are solid colours mixed with the paper colour when `paper` is given (the export always gives it); without paper they keep fill-opacity. Test: no pattern, patternTransform, clipPath, clip-path, filter, mask or url(#...). |
| F28.5 | Check the frame-window shading and arrows paste cleanly too (same test). Look at your render with a headless screenshot at 4x, crop the bar ends and the hatch edge. Stop: ask Blake to paste the exported SVG into PowerPoint (insert as picture, then convert to shape if wanted) and zoom in and out | | Done | Marker (frame window) keeps fill-opacity 0.18, so it can still tint; arrowheads and arrows are plain paths and pass the same test. 4x screenshots (headless Chrome, plain and centred) checked at bar ends and hatch edges. Blake: paste the exported SVG into PowerPoint and zoom. Stale outside timing/: figure-editor test slide.test.js:125 and browser scenario near scenarios.js:1137 expect clipPath/pattern ids. REVIEW STOP. Blake tested in PowerPoint 2026-11-24. |

Scope: `tools/timing/` only. Do not change the colour roles or the figure style. If the Schematic Editor or Figure Editor embeds its own copy of the timing drawing code, report it, do not fix it here. Review stop after F28.5 with a 5-line report.

### F29: Timing diagram: right edge, phase and delay fill, hidden signals (top priority)

Blake's report (2026-11-23), after F28: transitions and PDF export now look right, but (1) signals run past the right edge of the diagram; they must stop at it. (2) With phase or delay, the diagram must still be full: the missing part is filled in. (3) A new per-signal option to show or hide the wave, so a row can carry arrows and notes with no visible signal. (4) Added later the same day: the diagram should size itself to the editor's view window (F29.6).

What the code does now (`tools/timing/src/draw.js`): the plot is clipped at `W - 10` (`clipX1`), not at the end of the last step (`x0 + steps * stepW`). A signal with `period` above 1 or a positive `delay` (`xAt(i)`) runs beyond that. `delay` fills the left with the first level for level waves only (the `lane.delay > 0` branch); bars, clocks and gaps are not filled, and `phase` (shift left) leaves the right end short.

Rules to build (Blake's intent: the diagram is always filled edge to edge):
- **Right cut.** The plot area ends at `x0 + steps * stepW`. Every wave is cut exactly there, with the final segment trimmed to the edge (a bar stops at the edge with no end shape; a slanted edge that crosses the boundary is cut along the boundary, not moved). Clip the geometry in code; do not bring back `clipPath` (F28 removed it for PowerPoint). Head and foot ticks, the marker and arrows stay inside the same limit.
- **Left fill (delay).** Before the first step the lane shows its first value: a level holds its level, a bar continues as the same bar with the label kept once, an X stays hatched, a clock continues its pattern backwards. This was Blake's wording: "fill in the missing portion on the left with the left most value".
- **Right fill (phase).** Phase shifts the wave left; the gap that opens on the right is filled by holding the last value the same way. This is my reading of Blake's intent; Blake confirms at the review stop.
- **Hidden signal.** A per-signal option `hidden: true` (our own key, ignored by WaveDrom, saved in the file and in `circuit` annotations when embedded). The wave is not drawn, but the row keeps its height, its name (unless the existing show-names option is off) and every node letter position, so arrows can attach to it exactly where they would be if it were visible. Include a second small option to hide the name of one signal. Exports (SVG, PDF, PNG, per-frame) all follow it. In the editor, an eye toggle on each signal row; a hidden wave stays editable and its row is shown dimmed so it is not forgotten.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F29.1 | Failing tests first: signals with `period` 2, `delay` 0.5 and `phase` 1 never put geometry right of the plot end (check the exported path coordinates); delay and phase fill with the rules above for a level, a bar, X, a clock; a lane with `hidden` draws no wave but keeps the same node coordinates as the visible lane | `tools/timing/test` | Done | tools/timing/test/fill.test.js (9 tests, written first): nothing right of the plot end, delay/phase fill, hidden keeps node coordinates, hideName, model round trip, look reset on load. |
| F29.2 | Right cut and trimming in code for lines, bars, hatch, clock shapes, gap marks and arrows | `draw.js` | Done | draw.js: the plot ends at x0 + steps * stepW; lines, bars, hatch, Z fills cut there in code; a wave always runs one step past the edge so the cut is straight; arrows to a node cut off by the edge are not drawn. No clipPath or pattern. |
| F29.3 | Left fill for delay and right fill for phase, for every wave type | `draw.js` | Done | The wave is extended by whole steps in both directions (first value before the start, last value after the end; P and N become p and n); a bar that begins before the plot is cut square at the left edge, label once. Phase reading is mine; Blake confirms. |
| F29.4 | `hidden` (and hide-name): model field with setter and undo, drawing, node positions unchanged, row dimmed in the editor, eye toggle, saved and loaded | `model.js`, `draw.js`, `app.js` | Done | hidden and hideName: setProp, drawing (node coordinates unchanged; hideName drops the name from the label width), eye button and hide-name and hide-wave boxes on each row, dimmed hidden row; saved in the source. Undo goes through commit(). Added 2026-11-23 by Blake: loading resets the look to the defaults (page restore, Use this source, source set by a host); waves, arrows and signal options are kept. |
| F29.6 | Auto-fit to the viewing window (Blake, 2026-11-23): in the editor's view window the diagram sizes itself to the window, both width and height, and follows window resizes and a docked pane's resizes. Today `render()` uses `max(natural.w, room)` for width and grows the height only when the window is wider than natural, so a narrow window overflows and a tall window leaves empty space. Fit in both directions, with a readable minimum (below it, scroll rather than crush text). On by default; typing a size or pressing Natural switches it off, and the existing Fit control switches it back on. Exports keep using the set or natural size, not the window size. Test the sizing function with a few window sizes; no stretched text (steps and lanes re-space, as the code comment says) | `app.js` | Done | src/fit.js fitSize(): fills the view window in both directions, minimum 40% of the step width and 60% of the height (large text: natural size), then the window scrolls; wired into drawDiagram (paddings subtracted; changes under 3 px ignored). Exports without a set size use the natural size. Typing a size or Natural turns it off, Fit turns it back on (as before). 5 tests of the sizing function. Not checked in a live browser with a diagram open, only that the page loads: Blake to resize the window and look. |
| F29.5 | Look at a headless screenshot at 4x of the right edge, the left fill and a hidden row with arrows on it. Update the README. Stop: ask Blake to export to PDF and PowerPoint and look | | Done | 4x headless screenshot checked (right edge, left fill, hidden row with arrows). README not updated (stub; Scribe). F29.6 (auto-fit to the view window) is NOT done in this pass. Stale outside timing/: figure-editor slide.test.js:125. Blake: export to PDF and PowerPoint and look. Blake confirmed 2026-11-24. |

Scope: `tools/timing/` only. If the Figure Editor embeds its own timing code, report it, do not fix it here. Do not change colour roles. Review stop after F29.5 with a 5-line report.

### F24: Editor hands Frame 0 and forced levels to the simulator

Intent: finish the R1 simulator hand-over. Circuit-model C14 (tag `model-v0.8.0`; C15 is tagged `model-v0.9.0`, pin the newest) gave `scenario` two fields, `initial` (start state of flip-flops and latches) and `force` (a net held at a level over a range of steps), and `trace.forced` (forced stretches). The Schematic Editor stops keeping private hand-set values and forced levels and writes them into those fields; the simulator remains the only source of behaviour. Approved by Blake 2026-11-19.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F24.1 | Pin the newest circuit-model tag. Frame 0 hand-set Q on a stateful element writes `initial`; for a gate-level latch with no stored state the start is a `force` on that net for step 0 (as C14's `nand_latch_forced_start` example shows). A forced level in a later frame writes a `force` entry with `from` and `to`. Files saved before this change still load and are converted, nothing lost | Steward, approved by Blake 2026-11-19 | Done | Branch f24, not merged. Pinned model-v0.9.0 (MODEL_PIN.json, copy-model.js). src/scenario.js records hand-set levels on driven nets in annotations["schematic-editor"].scenario: Frame 0 Q or Qn of a latch or flip-flop is `initial`; any other driven net, and later frames, is `force` {id, level, from, to} by frame (neighbouring frames joined; kept aligned when frames move or are removed). Old files are converted on open from their frames; frames unchanged. |
| F24.2 | Show forced stretches from `trace.forced` in the schematic and the timing pane (marked by more than colour); remove the editor's own forced-level and hand-set evaluation code; the import-boundary test still passes | Steward, approved by Blake 2026-11-19 | Done | Schematic: wires a frame's `forced` lists (from trace.forced, saved per frame) get a dashed accent halo. Timing pane not marked: that would change the Timing Diagram's own features, which this batch excludes (question for Blake). calculateSteps no longer holds hand-set levels out of its results; they reach the simulator as scenario/0.2. Import-boundary test passes. |
| F24.3 | Tests: latch with a hand-set start, a forced node feeding downstream gates, release returning to the driven value, an old file converted. One screenshot of the latch page. REVIEW STOP | Steward, approved by Blake 2026-11-19 | Done | test/scenario.test.js (7 tests). Browser sequentialTiming updated: its old fixture's hand-set Frame 0 Q = 0 now converts to `initial`, so Q is 0111, not x111. Tests 228/51/30; browser 304 pass. Screenshot C:\Users\blake\r1-review\f24-latch-light.png. REVIEW STOP. |
| F24.4 | Adapter fixes from the Code Review (reviews/site/code-review.md), each with a failing test first: re-pin to the newest circuit-model tag; `resolveLogic` returns and shows simulator warnings; when the 64-step history window trims, keep the replayed state as `initial` so a latch does not revert to X; pulse-only keys are added to the input keys so a pulsed clock gets its edge; `knownDriven` memoises only results computed without a cycle cut (test on a cross-coupled circuit); level tag and bus label no longer overlap | Steward, approved by Blake 2026-11-20 | Open | |
| F24.5 | Handover: tests pass, privacy scan, report in 5 lines. REVIEW STOP | Steward, approved by Blake 2026-11-20 | Open | |


### F23: FSM tool

Intent: a standalone tool, one job: describe a finite state machine as a state diagram, a transition table or next-state and output equations, and edit any of the three while the others follow. Reads and writes the `fsm` format (circuit-model C15, tag `model-v0.9.0`); all conversions and simulation come from circuit-model, never reimplemented here. Follows the tool rules in VISION section 4: own page under `tools/fsm/`, a Tools-menu entry, the standard mount interface, import-boundary test. Approved by Blake 2026-11-19. Waits for C15 and for R1 to be merged.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F23.1 | Plan, no code: file layout, mount interface, how the three views stay in sync, state-diagram layout approach (automatic first placement, then drag), edge routing for curved arrows and self-loops, labels through MathJax. REVIEW STOP | Steward, approved by Blake 2026-11-19 | Open | |
| F23.2 | Transition table view and equations view (editable), encoding and flip-flop choices, Moore and Mealy | Steward, approved by Blake 2026-11-19 | Open | |
| F23.3 | State diagram view: draw and edit states and arrows, conditions on arrows, outputs on states or arrows; three views in sync; errors from C15 shown against the state and input combination | Steward, approved by Blake 2026-11-19 | Open | |
| F23.4 | Run it: step through inputs, highlight the current state, trace to the Timing Diagram; send the circuit to the Figure Editor; download the diagram as SVG in the default theme; `fsm` file download and upload | Steward, approved by Blake 2026-11-19 | Open | |
| F23.5 | README stub, tests, REVIEW STOP | Steward, approved by Blake 2026-11-19 | Open | |

Later, not queued: state minimisation, encoding comparison, SystemVerilog `case` export and recovery (with C11), a state-diagram animation in the toolbox.

---

### L1: Logic mini-tools: truth table, K-map, SOP and POS, Boolean solver

Intent: small standalone tools on the site, each one job, each reading and writing the `function` format (circuit-model C10) so output of one goes into the next, and "Send to Figure Editor" turns a function into a circuit. Folder `tools/logic/` only. Ship the first one as soon as C10 has its tag, then the rest; review stop after each tool. Draft until Blake approves.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| L1.1 | Truth table generator (from expression, or by entering rows) | Steward, approved by Blake 2026-11-14 | Done | Branch l1, draft. Blake, 2026-11-24, after seeing it: a don't care is shown as X (stored as `-` in the function file). tools/logic/truth-table/: expressions (one `name = expression` per line, optional input order) or hand entry (press a cell: 0, 1, don't care); minterm and maxterm lists; copy Markdown, LaTeX tabular, CSV; download and open `function/0.1` files (checked against the schema). Reuses the analyser's pinned model-v0.10.0 copy (../analyze/model) and its export.js; no new pin, no new minimiser. Cap 8 inputs (the model's). 16 tests. |
| L1.2 | K-map tool with grouping shown, SOP and POS results, don't-cares | Steward, approved by Blake 2026-11-14 | Done, review stop | Branch l1, draft. tools/logic/kmap/: map for 2 to 4 inputs (1 also works) in Gray-code order; groups of the library's minimal covers (logic/kmap.mjs, Quine-McCluskey and Petrick, no new minimiser) drawn on it, each with its own colour, dash and number, wrapped groups left open at the map edge; SOP (groups the 1s) and POS (groups the 0s); X cells are clickable, and the text says which X a group uses; every cover is checked against the table before it is shown; equally small forms selectable; function-file download and open; Figure Editor and solver hand-off. **5 and 6 inputs: Deferred (Blake, 2026-11-25).** The course (Harris and Harris chapters 1 to 5) uses at most 4 variables, and the pinned library lays out only 1 to 4; 5 and 6 (two or four layers) need a circuit-model batch first. 10 tests. Review steps: docs/REVIEW_L1.md. Screenshot (group numbers at bottom-left): C:\Users\blake\AppData\Local\Temp\claude\66c297b9e354cffc\170e65c2-1e70-4af3-9448-861df40e85f7\scratchpad\km3.png. |
| L1.3 | Boolean algebra step-by-step solver showing the rule used on each line (rule names from the course) | Steward, approved by Blake 2026-11-14 | Done, review stop | Branch l1, draft. tools/logic/solver/: goals SOP, POS, NAND-only, NOR-only and prove-equal (chain through the minimal SOP, or a counterexample table); every line (and each side of a proof) is checked against the truth table in code before it is shown, and a failed check shows an error instead of steps; each line names the law, states it and shows the part changed (diff of the two trees); POS and NAND and NOR reuse simplify plus explicit De Morgan and involution lines, no new minimiser; "your turn" mode. 18 tests. **Limit:** the library exports no way to apply one law, so "your turn" can only check the choice against the law the tool uses next and says another law may also apply; checking any law needs circuit-model to export its rules. Blake, 2026-11-23: wants this one. Library `L.simplify(expr).steps` exists. Each line shows the law used and the part it was applied to; check every step against the truth table in code so a wrong step can never be shown; also solve toward SOP, POS, NAND-only and NOR-only forms, and "prove two expressions equal" with a counterexample row when they are not; a "your turn" mode where the student picks the law |
| L1.4 | Send to Figure Editor and download and upload of the `function` file on every tool | Steward, approved by Blake 2026-11-14 | Done, review stop | Branch l1, draft. tools/logic/common/ (shared page helpers, hand-off); every tool reads and writes `function/0.1` files (truth table and solver download and open them; the analyser opens them as `name = expression` lines). Send to Figure Editor on the truth table (per output), solver and analyser: opens the editor in a new tab with `?open=` set to a blob: address, which the editor accepts as same-origin, so no editor change; **not tested across tabs in a live browser** (the sending tab must stay open). Links to the Boolean solver from the truth table and analyser (a link with the expression and goal filled in). The K-map tool (L1.2) is now built and has the same hand-offs; the truth table, solver and analyser link to it (not offered above 4 inputs). 6 tests. Review steps: docs/REVIEW_L1.md. |

---

### L5: Circuit analyser (combinational check, truth table, SOP and POS, LaTeX)

Intent: Blake's ModelSim script `module_generic.do` forces every input combination on a module, reads the output, and writes a Markdown report. This batch does the same in the browser, from a circuit, with no ModelSim. Folder `tools/logic/analyze/`. Waits for circuit-model C17 (tagged). Plan first, stop for Blake's OK, then one step at a time. Draft until Blake approves. Student-facing text never says "simply", "obviously" or "trivially".

What the script produces, which the tool must match: the truth table with one column per input bit and per output bit (named `a[3]`, `y[0]`); the table as a LaTeX `tabular`; for every output bit the minterm list (sigma m) and maxterm list (pi M), the canonical SOP and POS with term counts, shown rendered and as copyable LaTeX; combined `aligned` blocks for all outputs; and a "best implementation" pick per output.

What the tool does better (all from the existing `logic/` library):
- A verdict first: "combinational" or not, with the reasons from C17 (sequential element, feedback loop with the nets named, tri-state, too many inputs). Not combinational means no table, and a pointer to the FSM tool when it is a clocked circuit.
- Minimal SOP and POS by Quine-McCluskey beside the canonical ones. The script's "best" only compares canonical term counts, which is not the cheapest form.
- Outputs that are X or Z on some rows are shown as don't-cares and flagged. The script counts anything not 1 as 0, so those rows would pass silently.
- Several inputs and several outputs, any bus width up to the C17 cap, with a clear message above it.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| L5.1 | Plan: layout, what is in the first release, how a circuit gets in (a circuit file, the editor's current circuit; SystemVerilog arrives with C11) | Blake, 2026-11-23 | Done | Plan in tools/logic/analyze/PLAN.md. Blake 2026-11-23: wants a text editor for input; cap 16 inputs; show every minimal form when there are several; may touch copy-model.js and _quarto.yml. |
| L5.2 | Verdict and truth table: paste or upload a `circuit`, run C17, show the verdict and the table with per-bit columns | | Done, review stop | Branch l5, draft, not merged. Text editor (circuit JSON or one `name = expression` per line) with samples, open file, live verdict and table. Pinned model-v0.10.0 copy in tools/logic/analyze/model/ (copy-model.js --only logic; the editors' pin is untouched). 9 tests. **Cap is 8, not 16:** circuit-model C17's MAX_INPUTS and the function/0.1 format allow 8 variables; 16 needs a circuit-model batch (function/0.2, cap 16, a speed check of the minimiser at 16 variables). Tool reads the cap from the model, so re-pinning raises it. |
| L5.3 | Expressions: per output, sigma m and pi M, canonical and minimal SOP and POS, term and literal counts, best pick, rendered in MathJax | | Done | src/forms.js: Σm and ΠM, canonical SOP and POS, every smallest cover from the library's Quine-McCluskey and Petrick (no new minimiser); a cover is smallest by terms, then literals, so a form whose terms could still combine is never offered. All forms are checked against the table before they are shown. Best pick compares gate inputs over the smallest covers (a tie says so; Blake's script compared canonical term counts). MathJax is loaded by the page (Quarto loads it only on pages with maths). |
| L5.4 | Copy and export: Markdown, LaTeX (table, aligned equations), CSV, and the `function` file; a "Copy as Verilog `assign`" for the minimal form | | Done | Copy: Markdown, LaTeX table, LaTeX equations (per output or one aligned block), CSV, Verilog assign (cheapest of minimal SOP and POS), function/0.1 files (one per output bit). |
| L5.5 | Send to: K-map tool, Boolean solver (L1.3) with the chosen expression, Figure Editor (minimal circuit) | | Partly done | Figure Editor: downloads the minimal form's circuit (logic/circuit.mjs), tested by analysing it again and getting the same table; open it in the Figure Editor with its Open command (no hand-off channel without changing the editor). K-map tool and Boolean solver do not exist yet (L1.2, L1.3): they will read the function files. |
| L5.6 | Check my answer: enter an expected truth table or expression, get the first differing rows (C17.5) | | Done | Check my answer: expressions or compact tables (`Y(A,B,C) = 0110...`), circuit compared with compareCircuit (C17.5), typed expressions with compareFunctions; first 8 differing rows. L5 review stop. 21 tests; screenshots in the report. Cap stays 8 (circuit-model). |

Ideas for later, not in this batch (Blake decides): hazard finder (static-1 hazards from the K-map groups, Chapter 2); gate count and longest path; NAND-only and NOR-only rewrites of the minimal form; a printable worksheet with blanks; and a "predict first" mode where the student fills in the table before it is revealed.

---

### L2: Small converters from Harris and Harris chapters 1 to 5

Intent: quick wins for lectures. Folder `tools/logic/`. Each tool is one page with a short explanation and an example.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| L2.1 | Number systems converter (binary, hex, two's complement, signed range) | Steward, approved by Blake 2026-11-14 | Open | |
| L2.2 | IEEE 754 and fixed-point converter showing the bit fields | Steward, approved by Blake 2026-11-14 | Open | |
| L2.3 | Adder delay comparison (ripple versus lookahead) and a critical-path calculator | Steward, approved by Blake 2026-11-14 | Open | |
| L2.4 | Setup and hold timing calculator with a small timing figure | Steward, approved by Blake 2026-11-14 | Open | |

---

### L3: Equation library, core 100 to 300 level

Intent: a toolbox of the equations a student meets in 100 to 300 level ECE (Ohm and Kirchhoff, dividers, RC and RL step response, RMS, power, op-amp gains, filters, diode and transistor basics). Each entry: the equation in STIX Two, a plain explanation, variables with units, a solver that rearranges for any variable, and a graph. Folder `tools/equations/`. All text original; no copying from books. Review stop after the first five entries; Blake approves the entry template first.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| L3.1 | Entry template and one worked entry for review | Steward, approved by Blake 2026-11-14 | Open | |
| L3.2 | Next four entries and an index with search | Steward, approved by Blake 2026-11-14 | Open | |
| L3.3 | Remaining core list agreed with Blake after review | Steward, approved by Blake 2026-11-14 | Open | |

---

### R1: Reconcile the beta into modular tools

Intent: GitHub Copilot's Nov 15-16 work (see Current state) is kept in full, but the fork goes away and the code becomes modular, so the same drawing pane can serve the Figure Editor now and a simulator later.

**Blake's decisions (2026-11-19; VISION sections 4 and 6).**
- **Schematic Editor** = the drawing pane: elements, wires, labels, levels, frames of levels, import and export of `circuit`. Its own page, `tools/schematic-editor/`.
- **Timing Diagram** = the timing module already in `tools/timing/`; its own page stays.
- **Figure Editor** = the composite at `tools/figure-editor/`: Schematic Editor plus Timing Diagram plus slide export, ZIP export and the links between them.
- Each tool mounts on its own page and inside a composite through one small documented interface (for example `mount(el, options)` returning `load`, `save`, `on("change")`, plus the shared formats `circuit`, `scenario`, `trace`, `function`). No tool imports another tool's internals.
- Every tool gets its own entry in the site's Tools menu.
- Keep every Copilot feature: straight wire legs, manual logic mode (manual values override computed ones), level sync both ways between schematic and timing, Frame 0 neutral frame, ten slide layouts, ZIP export, LaTeX truth-table export, net-level tags, resizable and maximisable panes, all timing-module additions.
- Behaviour comes from circuit-model's simulator (tag `model-v0.7.0`, batch C13): delete `logic.js` and `sequential.js` only after the same tests pass against the simulator. Lift Copilot's calculation limits (period 1, zero phase and delay, direct pulse clocks) where the simulator allows; report any it cannot.
- Wire legs: `circuit/0.3` from the C13 tag; snap to 45 degrees by default, a modifier key for a free angle; remove `pending_schema` from MODEL_PIN.json.
- Beta URL redirects to the Figure Editor; saved work under `figure-editor-beta/*` and `figure-editor/*` keys migrates once, nothing lost; tag `editor-before-r1` first.
- Replace the hard-coded colour defaults in `tools/timing/src/draw.js` with role lookups.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| R1.1 | Plan only: a feature inventory (stable vs beta, every Copilot feature listed), the module boundaries and the mount interface, the file moves, and the test plan. REVIEW STOP for Blake | Steward, approved by Blake 2026-11-19 | Open | |
| R1.2 | Tag `editor-before-r1`; build the Schematic Editor module from the merged code (beta features folded in) with its own page | Steward, approved by Blake 2026-11-19 | Done | 1fc867b (branch r1, not merged): tag editor-before-r1 (origin/main 3b24e21). tools/figure-editor-beta moved to tools/schematic-editor (one copy; every Copilot feature kept); own page; mount() in src/index.js (load and save circuit; change and status events; command, commands, panes, destroy) on the shared bus tools/shared/src/tool.js. Editor data in a circuit file goes through src/annotations.js only (FILE_KEY = groups; set to annotations when C13.5 is tagged). Tests: 220 schematic, 49 timing. |
| R1.3 | Build the Figure Editor as the composite; beta and old URLs redirect; storage migration; Tools menu entries for each tool | Steward, approved by Blake 2026-11-19 | Done | 1fc867b (branch r1, not merged): tools/figure-editor is the composite: lends slide, ZIP, LaTeX table and the Timing Diagram to the Schematic Editor's shell (src/index.js); the Timing Diagram has the same interface (wavedrom) and its own page again, sharing timing-diagram/source with the composite. Beta URL redirects with its query; storage migrates once (beta autosave wins, the other goes to the saved list, old keys kept, flag figure-editor/migrated-r1). Tools menu: Figure Editor, Schematic Editor, Timing Diagram. Tests: 30 composite incl. import-boundary and event-bus tests; browser suite all scenarios, new interface scenario passes; 4 scenarios fail (blocks, logic, frame, logicSync) and fail identically on editor-before-r1. Then 33eac84: the composite builds its own shell (toolbar from the Schematic Editor's button groups plus its own, and the section stack with bars and resizers); the Schematic Editor embedded (host: true) fills only the slots it finds and has no toolbar; a toolbar-less host (as a simulator page) is tested. Browser suite: every scenario passes (blocks, logic, frame, logicSync fixed; frame now checks the F19 slide, since F10's canvas frame was folded in). Real bugs found on editor-before-r1 and fixed: (1) gate outputs never recalculated while editing, because Frame 0 (always selected) preserved levels; now an edited input recalculates and an edited output is kept as a manual override; (2) a frame captured past the timing diagram's last step was wiped at once by the automatic timing resync; (3) automatic resync filled a figure with empty frames from a timing diagram that names nothing in it. |
| R1.4 | After the C13 tag: switch to the circuit-model simulator with parity tests, lift the calculation limits, adopt `circuit/0.3` with 45-degree snap | Steward, approved by Blake 2026-11-19 | Done | Branch r1-4 (5b1fdfd, 902f74e and the R1.4/R1.5 commit; merged to main). MODEL_PIN.json: model-v0.7.0, pending_schema removed; simulator, validator and schemas copied by tag (tools/shared/scripts/copy-model.js). Editor data in annotations["schematic-editor"] (slide in ["figure-editor"]); buses back in groups; old files open. Levels from the simulator (src/simlevels.js); parity suite passed with only listed differences (commit 902f74e), then logic.js, sequential.js and their tests deleted. Limits lifted: pulses through gates, whole-number periods, whole-step phase and delay. Cannot: fractional period, phase or delay (a level changes inside a step); a calculated signal with a period or shift. Straight legs snap to 45 degrees (Shift), Shift+Alt any angle; annotations snap_degrees honoured. Questions for Blake in the R1.5 report. |
| R1.5 | Colour roles in draw.js; full test run; one screenshot per page in light and dark; REVIEW STOP | Steward, approved by Blake 2026-11-19 | Done | Same branch. draw.js asks tools/shared/src/roles.js for --fig-ink and --fig-accent (currentColor with no page). Tests: 220 schematic, 51 timing, 30 composite; browser suite all pass. Screenshots in C:Userslake1-review1-5. REVIEW STOP. |

---

### F25: Hardening and records from the reviews

Intent: close the CI, privacy and record-keeping gaps the Security, Engineer and IP Inspector reported (`reviews/site/*.md`, private). Approved by Blake 2026-11-20. Branch protection on `main` is a GitHub setting only Blake can change; the builder must not claim it is done.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F25.1 | `publish.yml`: a test job (Quarto's Deno) that the build job needs, so failing tests stop the deploy; `permissions: contents: read` on build and `pages` and `id-token` only on deploy; every action pinned to a commit SHA; a privacy scan step that fails on phone numbers, `*_CV_*` files and any email other than the one Blake published, over the source and the rendered site; `.gitignore` widened for CVs and resumes (`*[Cc][Vv]*.pdf`, `*resume*`, `*.docx`) | Steward, approved by Blake 2026-11-20 | Done | Branch f25. Test job (schematic, timing, figure-editor tests, privacy scan) gates build; per-job permissions; actions pinned; sri check and privacy scan of the rendered site before upload; Dependabot for actions. Branch protection NOT set: only Blake can. |
| F25.2 | Integrity hashes and `crossorigin="anonymous"` on the MathJax, WaveDrom and DigitalJS tags; where a loader cannot take a hash (the editor's dynamic MathJax import) say so in DECISIONS.md; `data-circuit` limited to same-site files. These are interim until F26 | Steward, approved by Blake 2026-11-20 | Done | scripts/sri.js adds hashes and crossorigin to the MathJax, WaveDrom and DigitalJS tags after render and fails the build on an unpinned one (Quarto's polyfill tag is removed); the editors' dynamic MathJax carries its hash (MATHJAX_SRI). Branch f22-0, merged to main: `data-circuit` goes through `sameSiteUrl` in `_includes/digitaljs.html` (same origin, http or https, no login in the address, no credentials sent, redirects refused); 3 tests in tools/schematic-editor/test/same-site.test.js. Google Fonts CSS and MathJax's dynamic font files cannot be hashed. |
| F25.3 | Housekeeping: a test that recomputes each pinned copy's SHA-256 against its MANIFEST in CI; the model pin written in one place (`copy-model.js` reads `MODEL_PIN.json`); stale paths fixed in `copy-symbol-pack.js`, its manifest note and `test/run.js`; `tools/figure-editor-beta/` either carries `noindex` or is deleted (ask Blake) | Steward, approved by Blake 2026-11-20 | Done | Blake, 2026-11-24: keep tools/figure-editor-beta/ with noindex (delete later once nothing is missing). Branch f22-0. tools/schematic-editor/test/manifests.test.js (runs in CI with the schematic tests): every pinned copy (symbol pack, editors' simulator, validator and schemas, logic tools' copy) against its MANIFEST; the pin check; stale-path check; beta noindex check. MODEL_PIN.json now holds `logic_tag` and `logic_commit` and `copy-model.js` reads both (refuses a tag whose commit differs). Stale paths fixed in copy-symbol-pack.js, build-sample.js, tex-needed.js, the pack's manifest note and test/run.js. **Found:** `.gitattributes` still named tools/figure-editor/symbol-pack, so a Windows checkout rewrote line endings and the hashes failed; now `-text` for all four pinned folders. Beta: Blake said noindex, not delete; `tools/_metadata.yml` already applies it to the redirect page (the test checks it). |
| F25.4 | `assets/wavedrom/lecture.js`: fonts changed to STIX Two Text and Fira Mono, and WaveDrom's MIT notice added as a third-party notice comment | Steward, approved by Blake 2026-11-20 | Done | Branch f22-0, merged to main. Text is STIX Two Text via `--fig-font` (fallback the same value); a `.mono` class gives Fira Mono via `--fig-font-mono`, **but no WaveDrom element uses it yet** (question for Blake: signal names in Fira Mono?). Checked 2026-11-24: the Timing Diagram tool draws signal names in STIX Two Text (`FAMILY` in tools/timing/src/draw.js), or as outlined TeX (STIX2) when the name is typeset; Fira Mono is used only in its editing grid, not in the figure. WaveDrom already matches; `.mono` can be dropped unless Blake wants Fira Mono in figures. The `?open=` gap I reported was closed with F22.1a (see its row). MIT licence text, copyright line and "restyled copy of WaveDrom 3.7.0" as the file's first comment. 2 tests in wavedrom-skin.test.js. |
| F25.5 | Records in DECISIONS.md: a dated licence table (DigitalJS 0.14.2 BSD-2-Clause, WaveDrom 3.7.0 MIT, MathJax 4.1.3 Apache-2.0 with the mathjax-stix2 font OFL, IBM Plex, STIX Two and Fira Mono OFL, Quarto with Deno and Observable Plot, the IEEE CSL style CC BY-SA 3.0 used unmodified and kept separate); Blake's decisions of 2026-11-20 (the work email in early commits is accepted; AI commits keep the AI as author; the published circuit-model copies are accepted and their paths listed; planning documents stay public until launch; the shared Pages `localStorage` origin noted); an open item that co-author consent for the PLL project and the advisor's or IP office's OK for the CSNN project are not recorded yet (Blake confirms, the builder never writes them as done). REVIEW STOP | Steward, approved by Blake 2026-11-20 | Partly done | Licence table in DECISIONS.md (2026-11-20 entry) with the delivery safeguards; co-author consent and the advisor's OK are listed as open items, not recorded. |

---

### F26: Self-host third-party assets (before launch)

Intent: the public pages stop calling outside services, so visitors' addresses go nowhere and every file has a recorded licence. Fonts (IBM Plex, STIX Two, Fira Mono as woff2 with their OFL texts), MathJax 4 with the mathjax-stix2 bundle, WaveDrom and DigitalJS move under `assets/`, pinned, with licence texts. Remove every CDN reference; remove the integrity-hash interim. Plan first and stop: sizes, where each file lives, how the Quarto build copies them. Approved by Blake 2026-11-20; runs before launch.

---

### F27: Figure fixes from the Aesthetic review

Intent: make the first things a visitor sees consistent with the figure rules. No prose by the builder; figures and notation only. Approved by Blake 2026-11-20.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F27.1 | K-map page: the Q-bar in the timing figure uses the TeX signal name (`\overline{Q}`) instead of a combining character; the figure uses overbars like the text, not primes; `kmap.svg` regenerated from the role colours with outlined STIX Two glyphs and no literal hex colours; each loop labelled with its term or given its own dash pattern | Steward, approved by Blake 2026-11-20 | Open | |
| F27.2 | DigitalJS plate: wire and port colours from `--fig-high` and `--fig-ink`, labels in the figure font, paper sized to the circuit | Steward, approved by Blake 2026-11-20 | Open | |
| F27.3 | Editor demo: name the ports (A, B, Cin, S, Cout) and draw unselected port markers at full opacity. One screenshot of each changed page. REVIEW STOP | Steward, approved by Blake 2026-11-20 | Open | |

---

## Reviews (updated 2026-11-20)

Five reviewers (security, engineer, code-review, aesthetic, ip-inspector) are report-only and run when Blake asks, before big milestones. They work from the private `reviews` repository, write only there (`<repo>/<agent>.md`) and never change this repository. Items Blake has decided are in `reviews/DECISIONS.md`. The Steward triages findings into batches; Blake approves.

## Notes for the Scribe

(Builders: add a dated line here when a doc no longer matches the code.)

- 2026-11-16 (Blake authorized Copilot): beta timing can calculate NAND/NOR latches, D latches, and D/JK/T flip-flops from Frame 0 and timing inputs; manual cells take priority and remain distinct from calculated cells. Calculation prompts for unknown or invalid state and keeps completed steps on cancellation. Rising edges are detected between steps; pulse lanes trigger after the first step. Calculation currently requires period 1, zero phase and delay, and direct pulse clocks. After editing a timing frame's schematic levels, recalculate timing to refresh computed levels. Scribe: document the calculation button, limits, and state prompts in the beta and timing READMEs.
- 2026-11-13 (F5, F12, beta editor): `tools/figure-editor-beta/README.md` does not describe the block element and its 21 presets, wire arrows and bus marks, element level, SVG import (the circuit inside exported SVGs; backdrop), or the commands `quarto run tools/figure-editor-beta/scripts/tex-needed.js` and `.../test/browser/check.js [dark] [wires] [saves] [blocks] [marks] [levels] [import]`. Exported SVGs now hold a `<metadata>` element with the circuit text. The KEYS list in `src/app.js` has the new keys.
- 2026-11-16 (Blake authorized Copilot): T2.2 beta work is in 4b0f807 and a8c89f7. In addition to the details in the T2.2 row, the timing module README remains a stub; Scribe should document the LaTeX signal/edge rendering, spacer lanes, data-signal colour controls, and independent arrow-line/head controls. No dependencies added; stable-editor working changes were not included.
- 2026-11-15 (T2.2 beta refinements; Blake asked to push): commit 5fd1c3f adds same-label level propagation, configurable level tags, full-height transitions into X/Z/data, look reset, per-shape dotted arrows, and aspect-ratio locking. Scribe: document the new controls and same-label behavior in the beta and timing READMEs. Stable-editor working changes were not included.
- 2026-11-15 (beta timing transition rendering): beta edge nodes stay at transition centres as lean changes; binary-to-X/Z/data transitions reach full lane boundaries. Stable and standalone timing keep their existing rendering. Scribe: add this behaviour to the timing README.
- 2026-11-15 (beta logic gates): AND, NAND, OR, NOR, XOR and NOT gates calculate their output nets from input levels, including X/Z handling and multi-input variants. Scribe: document how to set inputs and how computed outputs behave.
- 2026-11-15 (Blake authorized Copilot): beta editor now keeps an all-zero Frame 0, refreshes timing-derived frames on workspace return, syncs selected-frame logic-level edits back to timing, and adds a prompt-based schematic-to-timing send. It also adds persistent controls, resizable/maximizable workspaces, ten slide layouts, timing source upload and TeX node buttons; net labels default to 18 pt and left/right anchors use wire extremes. Transition geometry rollback and these beta changes need documenting in the beta and timing READMEs.
- 2026-11-15 (Blake authorized Copilot): beta Frame 0 is now an explicit neutral frame with no logic levels; its schematic export has no net highlighting, and sending it to timing reports that it has no levels. The beta toolbar adds a client-side ZIP export containing schematic PNG/SVG/circuit JSON, timing-diagram PNG/SVG/WaveDrom JSON, and `source.json` combining both editable sources. Logic-level tags now appear once per connected or named net, on its longest levelled wire segment. No dependency added; Scribe: document the ZIP contents, project JSON format, and net-level tag behavior in the beta README.
- 2026-11-15 (Blake requested): beta logic now recognizes cross-coupled two-input NAND pairs as active-low SR latches. It resolves set, reset and the invalid both-active case, retains a known state while both controls are inactive, and shows X when the inactive latch has no initialized state. Scribe: document latch behavior and state initialization in the beta README.

- 2026-11-13 (F2, branch `figure-editor`): new page `tools/figure-editor/` and commands
  `quarto run tools/figure-editor/scripts/copy-symbol-pack.js`, `.../test/run.js` and
  `.../scripts/build-sample.js`. Only a stub `tools/figure-editor/README.md` exists. The
  copy script is `.js`, not the `.mjs` the proposal names (`quarto run` refuses `.mjs`).
- 2026-11-13 (F3.1, branch `figure-editor`): the editor page gained a Port tool (P), a Label tool
  (T), keys 0 1 X Z for wire levels, a "?" panel of keys, export options (scale, label size, level
  tags), Copy as PNG, a private theme loaded from a local file (browser only; `roles` only) and a
  show-drafts switch. New commands: none; `copy-symbol-pack.js` now takes `--ref symbols-v0.2.0`.
  The labelled sample is `examples/full-adder-levels.*`. Labels load MathJax 4.1.3 and its font
  data from jsDelivr on first use. A reference page for the key list (`KEYS` in `src/app.js`) and
  the private-theme file format is the Scribe's.
- 2026-11-15 (Blake authorized Copilot): `tools/figure-editor-beta/` is now a copy of the current stable editor plus Shift-click straight wire legs, using draft `circuit/0.3`; ordinary clicks still route orthogonally. The stable editor stays orthogonal. Beta storage uses separate `figure-editor-beta/*` keys. Scribe: update the beta README/proposal. Blake explicitly authorized Copilot to make this change.
