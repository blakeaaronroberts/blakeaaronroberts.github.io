---
title: "Note for the Steward: first-run redesign (proposed batch U1)"
repo: blakeaaronroberts.github.io
doc-type: proposal
status: draft, not approved
date: 2026-11-25
---

# Note for the Steward: first-run redesign

Blake asked for this note on 2026-11-25. It carries a design handoff package
for the site builders. **Nothing here is approved.** Blake has seen the
designs and asked for the handoff, but he has not approved the batch, its
steps or the new on-screen text. Please triage it into
`docs/STEWARD_HANDOFF.md` only after he approves, in whatever shape you and he
choose.

## What is in this folder

| File | What it is |
|---|---|
| `STEWARD_NOTE.md` | This note: the proposed batch, its steps and the decisions Blake still has to make |
| `README.md` | The builder's spec: every screen, state, interaction and design value |
| `design/First Run v2.dc.html` | The clickable design reference (open it in a browser). It is a design reference, not code to copy |
| `design/support.js` | The runtime the reference file needs to open. Not part of the site |
| `design/images/`, `design/projects/`, `design/explorations/` | Copies of repo assets the reference file shows |

## Decisions Blake still has to make

1. **Approve the batch** (below), or change its order or scope.
2. **On-screen text that is not his yet.** The design adds UI words (button
   labels, headings, short descriptions). VISION.md section 3 says Blake signs
   off on anything the public sees. The full list is in `README.md`, section
   "Copy needing approval". Strings marked `[…]` are placeholders for his own
   text.
3. **Editor layout change (U1.6).** The design moves the settings panes to a
   right-hand column and docks Timing Diagram and Slide as tabs under the
   canvas. This changes the composite's shell (`tools/figure-editor/src/index.js`)
   and is the largest step. It is listed separately so Blake can take it,
   defer it or drop it.
4. **Release home at launch.** U1.3 changes `home.qmd`, which goes live when
   `index.qmd` is replaced at launch (VISION.md section 6, step 5). The launch
   itself stays Blake's separate decision.

## Proposed batch

| Batch | Intent | Status | Approved by Blake |
|---|---|---|---|
| U1 | First run: a quieter pre-launch page, a release home where Projects, Explorations and Tools sit side by side, and a Figure Editor that asks how to start and shows a short tour | Proposed | (not yet) |

### U1: first run

**Why now.** On a first visit with no autosave, the editor loads the full
adder and sets the status "A full adder to start: …", then the next line of
`mount()` in `tools/schematic-editor/src/app.js` (the
`if (!opened && !saved) status("Pick an element …")` after the example block)
overwrites it at once, so a new visitor never sees the hint. The site has no
route from a home page to the tools, explorations and projects in one place.

**Prerequisites.** None for U1.1 to U1.5. U1.6 after Blake decides (decision 3).

| Step | What | Source | Status | Note |
|---|---|---|---|---|
| U1.0 | Read `README.md` in this package and the reference file. Reply with a short plan per step (files touched, tests to add) and the list of on-screen strings, then stop | Design handoff 2026-11-25 | Proposed | |
| U1.1 | Editor start: on first open with no `?open=` and no autosave, show the start chooser (Full adder example / Empty figure / Open…, keys 1 2 3, Esc = empty) instead of loading the example unasked. Fix the overwritten status line. Autosave and `?open=` keep their current behaviour (no chooser) | README "Screen 4" | Proposed | Smallest step; fixes a real bug |
| U1.2 | Pre-launch page (`index.qmd`, `custom.scss`): more room above the title block, the "Site under construction" line with its status dot. Still no navigation and no internal links | README "Screen 1" | Proposed | |
| U1.3 | Release home (`home.qmd`, `custom.scss`): bio paragraph (verbatim, already in the file), a sticky three-part section bar, then three listings with one card style: Projects (`contents: projects`), Explorations (`contents: explorations`), Tools (a small YAML listing file) | README "Screen 2" | Proposed | Goes live only at launch |
| U1.4 | Editor tour and help: three-step tour with a spotlight (frames, Timing Diagram, Elements), tooltips with keys on toolbar buttons, the Keys dialog restyled from `KEYS`, a short confirmation toast, a Tour button in the status bar. Tour seen state kept in the browser (`figure-editor/tour-seen`) | README "Screen 5", "Screen 6" | Proposed | |
| U1.5 | Editor toolbar and status bar: figure name and autosave state at the left, Export as the one filled button, frame readout "Frame n/8", status bar items (grid step, zoom, frame) | README "Screen 4" | Proposed | |
| U1.6 | Editor layout: settings panes in a right-hand column; Timing Diagram and Slide as tabs docked under the canvas; Elements search field | README "Screen 4, layout" | Waiting (Blake, decision 3) | |
| U1.7 | Checks and render: Deno tests for the chooser and tour state; browser checks for first open, autosave restore, `?open=`, tour skip and replay, light and dark; one screenshot per changed page; privacy scan | CLAUDE.md render cadence | Proposed | |

**Model and effort (suggested).** U1.0 and U1.6: Claude Opus, high effort.
U1.1 to U1.5 and U1.7: Claude Sonnet, medium effort.

**Scope limits.**
- Site repository only. No change in `circuit-model` or `manimations`.
- Colours and fonts only through the existing roles (`themes/blueprint/`,
  `--role-*`, `--fig-*`). No new hex values in pages or tools; the design's
  values all map to existing roles (README, "Design tokens").
- No new dependency. Bootstrap Icons are already loaded by Quarto.
- Do not write Blake's prose. Use his text verbatim or leave a placeholder.
- The pre-launch page links to nothing on the site (CLAUDE.md, pre-launch access).
- Keep every existing editor command, key and storage key working.

**Mandatory.** Signal state never by colour alone (VISION.md section 7): the
pressed tool, the tour step and the autosave state each also change shape or
text. Visible focus on every control. Respect `prefers-reduced-motion` (no
spotlight or pulse animation). Privacy scan before any push.

**Review stops.** After U1.0 (plan and strings), after U1.1 (one screenshot of
the chooser, light and dark), after U1.3 (release home, light and dark), after
U1.4 (tour, three screenshots). Merging into `main` is Blake's decision.

## Notes for the Scribe (once built)

- The editor's first open changes: a start chooser, a tour, and a Tour button
  in the status bar. The Figure Editor and Schematic Editor READMEs will need a
  "First open" section.
