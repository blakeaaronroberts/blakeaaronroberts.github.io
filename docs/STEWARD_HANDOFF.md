---
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

Sync of 2026-11-12, 21:20 (Pacific). Facts only; work lives in the batches below.

**Changed since the last sync**
- 21:40: the figure editor is this week's priority (VISION.md section 6,
  target 0); licence is a working assumption only (section 3). Batches queued.
- Since 21:00: Blake approved the circuit-schema proposal as a whole and
  the VISION.md updates for it (sections 4, 5, 6, 7 and 9); his global git
  email is now his GitHub noreply address.
- S3 done (`ffcb352`): alt text on all 12 figures, exposed in the
  accessibility tree. DigitalJS shows state by colour only, so a visible,
  live status line reports the input and output values (Blake's choice).
  Every site batch is now done.
- The Scribe keeps a review queue for Blake: every draft, with a link and an
  approval control.
- Rule changes this cycle: VISION.md section 3 now names the README
  exception (the Scribe approves READMEs).
- The private toolbox repo finished all its queued batches, including the
  circuit-schema proposal, which Blake has decided on. A new public repo for
  the shared circuit model is planned but not yet created.

**Waiting**
- Site builder: S4 (commit identity check), then F1 to F3, the figure editor (this week's priority).
- Scribe: Blake's reviews in the review queue.

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

**Order of work (Blake, 2026-11-13).** Today's goal is the most usable editor
for lecturing chapter 5: **F2.3** (polish and unlisted go-live), then **F3
labels and wire levels only**, then **F5** (configurable block, arrows, bus
marks, level-coloured elements), then **T1** (timing diagram tool). The rest
of F3 (PNG copy, scale options, private theme, draft switch, keys panel) and
F4 come after. Each deploy to `main` happens when Blake says "deploy".

| Batch | Intent | Status | Approved by Blake |
|---|---|---|---|
| S1 | Make this queue visible to every builder, stop handoff edits from redeploying the site, and clear out the stale `gh-pages` branch | Done | 2026-11-12 |
| S2 | Give the Scribe a `docs/` section on the site whose drafts stay hidden until Blake approves them | Done | 2026-11-12 |
| S3 | Accessibility pass: real alt text on every figure, and no logic state shown by colour alone | Done | 2026-11-12 |
| S4 | Make sure this repo's commits use Blake's GitHub noreply address, not a university or work email | Open | 2026-11-12 |
| F1 | Figure editor, plan: a short design for the first web tool, reviewed before any code | Open | 2026-11-12 |
| F2 | Figure editor v1 core: place, move, rotate and mirror elements on the grid; wires that stay anchored to pins; save, load and SVG export | Open | 2026-11-12 |
| F3 | Figure editor v1 finish: labels in STIX Two, wire level colours, PNG copy, private theme, shortcuts, draft toggle | Open | 2026-11-12 |
| F2.3 | Figure editor polish and unlisted go-live: site look, structured side panel, no scroll bars, half-module grid (adjustable), then publish at an unlisted URL | Open | 2026-11-13 |
| F4 | Figure editor options before launch: grid, whole-figure line weight (thin, regular, bold) and a dark theme, saved with the figure | Open | 2026-11-13 |
| F5 | Figure editor: configurable block (rect, chevron, triangle, circle) with presets, wire arrows, bus marks, level-coloured elements | Open | 2026-11-13 |
| T1 | Timing diagram tool: a WaveDrom page in the lecture look, adjustable size, SVG export | Open | 2026-11-13 |

---

### S1: wire up the handoff process; retire `gh-pages`

**Why now.** Until CLAUDE.md points here, no builder sees queued work on its
own. Handoff and to-do files are committed straight to `main`, so they must
not trigger a deploy.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| 1 | Point builders to this file; record the documentation process; skip deploys for handoff files | Scribe item H-S004, **amended** below | Done | `a67b467` |
| 2 | Check whether `gh-pages` is stale; delete it only if the evidence is clear | Scribe item H-S003 | Done | Deleted 2026-11-12: `build_type` `workflow`, no references; last SHA `c8af77cb9539e303db2586ba95ca857c5aeb0ae5` (restore: `git push origin c8af77cb9539e303db2586ba95ca857c5aeb0ae5:refs/heads/gh-pages`) |

**Step 1 amendment** (replaces H-S004's "What and where"):
- `CLAUDE.md`, opening paragraph: add "Before starting work, read
  `docs/STEWARD_HANDOFF.md`. Blake starts each batch there by name."
- `CLAUDE.md`, Workflow, after "Work on a branch. `main` deploys. Commit or
  push only when Blake asks.": add "Exceptions (Blake, 2026-11-12): the Scribe
  commits documentation to `main`; the Steward commits VISION.md and
  `docs/STEWARD_HANDOFF.md` to `main`; builders commit their Status updates to
  this handoff file."
- `.github/workflows/publish.yml`: add
  `paths-ignore: ['docs/SCRIBE_*.md', 'docs/STEWARD_HANDOFF.md']` to the push
  trigger on `main`. Only those files: rendered `docs/` pages must still
  deploy. Change nothing else in the workflow.
- `DECISIONS.md`, entry dated 2026-11-12, "Documentation and handoff
  process": the Scribe writes docs and commits them to `main`; work that needs
  a builder goes from the Scribe's `docs/SCRIBE_HANDOFF.md` to the Steward,
  who adds it to `docs/STEWARD_HANDOFF.md` once Blake approves; Blake starts
  each batch by name; commits that touch only those handoff and to-do files
  don't redeploy. Reason: Blake's instruction, to keep builder work in one
  place he has approved.

**Review stop A:** show Blake the step 1 diff and the step 2 result (kept or
deleted, with `build_type` and the branch's last SHA) together, then wait.

### S2: `docs/` section with drafts hidden

**Why now.** The Scribe's reference pages and tutorials need somewhere to
live on the site. Nothing appears publicly until Blake approves it.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| 1 | Add `docs/` to the render list with `draft-mode: gone` and `noindex` | Scribe item H-S001 | Done | `706d1bb`. **Steward:** `draft-mode: gone` still writes an empty HTML file at a draft's address, so Blake chose (2026-11-12) to keep drafts in `docs/_drafts/`, which Quarto never renders (tested). The Scribe's process and H-S001 should say so (DECISIONS.md). |

**Review stop:** as in H-S001.

### S3: accessibility pass

**Why now.** Required before launch (VISION.md section 7); cheaper while the
site is small.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| 1 | Alt text on every figure; check DigitalJS shows values, not colour alone | Scribe item H-S002 | Done | `ffcb352`. Alt text on all 12 figures, exposed in the accessibility tree. OJS cells ignore `fig-alt`, so plots use Observable Plot's `ariaLabel`. DigitalJS shows 1-bit state by colour only, so (Blake's choice) `_includes/digitaljs.html` adds a visible, aria-live status line of input and output values; DigitalJS unchanged. |

**Review stop:** as in H-S002.

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

### F1 to F3: the figure editor (this week's priority, VISION.md section 6, target 0)

**Why now.** Blake makes lecture-slide figures by hand in Inkscape. This tool
replaces that: he assembles figures from the toolbox's own elements, moves
them freely while wires stay attached, and exports SVG for his slides. It is
the suite's first web tool (VISION.md section 7, "Web-tool structure", which
Blake confirmed on 2026-11-12 by approving this batch).

**Blake's decisions for it (2026-11-12).**
- Lives at `tools/figure-editor/`, unlisted and `noindex` like every page
  but the landing page.
- Draws only with the **symbol pack** (SVG per element, plus pin JSON and
  theme tokens). It never carries a hand-made symbol or colour of its own.
  `circuit-model` is private for now, so GitHub Pages can't fetch it: keep a
  pinned copy under `tools/figure-editor/symbol-pack/`, written only by a
  copy script from a tagged `circuit-model` release, with a `VERSION` file.
  Never hand-edit it. Switch to a git submodule once `circuit-model` is public.
- Saves and loads figures as circuit-schema JSON (v0.2, which adds
  mirroring); autosaves in the browser.
- Wires: the user clicks corners, so wires bend at right angles (as in KiCad
  or Logisim). Wire ends anchor to pins and stretch when parts move. A wire
  can end on another wire, making a T-junction. Junction dots appear
  automatically only where four wires meet, never on a T-junction. No
  auto-routing yet.
- Grid: one module (0.5 cm). Exports at real size by default (so a gate is
  the same size on every slide), with a scale option. Transparent background.
- Rotation in 90-degree steps and mirroring.
- Labels (names, values, signal names) typeset by MathJax 4 with the STIX2
  font, the same pinned version the site loads, exported as outlined paths.
- Wire colour by logic level, chosen per wire (`low`, `high`, `unknown`,
  `floating` roles). No simulation this week.
- KiCad-style keys: R rotate, M mirror, W wire, Del, Ctrl+Z / Ctrl+Y,
  Ctrl+C / Ctrl+V, box select, zoom and pan.
- Palette shows approved elements only, with a "show drafts" switch.
- Export: SVG, plus "copy as PNG" for pasting into PowerPoint.
- A private theme can be loaded from a local file; it is kept only in the
  browser (never committed, never uploaded). Okabe-Ito is the default.
- Name: "Figure editor".
- Out of scope this week: simulation, auto-routing, FSM state diagrams.

**Tech limits.** Plain JavaScript modules and SVG, no build step, no
framework unless the plan shows a real need. Every dependency free and
open-source, its licence recorded in `DECISIONS.md` (VISION.md section 3).
Keyboard-usable; visible focus.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F1.1 | Plan mode: write `proposals/figure-editor.md` (two pages at most): data model (schema v0.2 in memory), how wires anchor and rubber-band, junction rules, undo design, the symbol-pack loading, label typesetting path, export path, file layout, and a test plan. List open questions for Blake | Steward, approved by Blake 2026-11-12 | Done | `6e55c94` on branch `figure-editor-plan` (not merged): proposal approved with Blake's answers in section 10; DECISIONS.md entry |
| F2.1 | Build the core as the approved plan says: canvas with zoom and pan; palette; place, move, rotate, mirror, delete; anchored orthogonal wires with T-junctions and automatic four-way dots; select, box select, copy and paste; undo and redo; save, load and autosave; SVG export | Steward, approved by Blake 2026-11-12 | Done | `d8d3513` on branch `figure-editor` (not merged). Pack copied from circuit-model tag `symbols-v0.1.0` (`0cf7f80`) with MANIFEST.json; mirror disabled for every element (no `mirrorable` flag in the pack yet); build choices in DECISIONS.md |
| F2.2 | Tests: geometry and wiring rules under `node --test` (no extra dependency), and one headless-browser screenshot of a sample figure | Steward, approved by Blake 2026-11-12 | Done | `1af8f4e` on branch `figure-editor`. Per proposal 10.7, 35 tests run under Quarto's Deno (`quarto run tools/figure-editor/test/run.js`), not `node --test`; all pass. Sample: full adder from gates (two four-way dots, two T-junctions); export checked at 4x, no external references |
| F3.1 | Labels via MathJax STIX2 (outlined in exports); wire level colours; copy as PNG; real-size and scale options; private theme from a local file; draft toggle; a "?" panel listing the keys | Steward, approved by Blake 2026-11-12 | Done | `cdfcc69` on branch `figure-editor` (not merged). Pack re-copied from `symbols-v0.2.0` (`ca16539`), 44 hashes checked. 84 Deno tests pass (two F2 tests adjusted). Labels needed no schema change. Found and fixed in MathJax 4: line breaking cut `A ⊕ B` to "A". Open for Blake: label size is not in the pack (10 pt default, a setting). circuit-model's newest example uses the `style` block, which the editor refuses until F4.4. Choices in DECISIONS.md |

**Mandatory.** Draw only from the symbol pack. Exported SVG opens cleanly
in Inkscape, PowerPoint and a browser, with no external fonts or references.
Zoom in on a joint, a corner and a junction at 4x before handing over, the
same publication-grade check the toolbox uses. Privacy scan before every push.

**Review stops.** After F1.1, Blake reviews the plan (the Steward checks it
against VISION.md first). After F2, show Blake the editor running with a
sample figure built from today's 21 elements, plus an exported SVG. After
F3, the same with labels and colours.

---

### F2.3: figure editor polish and unlisted go-live

**Why now.** Blake needs the editor usable today, from any computer (2026-11-13).
Keep the effort small: modern and consistent with the site, not elaborate.

**Blake's decisions (2026-11-13).**
- **Look.** Match the site, especially the home page: the site theme's roles
  (never hard-coded colours), IBM Plex, the same cards, spacing and headings.
  Calm and modern: icon toolbar, status bar, clear hover and focus states.
  The chrome follows the site's light and dark toggle; the drawing canvas
  always keeps the default theme on a light background.
- **Side panel.** Structured like the home page: labelled sections (selection,
  placement, label, wire level) with an empty state.
- **No scroll bars anywhere**, on the page or in any panel, at 1366 x 768 and
  up. What doesn't fit uses tabs, collapsible groups or paging. Nothing is
  clipped.
- **Grid.** Default snap is half a module, so gate legs that sit half a
  module out line up with on-grid parts. Adjustable on the fly (1 module or
  1/2 module; the grid dots follow). If the selector proves hard, ship the
  half-module grid alone and say so.
- **Go live, unlisted.** Publish at a URL with no navbar entry, `noindex`,
  and not announced anywhere. Blake approves this page for that purpose only.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F2.3.1 | Look and layout: full-viewport shell, site roles, icon toolbar, status bar, structured side panel, no scroll bars | Steward, approved by Blake 2026-11-13 | Open | |
| F2.3.2 | Grid: half-module default, adjustable. Stay on integer grid steps in the saved schema; if a position can't be stored that way, stop and ask | Steward, approved by Blake 2026-11-13 | Open | |
| F2.3.3 | Go live: privacy scan, merge `figure-editor` into `main`, wait for the deploy, open the live URL and check it loads, draws a figure and exports | Steward, approved by Blake 2026-11-13 | Open | |

**Scope limits.** No new dependencies, no refactors, no F3 or F4 features.
Read only what the work needs (`tools/figure-editor/`, the home page, the
theme roles). One render and one screenshot per size.

**Review stop.** Report the live URL and screenshots at 1366 x 768 and
1920 x 1080, then wait. Later deploys of F3 and F4 happen only when Blake says.

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

### F5: configurable block, arrows, bus marks, level-coloured elements

**Why now.** Chapter 5 is mostly labelled boxes. One configurable block in the
editor covers adders, subtractors, comparators, shifters, rotators,
multipliers, ALUs, register files and the basic control-system blocks without
waiting for new toolbox symbols (Blake, 2026-11-13).

**Prerequisites.** F3 labels are done and `circuit-model` has batch C5.

**Blake's decisions (2026-11-13).**
- **Block.** The editor draws the `block` primitive from its `params`, as C5
  defines them, in the active style and with the toolbox's joint and line
  rules, and with labels from the F3 label engine. Shapes: rect, chevron (the
  notched shape for adders, subtractors and ALUs), triangle (gain) and circle
  (summing junction with sign labels). Width and height are adjustable on the
  fly in whole modules, by handles or the side panel, and so are the pins on
  each side and their labels.
- **Presets** are only pre-filled params: half adder, full adder, carry-propagate
  adder and N-bit CLA (each in block and chevron form), subtractor (both
  forms), comparator, shifter, rotator, multiplier, ALU, register file,
  shift register, gain, summing junction, integrator, generic block.
- **Arrows.** Per-wire arrow at either end or both, with a sharp mitred head
  whose tip lands exactly on the line or pin it points to. A wire may start or
  end unattached, so a free-standing arrow works.
- **Bus mark.** A per-wire slash with a label, placed on the middle of the
  longest segment.
- **Element level.** Any element can be coloured by logic level: body colour
  from the level, leads keep their wire's colour. Shown as text on screen too.
- Saved as C5 defines. Nothing here changes the symbol pack.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F5.1 | Block: draw, pin and size editing, presets, palette group | Steward, approved by Blake 2026-11-13 | Open | |
| F5.2 | Arrows and bus marks | Steward, approved by Blake 2026-11-13 | Open | |
| F5.3 | Element level colouring | Steward, approved by Blake 2026-11-13 | Open | |
| F5.4 | Tests (pin rule, save and load, validation against C5) and a sample figure: 4-bit ripple-carry adder in block form, and a chevron CLA. The 4x zoom check on a chevron notch, an arrowhead tip and a bus slash | Steward, approved by Blake 2026-11-13 | Open | |

**Scope limits.** No new dependencies, nothing in `manimations` or
`circuit-model`. The toolbox does not draw the block yet; the Steward queues
a shared implementation later.

**Review stop.** Show Blake the sample figures and exported SVGs, then wait.

---

### T1: timing diagram tool

**Why now.** Blake wants quick timing diagrams that look like his own
(2026-11-13). WaveDrom and its lecture skin (`assets/wavedrom/`) are already on
the site.

**Blake's decisions (2026-11-13).**
- A page `tools/timing-diagram/`, unlisted and `noindex`: WaveDrom source on
  the left, live preview on the right, in the lecture skin. Check the look
  against one existing timing figure in `figures/` and tune the skin to match.
- Adjustable in both dimensions (width and height), and a "tidy" button that
  reformats the source.
- Exports SVG at real size. Text should be outlined; if that takes more than a
  small step, export live text, say so, and leave outlining for later.
- Out of scope today: linking to the figure editor so wires take levels from
  the diagram. That is a later batch built on scenario files.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| T1.1 | The page: source, live preview, size controls, tidy button | Steward, approved by Blake 2026-11-13 | Open | |
| T1.2 | Skin tuned to match an existing timing figure | Steward, approved by Blake 2026-11-13 | Open | |
| T1.3 | SVG export, a sample diagram, privacy scan | Steward, approved by Blake 2026-11-13 | Open | |

**Scope limits.** No new dependencies without asking (WaveDrom is already
used). Nothing in `manimations` or `circuit-model`.

**Review stop.** Show Blake a sample diagram and its exported SVG, then wait.

---

## Notes for the Scribe

(Builders: add a dated line here when a doc no longer matches the code.)

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
