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

**Order of work (Blake, 2026-11-13, next week).** Each repository is a module
with its own builder, joined only by versioned formats (`circuit`, `scenario`,
`trace`, the symbol pack), each pinned by tag. Site order: **F5** (today), then
**F12** and **F10** (no simulator needed), then **F9** and **F11** on the
circuit-model C7 tag, then **F13** on the C8 tag, then **F14** when Blake says
"promote". F8 and T1 wait. Work goes on the beta page until F14. Deploys follow
Blake's prompt.

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
| F2.4 | Beta editor page, canvas that follows the site's light/dark setting, all-white-stroke dark mode | Done | 2026-11-13 |
| F6 | Figure editor: drag a wire segment, click and delete a wire | Done | 2026-11-13 |
| F7 | Figure editor: autosave and Save/Open of circuits | Done | 2026-11-13 |
| F5 | Figure editor: configurable block (rect, chevron, triangle, circle) with presets, wire arrows, bus marks, level-coloured elements | Open | 2026-11-13 |
| T1 | Timing diagram tool: a WaveDrom page in the lecture look, adjustable size, SVG export | Done | 2026-11-13 |
| F8 | Figure editor: box select, copy and paste, align and distribute, label editing, shortcuts | Open | 2026-11-13 |
| F12 | Figure editor: SVG import (own exports as circuits, other SVGs as a backdrop) | Open | 2026-11-13 |
| F10 | Figure editor: slide frame for arranging the schematic and timing diagram | Open | 2026-11-13 |
| F9 | Figure editor: play a scenario, timing diagram linked to the wires | Open | 2026-11-13 |
| F11 | Figure editor: animated SVG, animated PNG and per-transition exports | Open | 2026-11-13 |
| F13 | Figure editor: KiCad import | Open | 2026-11-13 |
| F14 | Promote the beta editor to stable | In progress | 2026-11-13 |
| F15 | Editor: level colour fixes (titles, blocks in the Elements pane, global) | Done | 2026-11-13 |
| F16 | Editor: Elements pane grouped into collapsible categories | Done | 2026-11-13 |
| F17 | Editor: configurable level colours | Blocked | 2026-11-13 |
| T2 | Timing tool: transition timing, arrows between transitions, per-transition exports | Open | 2026-11-13 |

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
| F3.1 | Labels via MathJax STIX2 (outlined in exports); wire level colours; copy as PNG; real-size and scale options; private theme from a local file; draft toggle; a "?" panel listing the keys | Steward, approved by Blake 2026-11-12 | Done | `cdfcc69` on branch `figure-editor` (not merged). Pack re-copied from `symbols-v0.2.0` (`ca16539`), 44 hashes checked. 84 Deno tests pass (two F2 tests adjusted). Labels needed no schema change. Found and fixed in MathJax 4: line breaking cut `A ⊕ B` to "A". Open for Blake: label size is not in the pack (10 pt default, a setting). circuit-model's newest example uses the `style` block, which the editor refuses until F4.4. Choices in DECISIONS.md F2.3 (unsaved-work warning and per-browser autosave hint, `310372e`) done; 84 tests pass (one sample-file test now ignores CRLF). MathJax URL pinned to @mathjax/mathjax-stix2-font@4.1.3, same as _quarto.yml. figure-editor merged into main 2026-11-13 on Blake saying "deploy"; page has robots noindex and no nav link. |

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
| F2.3.1 | Look and layout: full-viewport shell, site roles, icon toolbar, status bar, structured side panel, no scroll bars | Steward, approved by Blake 2026-11-13 | Done | On branch `editor-look` (uncommitted, for Blake's review; not on main). Fixed full-window shell below the site header; icon toolbar; palette left and properties right, both collapsible sections; status bar; no page or pane scrollbar at 1366x768 and 1920x1080 (measured: document size equals window, panes do not overflow). Chrome colours and fonts come only from `--role-*` (new, published in custom.scss) and `--bs-*`; follows prefers-color-scheme; canvas and exports stay on the light figure theme. Added at Blake's request: every element can carry a label. Pack elements with `"label": null` (the gates) use an editor-side fallback, centred on the top edge of the element's box with the label above; the lint message for that case is gone. Test for labels updated, 84 pass. 3 screenshots in the session scratchpad. Added at Blake's request, same branch (uncommitted): dark canvas (Canvas Auto/Light/Dark in Theme; "Export in dark theme" in Export, off by default); dark roles in `--fig-dark-*` from themes/okabe-ito/figures.scss and custom.scss; the pack is not edited (baked black to ink, white to background through `withTheme`); interim until theme-dark.json, recorded in DECISIONS.md. 85 tests pass. Palette tiles follow the canvas theme (dark symbols on the dark plate). Deployed 2026-11-13 on Blake's "deploy", with no review screenshot of the final palette (checked by script: tile colours and no JS errors). Fix 2026-11-13: Auto canvas now follows the site's own light/dark mode (its toggle can differ from the OS setting), and palette symbols that bake fills as rgb(0%,0%,0%) are mapped in dark too. |
| F2.3.2 | Grid: half-module default, adjustable. Stay on integer grid steps in the saved schema; if a position can't be stored that way, stop and ask | Steward, approved by Blake 2026-11-13 | Done | On branch `editor-look` (uncommitted). A Grid control in the toolbar (1/2 module default, 1 module) sets the snap step for parts, the dot spacing and arrow-key steps; saved in the browser options. Wires, ports and labels always snap to one step (half a module), so anchoring is unchanged. The saved schema stays on integer grid steps (grid_cm 0.25); no schema change. Deployed with F2.3.1. |
| F2.3.3 | Go live: privacy scan, merge `figure-editor` into `main`, wait for the deploy, open the live URL and check it loads, draws a figure and exports | Steward, approved by Blake 2026-11-13 | Done | Deployed 2026-11-13 on Blake saying "deploy" (merge `9334f56`, push `94c2c97`), before F2.3.1 and F2.3.2, which stay Open. Privacy scan of the outgoing diff and the rendered editor files found nothing. Live URL https://blakeaaronroberts.github.io/tools/figure-editor/ : page, src, symbol pack and sample all return 200; robots noindex; no nav link. Drawing and export were checked in a headless screenshot of the local render, not on the live URL. Update 2026-11-13: on Blake's instruction the editor is now linked from a "Tools" menu in the navbar (it stays noindex). |

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

### F2.4: beta page and dark canvas

**Why now.** Blake wants to keep using the stable editor while the next
version is built, and wants the whole editor dark in dark mode (2026-11-13).

**Blake's decisions (2026-11-13).**
- **Beta page.** `tools/figure-editor-beta/` is a full copy of
  `tools/figure-editor/` with its own app code and styles. It may share the
  symbol pack and the theme read-only. Unlisted, `noindex`, no link from
  anywhere, with a small "BETA, may break" banner linking to the stable
  editor. Nothing under `tools/figure-editor/` changes; any change outside
  the beta folder (theme variables) is additive, and the stable page's files
  stay byte-identical. Record the duplication in `DECISIONS.md` as temporary.
- **Mode source.** The canvas and the editor follow the **site's** current
  light/dark setting, not the system directly. The site follows the system
  first, then the navbar button; the editor reads whatever the site sets
  (find how the site applies it) and updates live when the button is
  clicked. A Canvas option (Auto, the default, Light, Dark) in THEME
  overrides it.
- **Dark palette.** Every light-mode role gets a dark equivalent chosen by
  the builder: complements the site theme, accessible (4.5:1 ink, 3:1 level
  colours), colour-blind distinguishable. The canvas is a darker shade of the
  site's dark background, derived from its token. Values live in
  `themes/okabe-ito/figures.scss` as `--fig-dark-*` (additive). Report the
  values and ratios.
- **All strokes light.** In dark mode every stroke is the light ink: element
  bodies AND legs (leads), dots, and symbol outlines. Elements must not show
  black bodies with white legs. Map the pack's baked colours at render time
  (black strokes in attributes and in inline `style` to ink, white fills to
  background); do not edit the pack. A required check: after loading the
  full adder sample in dark, no black stroke remains in the canvas DOM
  (count them and report the number, which must be 0).
- Exports stay on the default light theme unless "Export in dark theme" is
  on (off by default).

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F2.4.1 | Beta page and banner; stable page untouched | Steward, approved by Blake 2026-11-13 | Done | Branch beta-f2-4. tools/figure-editor-beta/ is a full copy of the editor (own src, styles, symbol-pack copy, tests); unlisted, noindex through tools/_metadata.yml, no link from anywhere. Banner "BETA, may break" with a link to ../figure-editor/. Own browser-storage keys (figure-editor-beta/...), so autosave and saves never mix with the stable editor. tools/figure-editor/ is byte-identical to main (git diff empty). Duplication is temporary; Blake said to change only this file under docs, so the DECISIONS.md entry the batch asks for is NOT written: Scribe or Steward, please add "beta editor is a temporary full copy, remove when promoted". 
| F2.4.2 | Follow the site's mode, live; Canvas option | Steward, approved by Blake 2026-11-13 | Done | The beta reads the site mode from the site's own --role-background (the toggle swaps the stylesheets), so it follows the OS first and the navbar button after, live. Browser check "toggle": starts light, clicks the site toggle, canvas and palette turn dark with no reload, and back. Canvas option (Auto, Light, Dark) kept from the stable editor. Batch asked for no new code here: the logic was already in the copied app.js. 
| F2.4.3 | Dark palette, all-light strokes, zero-black check, export checkbox | Steward, approved by Blake 2026-11-13 | Done | Zero-black check, headless Chrome, sample full adder and all 21 elements, in dark: black strokes in the canvas DOM 0 (of 46 and 98 stroked shapes); pure-black pixels on the canvas 0, in the palette 0; in light the same detector finds 2129, so it works. The previous attempt showed black bodies with white legs; that does not reproduce here, and the check would catch it. Dark values (canvas #141312 from site background #1c1b19; ratio vs canvas): ink and low #EBEBEB 15.57; high #FE7000 6.66; unknown #CC79A7 6.06; floating, accent, debug #56B4E9 8.04; flow #009E73 5.42; highlight #E69F00 8.24; grid #434341 1.87 (decorative). Command: quarto run tools/figure-editor-beta/test/browser/check.js dark toggle colours. Export in dark theme checkbox kept, off by default. 85 Deno tests pass. 

**Scope limits.** No pack, toolbox or circuit-model changes.

**Review stop.** Deploy the beta when checks pass, report, and continue.

---

### F6: wires

**Why now.** Blake wants wires he can move and remove (2026-11-13).

**Blake's decisions (2026-11-13).**
- **Drag a segment.** Grab a wire run and slide it sideways; the neighbouring
  segments stretch to follow, and the ends stay anchored to their pins or
  junctions. Segments stay orthogonal, snap to the grid, and one drag is one
  undo step.
- **Select and delete.** Clicking a wire selects it (visible highlight); the
  Delete or Backspace key removes it; undo restores it. Junction dots follow
  the four-wire rule after any edit.
- Next week, not today: bend handles, reconnecting a wire end, wires with
  free ends.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F6.1 | Wire hit-testing and selection | Steward, approved by Blake 2026-11-13 | Done | Branch beta-f6, beta page only. The hit-test already picked wires (0.7 grid steps); new: a hover highlight and a resize cursor (left-right on a vertical run, up-down on a horizontal one), and the selection band and panel naming the wire. Browser check: hover, click, band count 1, panel names w3. 
| F6.2 | Segment drag with anchored ends and snapping | Steward, approved by Blake 2026-11-13 | Done | New moveWireSegment() in src/doc.js. The run slides sideways in whole grid steps (half a module); neighbouring runs stretch; ends stay on their pins, ports and junctions; an end on an anchor keeps a one-step stub so the wire leaves it the same way; a free end moves with the run. A run too short for its stubs is refused with a message. Junctions on the moving part go with it and wires on them follow. Corners are saved in via, so the file format is unchanged. One drag is one undo step (live preview from the pre-drag document, one history record on release). A multi-selection drag still moves everything as before. 
| F6.3 | Delete, undo and redo, junction rule, tests | Steward, approved by Blake 2026-11-13 | Done | Delete and Backspace remove the selected wire, Ctrl+Z restores it exactly (browser check on the full-adder sample: 16 to 15 to 16 wires, 4 junctions kept, restored wire identical). Dots are derived from the drawing, so the four-wire rule holds after any edit (unit test: a T has no dot, a fourth wire makes one, it moves with the run, deleting the fourth removes it). 9 new Deno tests, 94 pass. Browser check: quarto run tools/figure-editor-beta/test/browser/check.js wires. 

---

### F7: save and load

**Why now.** Blake wants circuits he can reload later (2026-11-13).

**Blake's decisions (2026-11-13).**
- **Autosave** the current figure in the browser, restored on reload.
- **Save and Open** a `.json` file in the circuit schema (`circuit/0.2`)
  that Blake can keep anywhere. Open validates the file and reports a
  readable error for a bad one, without losing the current figure.
- SVG import is next week.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F7.1 | Autosave and restore (guarded storage calls, works without storage) | Steward, approved by Blake 2026-11-13 | Done | Branch beta-f7, beta page only. Autosave and restore already existed; added: a flush when the page is hidden or closed (an edit made under 0.8 s before a reload is kept); storage calls stay guarded, and if the browser blocks or fills storage the status line says once that autosave is off (bold, announced as an alert) and the editor carries on; an unreadable autosave is reported, not silently dropped. Browser checks: reload 1300 ms and 50 ms after an edit both restore it; with localStorage throwing, the editor still starts, edits and saves, with no editor errors. 
| F7.2 | Save and Open file, validation, tests | Steward, approved by Blake 2026-11-13 | Done | Save downloads <figure id>.json in circuit/0.2 (canonical text, byte-identical to what the editor holds); Open reads it back. Open now does a dry run (parse, then draw and lint) before touching the canvas, refuses files over 5 MB, and any refusal is a bold alert naming the problem and saying the figure on the canvas is unchanged. Checked with 7 bad files (not JSON, empty, a list, old schema, wrong grid, off-grid point, duplicate id): each refused with its reason, canvas unchanged. Round trip in the browser: drag a wire, Save, New, Open gives the identical figure. The downloaded bytes were caught at the link, because headless Chrome will not say where it saves. A file with an element type the pack lacks still opens, with a warning in the Warnings panel and that element not drawn (as before; say if it should be refused instead). 97 Deno tests pass. Command: quarto run tools/figure-editor-beta/test/browser/check.js saves. 

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

### F5: configurable block, arrows, bus marks, level-coloured elements

**Why now.** Chapter 5 is mostly labelled boxes. One configurable block in the
editor covers adders, subtractors, comparators, shifters, rotators,
multipliers, ALUs, register files and the basic control-system blocks without
waiting for new toolbox symbols (Blake, 2026-11-13).

**Prerequisites.** F3 labels are done, `circuit-model` has batch C5 (done), and F6 wires are in place. The work is done on the BETA page `tools/figure-editor-beta/` (see F2.4).

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
| F5.1 | Block: draw, pin and size editing, presets, palette group | Steward, approved by Blake 2026-11-13 | Done | Branch beta-f5, beta page only. New src/block.js (DOM-free): the C5 pin rule (pins one module apart, centred, a side at least pins + 1 modules, w and h raised to that), outline per shape (rect, chevron with a one-module notch on the left, triangle, circle), and a lead per pin found by casting a ray into the outline, so a chevron, triangle or circle pin is as simple as a rect pin. The block's `at` is its centre and its half-width is w grid steps (w modules across). C5 does not say where `at` sits; the centre is my reading of C5's own demo figure, so please confirm it with the circuit-model Steward before the toolbox draws the block. `pack.defFor(el)` gives a block its pin definition from its params, so routing, hit-testing, joints, lint and export bounds work on it unchanged. A block is one closed path (one round join at a corner or the notch, no butted lines) plus leads that run on past a slanted outline by a fraction of a line width. Text (middle label, pin labels inside the outline) goes through the F3 label engine, upright whatever the rotation. Panel: shape, width, height, text, and a comma list per side ("A, B: $B_1$"). Eight resize handles; a drag changes size in whole modules about the opposite edge, one undo step. A removed pin leaves its wire a free end; a renamed one (same count on that side) keeps its wire. 21 presets in a "Blocks" palette group (half adder, full adder, CPA, N-bit CLA, each in block and chevron form; subtractor in both; comparator; shifter; rotator; multiplier; ALU; register file; shift register; gain; summing junction; integrator; generic). Saved exactly as C5 defines (params in canonical order; a pin with no label is its bare name); Open refuses a bad shape, size or pin and names the element. arrow, bus and element level are already read, kept and saved (drawn in F5.2 and F5.3). 19 new Deno tests (116 pass); browser check: quarto run tools/figure-editor-beta/test/browser/check.js blocks (all 21 presets in light and dark: zero black strokes or pixels in the dark scene, palette and labels; place, resize, panel edit, bad pin refused, save and open, reload from autosave). |
| F5.2 | Arrows and bus marks | Steward, approved by Blake 2026-11-13 | Done | Branch beta-f5-2, beta page only. New src/marks.js (DOM-free). Arrowhead: a filled sharp triangle with no stroke, so its tip is exactly the pin, port, wire or free point it points at (tests); sized from the theme's line width (9 line widths long, 6 wide); the wire's line is shortened to end inside the head, where the head is wider than the line, so nothing pokes past the tip and no seam shows; a short run shrinks the head, two heads share one run; no joint is drawn under a head. Per wire: none, start, end or both, from the side panel; a wire may start or end unattached, so a free-standing arrow works. Bus mark: a slash across the middle of the wire's longest run, with its label (TeX or words) past the slash's upper end. Both are saved as C5 defines (none and empty are left out), drawn in the canvas and in SVG and PNG export, take the wire's level colour, and are light in dark mode. Checked at about 15x zoom on the exported file: the notch is one round join, an arrowhead meets a pin lead at its tip with no gap, the slash crosses the wire cleanly. A level tag and a bus label share the middle of a wire; if both are on they can overlap (not fixed). |
| F5.3 | Element level colouring | Steward, approved by Blake 2026-11-13 | Done | Branch beta-f5-2. Any element, block or pack symbol takes a level (0, 1, X, Z) from the side panel or the 0, 1, X, Z keys, alone or with wires selected. The body (outline, glyphs, a block's middle text) takes the level's colour role; leads keep their wire's colour or the ink; pin labels and the element's own label stay ink. Colours come only from roles (a theme without the role gets a lint warning and the default colour). The level shows as text on request: the Level tags option now tags elements too (just right of the top-right corner). Saved as element level between label and params. Browser check (quarto run tools/figure-editor-beta/test/browser/check.js levels): light and dark outline colour, SVG export holds only ink and the level role, PNG export has the level colour, tag text appears, level survives reload; zero black in dark. |
| F5.4 | Tests (pin rule, save and load, validation against C5) and a sample figure: 4-bit ripple-carry adder in block form, and a chevron CLA. The 4x zoom check on a chevron notch, an arrowhead tip and a bus slash | Steward, approved by Blake 2026-11-13 | Done | Branch beta-f5-2. 138 Deno tests pass (new: block, marks, element-level). Samples in examples/: ripple-carry-blocks (4-bit ripple-carry adder in block form, carry running right to left, arrowheads) and cla-chevron (N-bit CLA in chevron form, three buses marked N, arrowheads), each as .js, .json and .svg, built by scripts/build-sample.js through the editor's own edit calls. test/fixtures/mathjax.json now holds 62 real MathJax strings (the old 16 are byte-identical); scripts/tex-needed.js lists what the capture page needs. The 4x zoom check was done at about 15x on the exported SVG: chevron notch, arrowhead tip and bus slash show no gap. One thing seen and fixed: the first CLA layout put two bus labels one module apart, so the operands now run across first. Browser checks: blocks, marks, levels. Review stop: Blake to look at the two samples. |

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
| T1.1 | The page: source, live preview, size controls, tidy button | Steward, approved by Blake 2026-11-13 | Done | Page tools/timing-diagram/ (unlisted, noindex): WaveDrom source, live preview in the lecture skin, width and height, Tidy. Source is read as data, never evaluated. |
| T1.2 | Skin tuned to match an existing timing figure | Steward, approved by Blake 2026-11-13 | Done | Skin is the site lecture skin (assets/wavedrom/lecture.js), loaded as on the existing timing figure; not retuned. |
| T1.3 | SVG export, a sample diagram, privacy scan | Steward, approved by Blake 2026-11-13 | Done | SVG export works (live text, not outlined). Page reads labelled nodes (ports, net names) from the beta editor autosave (guarded) or Open .json, offers starter lines, flags unknown names. Beta editor has a Timing diagram link; the page has Back to editor. Review stop: Blake to look at the page. |

**Scope limits.** No new dependencies without asking (WaveDrom is already
used). Nothing in `manimations` or `circuit-model`.

**Review stop.** Show Blake a sample diagram and its exported SVG, then wait.

---

### F12: SVG import

**Blake's decisions (2026-11-13).**
- Every SVG the editor exports embeds its `circuit` JSON (in `<metadata>`), so
  importing one of our own SVGs restores the editable circuit exactly.
- Any other SVG imports as a locked backdrop image behind the canvas, with an
  opacity control, for tracing over by hand. Sanitise it: strip scripts, event
  handlers and external references before displaying.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F12.1 | Embed the circuit in exported SVGs; import restores it (round-trip test) | Steward, approved by Blake 2026-11-13 | Done | Branch beta-f12, beta page only. Every SVG export now carries the figure's exact circuit/0.2 text, XML-escaped, in a <metadata> element (still no text elements, fonts, links, ids or scripts). Open accepts .json and .svg: an SVG with a circuit inside restores it byte for byte (round-trip tests on all three samples; browser check: export, New, Open the file, identical). New src/svgimport.js (DOM-free). |
| F12.2 | Backdrop import with sanitising and opacity | Steward, approved by Blake 2026-11-13 | Done | Branch beta-f12. Any other SVG becomes a locked backdrop behind the grid. It is rewritten from an allow-list (scripts, event handlers, style elements, images, foreignObject, filters, animation, DOCTYPE and entities, every non-local href and url(), prefixed editor attributes: all removed; unrelated wrappers such as <a> are unwrapped) and then shown through an <image>, where a browser runs nothing and loads nothing. Natural size is read in modules from width and height or the viewBox; opacity, scale and position are in a Backdrop panel; Remove backdrop. It takes no pointer events, is never saved, autosaved or exported, and is lost on reload (say if it should persist). 5 MB limit. Embedded raster images inside the SVG are dropped. Browser check: check.js import (a hostile SVG shows no script run, a bad file is refused with its reason, the figure unchanged). |

---

### F10: slide frame

**Blake's decisions (2026-11-13).** A slide-size rectangle (16:9 default, 4:3
option) on the canvas where the schematic and the timing diagram are arranged
together. Export the frame as one figure, or the schematic or the diagram on its
own, at real size.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F10.1 | Slide frame, placement of the schematic and timing diagram, export of the frame or of either part | Steward, approved by Blake 2026-11-13 | In progress | Branch beta-f10, beta page only. New src/frame.js (DOM-free) and a Slide frame panel. A dashed slide-size rectangle on the canvas, in the drawing's own coordinates: 16:9 (33.87 x 19.05 cm, PowerPoint's size, default) or 4:3 (25.4 x 19.05 cm); layout is schematic only, or with a timing-diagram region below (60/40) or beside (55/45), tinted. Position by centre in grid steps, or Centre on the figure. Frame as SVG and Frame as PNG (300 dpi) write exactly what lies inside the rectangle at real size, 1:1 times the Scale option, no margin, drawn identically to the plain export (tested); a figure larger than the schematic's part is cut at the edge and the panel says which sides. The existing Export SVG writes the schematic alone. NOT DONE, waits for F9 or T1: the timing diagram itself (there is none to place yet, so only its region is reserved) and its separate export. The frame is a browser option (kept across reloads), not in the circuit file, because circuit/0.2 has no place for it; say if it should be saved with the figure. Browser check: check.js frame (light and dark, canvas, exports, 4:3, reload; zero black in dark). 9 new Deno tests (155 pass). |

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
| F11.2 | Per-transition SVG and PNG sequence | Steward, approved by Blake 2026-11-13 | Open | |
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
| F14.1 | Promote, remove the duplicate, redirect, tests | Steward, approved by Blake 2026-11-13 | Open | |

---

### F15: level colour fixes

**Blake's decisions (2026-11-13).** Level colour applies to an element's or
block's body only. Block titles and labels keep the ink role, as element names
do. Blocks and their presets appear in the Elements pane like every other
element, and the level controls and colours apply globally (every element,
block and wire, light and dark, export and save).

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F15.1 | Titles and labels excluded from level colour, for blocks and elements | Steward, approved by Blake 2026-11-13 | Done | Block middle text now ink (export.js, shared by canvas); pack elements already kept ink labels. Beta only. |
| F15.2 | Blocks and presets listed in the Elements pane; level control works on any selection | Steward, approved by Blake 2026-11-13 | Done | Checked first: the Elements pane already lists blocks and all presets under a Blocks heading; level control already works on any selection (elements, blocks, wires, light and dark, export, save). No change needed. |
| F15.3 | Tests and a screenshot | Steward, approved by Blake 2026-11-13 | Done | 155 tests (block-text test now expects ink); browser checks levels and blocks pass; screenshot checked. |

---

### F16: Elements pane categories

**Blake's decisions (2026-11-13).** Group the Elements pane into collapsible
sections (for example Logic gates, Sequential, Arithmetic, Passive and
semiconductor, Blocks, Sources and ground), each with a count; remember which
are open. Categories come from one data file so new elements need no code.

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| F16.1 | Category data file, collapsible sections, search still works | Steward, approved by Blake 2026-11-13 | Done | New src/categories.js (the one data file; unlisted types go under Other); collapsible sections with counts; open state kept in the options. Beta only. The pane has no search box today, so there was none to keep working. 157 tests; browser checks blocks, marks, levels, import, dark, saves pass (test helper now opens a section before clicking in it). |

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
| F17.1 | Role override UI, saved in the figure, contrast warning, reset, export uses it | Steward, approved by Blake 2026-11-13 | Blocked | Not started. The figure has no `style` block today (F4.4, which would add it to the circuit schema, is still Open, and the schema is the circuit-model repo's). Needs Blake or the Steward to decide: add `style` to circuit/0.2 first (circuit-model), or keep the override outside the file. T2 not started (budget). |

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
| T2.1 | Phase and step width controls | Steward, approved by Blake 2026-11-13 | Open | |
| T2.2 | Edge and arrow UI with labels | Steward, approved by Blake 2026-11-13 | Open | |
| T2.3 | Per-transition export of the diagram, then with schematic frames | Steward, approved by Blake 2026-11-13 | Open | |

---

## Reviews (Blake, 2026-11-13)

Four reviewer agents are report-only. Each runs on demand when Blake names it,
reads this repository (and the live site where relevant), and writes only its
own file `reviews/<agent>.md` here: date, then its top 10 findings ranked, each
with file and line, why it matters, and a suggested fix. They never change code,
docs, config or this file. The Steward triages findings into batches; Blake
approves them.

| Agent | Looks for |
|---|---|
| security | Exposed private data (emails, phone numbers, CV files, student data), secrets and tokens, private-repo content leaking into public output, unsafe dependencies, web vulnerabilities (XSS in label and import paths, unsafe file parsing) |
| engineer | Accuracy: logic, timing, symbols, pin placement and simulation results against the textbook behaviour; then features that are close to done |
| aesthetic | Design consistency across the suite against the style files and the site theme; improvements using lightweight open-source tools only |
| code-review | Correctness, duplication, dead code, test gaps and refactors, proposed as batches, never done directly |

---

## Notes for the Scribe

(Builders: add a dated line here when a doc no longer matches the code.)

- 2026-11-13 (F5, F12, beta editor): `tools/figure-editor-beta/README.md` does not describe the block element and its 21 presets, wire arrows and bus marks, element level, SVG import (the circuit inside exported SVGs; backdrop), or the commands `quarto run tools/figure-editor-beta/scripts/tex-needed.js` and `.../test/browser/check.js [dark] [wires] [saves] [blocks] [marks] [levels] [import]`. Exported SVGs now hold a `<metadata>` element with the circuit text. The KEYS list in `src/app.js` has the new keys.

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
