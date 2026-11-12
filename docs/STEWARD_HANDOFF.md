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

Sync of 2026-11-12, 16:05 (Pacific). Facts only; work lives in the batches below.

**Changed since the last sync**
- S2 done (`706d1bb`): `docs/` is a site section. `draft-mode: gone` still
  writes an empty page at a draft's address, so drafts live in
  `docs/_drafts/`, which Quarto never renders (Blake, 2026-11-12).
- The Scribe published the root `README.md` under Blake's standing
  delegation for READMEs (2026-11-12), and wrote five product overviews as
  drafts in `docs/_drafts/`, waiting for Blake's review.
- Earlier today: tools are free and open-source or our own (VISION.md
  section 3); builder work goes only through this queue; the `sync`
  protocol (section 8). The university IP check is no longer planned.

**Waiting**
- Site builder: S3 (accessibility), when Blake starts it.
- Scribe: Blake's review of its style guide, templates and overviews.
- The private toolbox repo: one batch done, three queued.

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
| S3 | Accessibility pass: real alt text on every figure, and no logic state shown by colour alone | Open | 2026-11-12 |

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
| 1 | Alt text on every figure; check DigitalJS shows values, not colour alone | Scribe item H-S002 | Open | |

**Review stop:** as in H-S002.

---

## Notes for the Scribe

(Builders: add a dated line here when a doc no longer matches the code.)
