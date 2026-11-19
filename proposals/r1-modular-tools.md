---
title: "R1: modular tools (plan)"
doc-type: proposal
batch: R1.1
updated: 2026-11-19
---

# R1: Reconcile the beta into modular tools (plan)

Plan only (R1.1). No code is changed by this document. It answers the five points of R1.1 and ends with
questions for Blake. Sources: `docs/STEWARD_HANDOFF.md` (Current state of 2026-11-19, batch R1, Notes for
the Scribe), `VISION.md` sections 4 and 6, and the code on `origin/main` (3b24e21).

## 0. Starting point

| Path | What it is now |
|---|---|
| `tools/figure-editor/` | The stable Figure Editor: schematic canvas, docked Timing pane, slide view, frames, level colours, family popover. 1,643-line `src/app.js`. |
| `tools/figure-editor-beta/` | Copilot's full copy of the editor plus its features. 39 files differ from stable; `src/app.js` is 2,607 lines; new `logic.js`, `sequential.js`, `zip.js`, `latex-table.js`. Own keys `figure-editor-beta/*`. Page title "Schematic Editor (beta)". |
| `tools/timing/` | The shared timing module (one copy, used by both editors). `mount(root, options)`; beta-only behaviour behind `betaFeatures: true`. |
| `tools/timing-diagram/` | A redirect page to `figure-editor/?view=timing`. |
| Tools menu | Figure Editor, Timing Diagram. |

The stable editor's `src/app.js` is one large module that mixes the drawing pane, the timing pane, the slide,
frames and page chrome. The beta repeats that, larger. R1 splits it along the lines VISION section 4 draws.

## 1. Feature inventory: stable versus beta

S = stable has it. B = beta has it. "Goes to" names the module that owns the feature after R1.

### 1.1 Drawing (Schematic Editor)

| Feature | S | B | Goes to | Note |
|---|---|---|---|---|
| Place, move, rotate, mirror elements; wires anchored to pins; junctions; ports; labels | ✓ | ✓ | Schematic | |
| Orthogonal wire routing | ✓ | ✓ | Schematic | |
| Shift-click straight (diagonal) wire legs | | ✓ | Schematic | Draft `circuit/0.3` (`MODEL_PIN.json` `pending_schema`). R1.4: adopt `circuit/0.3` from the C13 tag; snap to 45 degrees by default, a modifier for a free angle. |
| Blocks and 21 presets; wire arrows; bus marks | ✓ | ✓ | Schematic | |
| Wire and element levels (0 1 X Z); level colours per figure (F17) | ✓ | ✓ | Schematic | |
| Net labels with position and spacing | ✓ | ✓ | Schematic | Beta: 18 pt default; left and right anchors use wire extremes. |
| Net-level tags once per connected or named net, on its longest levelled segment | | ✓ | Schematic | |
| Same-label level propagation | | ✓ | Schematic | From commit 5fd1c3f. |
| Configurable level tags | | ✓ | Schematic | 5fd1c3f. |
| Family popover (N inputs), drafts marked, symbols-v0.3.0 | ✓ | ? | Schematic | Check the beta is on symbols-v0.3.0 (question Q6). |
| SVG import (circuit inside exported SVGs; backdrop) | ✓ | ✓ | Schematic | |
| Built-in logic evaluator: AND, NAND, OR, NOR, XOR, NOT incl. multi-input, X and Z | | ✓ | Schematic, then simulator | `logic.js`. Retired in R1.4 (section 5.3). |
| Cross-coupled NAND pairs as active-low SR latches; D latches; D, JK, T flip-flops | | ✓ | Schematic, then simulator | `logic.js`, `sequential.js`. |
| Manual logic mode (manual values override computed ones) | | ✓ | Schematic | Stays: a user override is not simulation. |
| Full-adder start computed from its gates (`demo.js`) | ✓ | ✓ | Schematic | Beta's `demo.js` is larger (176 changed lines). |
| Undo, autosave, saved list, private theme | ✓ | ✓ | Schematic | |

### 1.2 Frames (shared: owned by the Schematic Editor, read by the Timing Diagram)

| Feature | S | B | Goes to | Note |
|---|---|---|---|---|
| Frames of levels: capture, rename, reorder, delete, fill from timing | ✓ | ✓ | Schematic | |
| Frame 0: an explicit neutral frame with no levels; its export has no net highlighting | | ✓ | Schematic | |
| Frame stepper and go-to box in the toolbar; Export frames | ✓ | ✓ | Composite toolbar | |
| Refresh timing-derived frames on workspace return | | ✓ | Composite | |

### 1.3 Timing Diagram (`tools/timing/`)

