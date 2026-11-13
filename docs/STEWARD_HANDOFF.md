---
title: "Steward handoff: site"
repo: blakeaaronroberts.github.io
doc-type: handoff
updated: 2026-11-12
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

| Batch | Intent | Status | Approved by Blake |
|---|---|---|---|
| S1 | Make this queue visible to every builder, stop handoff edits from redeploying the site, and clear out the stale `gh-pages` branch | Done | 2026-11-12 |
| S2 | Give the Scribe a `docs/` section on the site whose drafts stay hidden until Blake approves them | Done | 2026-11-12 |
| S3 | Accessibility pass: real alt text on every figure, and no logic state shown by colour alone | Done | 2026-11-12 |
| S4 | Make sure this repo's commits use Blake's GitHub noreply address, not a university or work email | Open | 2026-11-12 |
| F1 | Figure editor, plan: a short design for the first web tool, reviewed before any code | Open | 2026-11-12 |
| F2 | Figure editor v1 core: place, move, rotate and mirror elements on the grid; wires that stay anchored to pins; save, load and SVG export | Open | 2026-11-12 |
| F3 | Figure editor v1 finish: labels in STIX Two, wire level colours, PNG copy, private theme, shortcuts, draft toggle | Open | 2026-11-12 |

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
| 1 | Run `git config --local user.email` in this repo. If it prints anything, run `git config --local --unset user.email`, then confirm `git config user.email` prints the noreply address | Steward, approved by Blake 2026-11-12 | Open | |

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
| F1.1 | Plan mode: write `proposals/figure-editor.md` (two pages at most): data model (schema v0.2 in memory), how wires anchor and rubber-band, junction rules, undo design, the symbol-pack loading, label typesetting path, export path, file layout, and a test plan. List open questions for Blake | Steward, approved by Blake 2026-11-12 | Open | |
| F2.1 | Build the core as the approved plan says: canvas with zoom and pan; palette; place, move, rotate, mirror, delete; anchored orthogonal wires with T-junctions and automatic four-way dots; select, box select, copy and paste; undo and redo; save, load and autosave; SVG export | Steward, approved by Blake 2026-11-12 | Open | |
| F2.2 | Tests: geometry and wiring rules under `node --test` (no extra dependency), and one headless-browser screenshot of a sample figure | Steward, approved by Blake 2026-11-12 | Open | |
| F3.1 | Labels via MathJax STIX2 (outlined in exports); wire level colours; copy as PNG; real-size and scale options; private theme from a local file; draft toggle; a "?" panel listing the keys | Steward, approved by Blake 2026-11-12 | Open | |

**Mandatory.** Draw only from the symbol pack. Exported SVG opens cleanly
in Inkscape, PowerPoint and a browser, with no external fonts or references.
Zoom in on a joint, a corner and a junction at 4x before handing over, the
same publication-grade check the toolbox uses. Privacy scan before every push.

**Review stops.** After F1.1, Blake reviews the plan (the Steward checks it
against VISION.md first). After F2, show Blake the editor running with a
sample figure built from today's 21 elements, plus an exported SVG. After
F3, the same with labels and colours.

---

## Notes for the Scribe

(Builders: add a dated line here when a doc no longer matches the code.)