| Feature | S | B | Note |
|---|---|---|---|
| Step editor (Signals, Arrows, Title and ticks, Look); every WaveDrom value; nodes and edges; head and foot; slant | ✓ | ✓ | |
| WaveDrom source view, copy and paste | ✓ | ✓ | |
| WaveDrom source editor and source upload | | ✓ | |
| TeX signal names and TeX edge labels; TeX node buttons | | ✓ | Needs the Schematic Editor's MathJax typesetting, passed in as a callback today (`typesetSignalNames`). |
| Spacer lanes | ✓ | ✓ | |
| Data-value colours (controls per data signal) | | ✓ | |
| Separate arrow line and arrow head controls; per-shape dotted arrows | | ✓ | |
| Full-height transitions into X, Z and data; aspect-ratio lock; look reset | | ✓ | 5fd1c3f. |
| Centred transitions (edge nodes stay at transition centres as lean changes) | | ✓ | Beta-only rendering; stable and standalone keep the old one (question Q3). |
| Sequential timing calculation from Frame 0 and timing inputs; manual cells win; prompts for unknown or invalid state; keeps completed steps on cancel | | ✓ | Limits today: period 1, zero phase and delay, direct pulse clocks. R1.4 lifts them with the simulator. |
| Level sync both ways (schematic to timing, timing to schematic) and prompt-based send | | ✓ | Becomes events across the mount interface (section 2). |
| Hard-coded colour defaults `#000000`, `#0072B2` in `draw.js` | ✓ | ✓ | R1.5: role lookups. |

### 1.4 Figure Editor (composite)

| Feature | S | B | Note |
|---|---|---|---|
| Docked Timing pane; resizable and maximisable panes; persistent controls | ✓ (resizable) | ✓ | The unpushed sliding-sections change (Q7) is a third layout of the same idea. |
| Slide: sizes, header and footer, regions on the grid, dividers | ✓ | ✓ | |
| Slide layouts: 8 in stable | ✓ | | |
| Ten slide layouts | | ✓ | Keep beta's ten; check they include stable's two "timing across the bottom" layouts (Q4). |
| Whole slide and per-region SVG and PNG | ✓ | ✓ | |
| ZIP export: schematic PNG, SVG, circuit JSON; timing PNG, SVG, WaveDrom JSON; `source.json` combining both | | ✓ | `zip.js`, no dependency. |
| LaTeX truth-table export | | ✓ | `latex-table.js`. Works from a truth table, so it fits better as a `function` export (Q5). |
| Truth table storage (`figure-editor-beta/truth-table`) | | ✓ | |

### 1.5 Site

| Item | Note |
|---|---|
| `--fig-unknown` and `--fig-floating` roles in `themes/okabe-ito/figures.scss` | Keep. `draw.js` and `levelcolours.js` should read them. |
| Work email removed from `_title-block.qmd` | Done; nothing to do. |

## 2. Module boundaries and the mount interface

### 2.1 The three tools

```
tools/schematic-editor/   Schematic Editor: drawing pane, frames, levels, logic overrides
tools/timing/             Timing Diagram module (the code); tools/timing-diagram/ is its page
tools/figure-editor/      Figure Editor: composite of the two, plus slide, ZIP, frame stepper
```

Rule: a tool imports only its own `src/` and the shared, tool-free helpers in `tools/shared/` (section 3).
The composite imports each tool's `index.js` and nothing else from it. A test checks this (section 5.2).

### 2.2 One interface for every tool

```js
const tool = await mount(element, options);
```

Options common to every tool:

| Option | Meaning |
|---|---|
| `storage` | Key prefix, e.g. `"schematic-editor/"` alone or `"figure-editor/schematic/"` inside the composite. Replaces today's `storageKey`, `sendKey`, `editorKey`. |
| `embedded` | `true` inside a composite: no page chrome (no toolbar, no fixed full-window layout). The composite owns the toolbar. |
| `theme` | `{ dark, roles }` from the host. Replaces each tool reading the site's CSS on its own. |
| `services` | Shared functions the host lends, e.g. `typeset(texList) -> Map` (MathJax), so the timing tool no longer gets the editor's typesetter through ad hoc callbacks. |

Returned object, the same shape for every tool:

| Member | Meaning |
|---|---|
| `load(format, data)` / `save(format)` | Read or write one of the shared formats as text. |
| `on(event, fn)` / `off(event, fn)` | Events (below). |
| `command(name, args)` | Toolbar actions the host may forward: `new`, `undo`, `redo`, `export`, `exportPng`, `fit`. Each tool lists its own in `commands()`. |
| `commands()` | The commands this tool accepts, with labels and keys, so a composite can build one toolbar. |
| `panes()` | The side panes this tool contributes: `[{ id, title, element }]`. The composite places them; standalone, the tool places them itself. |
| `destroy()` | Remove listeners and DOM. |

Formats that cross the interface (VISION section 4):

| Format | Schematic Editor | Timing Diagram |
|---|---|---|
| `circuit` | load and save | load only (node names, frames) |
| `scenario` | save (inputs over steps, from frames) | load and save (its steps are a scenario) |
| `trace` | load (net values at each step, to show) | load (to draw) and save (manual edits) |
| `function` | save (truth table, LaTeX export) | |
| WaveDrom JSON | | load and save (its own source format, for interchange) |

Events:

| Event | From | Payload | Replaces |
|---|---|---|---|
| `change` | each | `{ format }` that changed | `onChange` |
| `status` | each | `{ text, error }` | `onStatus` |
| `frame` | Schematic, Timing | `{ index }` the frame or step now shown | `onFrameChange`, `setFrame` |
| `levels` | Schematic | a `trace` row: net to level at the current frame | schematic-to-timing sync |
| `levels` | Timing | a `scenario` column: signal to level at a step | timing-to-schematic sync |
| `nodes` | Schematic | node names and net labels | `setCircuit` |
| `selection` | Schematic, Timing | selected node names | `setSelectedNodes` |

The composite wires the events: Schematic `levels` goes to Timing `load("trace")`, and the reverse; `frame`
moves both. Neither tool knows the other exists, so a simulator page can host the Schematic Editor alone and
feed it `trace` from circuit-model.

### 2.3 What changes for the timing module

Its options shrink to the common ones. `betaFeatures` goes: every Copilot behaviour becomes the behaviour, or a
saved Look setting if it changes the drawing (centred transitions, Q3). `editorKey` (reading the editor's
autosave) goes: node names arrive through `nodes` or `load("circuit")`.

## 3. File moves

| From | To |
|---|---|
| beta `src/` drawing files (`doc`, `geometry`, `router`, `junctions`, `hit`, `view`, `marks`, `labels`, `block`, `presets`, `pack`, `categories`, `levelcolours`, `levelframes`, `history`, `svgimport`, `xml`, `export`, `demo`, `logic`, `sequential`, `latex-table`) | `tools/schematic-editor/src/` (beta versions, with stable's later fixes merged in; Q7) |
| `symbol-pack/`, `examples/`, `scripts/`, drawing tests | `tools/schematic-editor/` |
| `mathjax.js` | `tools/shared/mathjax.js` (both tools typeset) |
| `slide.js`, `frame.js`, `zip.js`, slide and ZIP tests | `tools/figure-editor/src/` |
| beta `app.js` | split: Schematic Editor's `index.js` (mount and its panes); Figure Editor's `index.js` (toolbar, stack, slide, links) |
| `tools/timing/src/nav.js` | `tools/shared/nav.js` (Tools menu entries come from `_quarto.yml`; the in-tool nav goes, per your 2026-11-15 request) |
| `tools/timing/` | stays; gains `index.js` with the common interface |
| `tools/figure-editor-beta/` | removed; `index.qmd` stays as a redirect |
| `tools/timing-diagram/index.qmd` | a real page again: mounts the Timing Diagram alone |
| new `tools/schematic-editor/index.qmd` | mounts the Schematic Editor alone |
| `_quarto.yml` Tools menu | Figure Editor, Schematic Editor, Timing Diagram |

The `_quarto.yml` resources pattern `tools/*/src/**` already covers `tools/shared/src/**` if the shared folder
uses a `src/` subfolder (so: `tools/shared/src/mathjax.js`).

## 4. Storage migration and redirects

First, R1.2 tags `editor-before-r1`.

| Old keys | New keys | Rule |
|---|---|---|
| `figure-editor/autosave`, `saves`, `options`, `private-theme` | `figure-editor/schematic/*` and `figure-editor/*` (options) | Copy once; old keys left in place; a flag `figure-editor/migrated-r1`. |
| `figure-editor-beta/autosave`, `saves`, `options`, `private-theme`, `timing-source`, `timing-send`, `truth-table` | same targets | If both editors have an autosave, the newer becomes the autosave and the other goes into the saved list (the F14 rule, already tested in `migrate.test.js`). |
| `timing-diagram/source`, `timing-diagram/send` | `figure-editor/timing/source`; standalone page keeps `timing-diagram/source` | The composite and the standalone page keep separate diagrams (Q2). |
| `figure-editor-beta/migrated-from-beta` and the like | unchanged | |

Nothing is deleted: every old key stays, so a rollback to `editor-before-r1` still finds its data.

Redirects (each keeps `?open=` and the hash):

| Old URL | Goes to |
|---|---|
| `tools/figure-editor-beta/` | `tools/figure-editor/` |
| `tools/figure-editor/?view=timing` | still works (the composite opens the Timing section) |
| `tools/timing-diagram/` | no longer a redirect: the standalone Timing Diagram |

## 5. Test plan

### 5.1 Keep every test

Stable has 185 tests and beta 198 (Copilot's count, not re-run). R1.2 merges both suites into the module that
owns each feature, de-duplicated, so the merged count is at least the larger suite plus stable-only tests
(`migrate`, `levelcolours`, `demo` truth table, F21.1 families). The browser scenarios (beta `scenarios.js` is
1,456 lines longer) split the same way.

### 5.2 New tests

- Interface: each tool mounts alone and embedded; `load(save(x)) == x` for each format it owns; every event
  fires with the documented payload.
- Boundaries: a test reads every `import` in `tools/*/src` and fails if a tool imports another tool's `src/`
  (only `tools/shared/src/` and another tool's `index.js` are allowed).
- Composite wiring: a level set in the schematic appears in the timing step and back; the frame stepper moves
  both; Frame 0 stays neutral.
- Migration: both key sets present, one present, none present; old keys untouched; runs once.
- Redirects: the beta URL lands on the Figure Editor with `?open=` kept.
- Pages: one browser check per page (Schematic Editor, Timing Diagram, Figure Editor), light and dark, zero
  black strokes on the dark canvas.

### 5.3 Retiring `logic.js` and `sequential.js` (R1.4, after C13 is tagged `model-v0.7.0`)

1. Pin the tag in `MODEL_PIN.json`; remove `pending_schema` once `circuit/0.3` ships in it.
2. Build a parity suite: for every case in `logic.test.js` and `sequential.test.js` (gates with X and Z and N
   inputs, SR latch from NAND pairs incl. the invalid case and held state, D latch, D/JK/T flip-flops, rising
   edges between steps, pulse lanes), turn the circuit and its inputs into a `circuit` plus `scenario`, run the
   simulator, and compare its `trace` with the built-in result step by step.
3. Run the parity suite against both until every case agrees. Record any disagreement as a question for Blake
   (the simulator is the reference per VISION section 4; a disagreement may be a bug on either side).
4. Switch the editor to the simulator behind the same `trace` input. Manual logic mode stays: manual values
   are applied on top of the simulator's trace.
5. Lift the calculation limits one at a time (period other than 1, phase, delay, clocks that are not direct
   pulses), each with a test; report any the simulator cannot do.
6. Only when every parity case passes against the simulator, delete `logic.js`, `sequential.js` and their tests,
   keeping the parity suite as the regression test.

How the simulator runs in the browser (a JavaScript build in circuit-model, or Python via Pyodide) decides
step 4's effort; see Q1.

## 6. Questions for Blake

1. **Simulator in the browser.** C13 is circuit-model's. Will it ship a JavaScript (or WebAssembly) build the
   site can pin and load, or should the site call a Python build (Pyodide, several MB)? R1.4 cannot start
   until this is known.
2. **One diagram or two.** Should the standalone Timing Diagram page and the Figure Editor's timing section
   share one saved diagram (as stable does today through `timing-diagram/source`) or keep separate ones?
3. **Centred transitions.** Beta-only today. Make it the only rendering, or a Look setting saved in the
   diagram (the plan assumes a setting, default centred)?
4. **Slide layouts.** Keep beta's ten. Are stable's two "timing across the bottom" layouts among them, or
   should they be added (making twelve)?
5. **LaTeX truth table.** Keep it in the Figure Editor, or move it to the logic tools (L1) as a `function`
   export, with the Figure Editor calling it?
6. **Symbol pack in the beta.** Stable is on symbols-v0.3.0 with the family popover. Is the beta on the same
   pack? If not, R1.2 moves the beta features onto v0.3.0.
7. **Unpushed work in this checkout.** The working tree holds my unpushed change that turns the stable
   editor's middle into three sliding sections (Figure Editor, Timing Diagram, Slide) with the side panes
   following the section (your 2026-11-15 request). It sits on Copilot's branch
   `feature/beta-timing-diagram-polish`, next to uncommitted edits to `DECISIONS.md` and
   `docs/STEWARD_HANDOFF.md` that are not mine. Fold the sliding sections into the R1 composite (the plan's
   assumption), push them first on their own branch, or drop them?
8. **Schema conflict.** Stable keeps frames, net labels and the slide in `groups`, which circuit-model's
   schema reserves for buses. Does `circuit/0.3` (C13) give editor data a place, so R1 can move them there?
9. **Names.** The beta page title says "Schematic Editor (beta)". After R1, "Schematic Editor" is the drawing
   pane's own page and "Figure Editor" the composite. Is that the naming you want in the Tools menu?
