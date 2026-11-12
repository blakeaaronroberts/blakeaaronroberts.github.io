---
title: "Documentation audit: site"
module: site
doc-type: audit
updated: 2026-11-12
draft: true
---

# Documentation audit: blakeaaronroberts.github.io

Audit of commit `6ed7721`. Reviewed by Blake on 2026-11-12; his decisions
for this repo are at the end. Work for builder agents is in
[SCRIBE_HANDOFF.md](SCRIBE_HANDOFF.md); Scribe's tasks are in
[SCRIBE_TODO.md](SCRIBE_TODO.md).

## 1 Inventory

| Item | Files | Docs | Notes |
|---|---|---|---|
| Repo `README.md` | none | **none** | VISION.md §7 requires one (what it is, how to run it). |
| `CLAUDE.md` | present | n/a | Points to VISION.md. Confirmed. |
| `DECISIONS.md` | present | n/a | One entry (render cadence). |
| Build and deploy | `_quarto.yml`, `.github/workflows/publish.yml` | partial (comments) | Quarto 1.11.9 pinned; deploys with `actions/deploy-pages`. |
| Themes | `themes/`, `custom.scss`, `_quarto-okabe-ito.yml` | partial (CLAUDE.md) | Role-based, as VISION.md §7 requires. No how-to for adding a theme. |
| Maths | `_quarto.yml` `html-math-method` | partial | MathJax 4 + STIX2 pinned at 4.1.3, as VISION.md §7 requires. |
| `assets/js/figtools.js` | 14 exports (complex arithmetic, `polyMul`, `roots`, `freqz`, `stepResponse`, `ellipK`, `lowpassOrders`, `midiToHz`, `centsError`, `palette`, `plotStyle`, `linspace`) | **none** | Shared by the project pages' OJS cells. First candidate for JSDoc. |
| WaveDrom include | `_includes/wavedrom.html`, `assets/wavedrom/lecture.js` | stub (comment) | Third-party; stays as an interim (settled in VISION.md §9, 2026-11-12). |
| DigitalJS include | `_includes/digitaljs.html` | stub (comment) | Third-party; stays as an interim (VISION.md §9). |
| Explorations | `explorations/kmaps/` | stub | A feature template, not an exploration yet. `circuit.json` there is DigitalJS format, **not** the suite schema. |
| Project pages | `projects/*/index.qmd` (4) | n/a (Blake's prose) | Out of Scribe's scope for writing. |
| Suite docs pages | none | none | Will go in `docs/` as drafts, copied from each module's repo once that module is public. |

## 2 Accuracy and accessibility findings

1. **No README.md** (VISION.md §7).
2. **Alt text.** `explorations/kmaps/index.qmd` has 3 figures and 1 `fig-alt`,
   and that one is the placeholder "Describe the figure." The WaveDrom and
   DigitalJS figures have none. The project pages contain 17 OJS cells with no
   `fig-alt` or figure labels. I have not checked which of those cells draw
   figures; SCR-012, handoff H-S002.
3. **Colour as the only carrier.** The DigitalJS embed shows logic levels by
   colour; whether its lamps and buttons also show a value is unchecked
   (SCR-012, handoff H-S002).
4. **Stale branch.** A `gh-pages` branch exists although the workflow deploys
   with `actions/deploy-pages`. Not touched by Scribe; a builder checks it (SCR-014, handoff H-S003).
5. **Charter drift, reported, not fixed:**
   - `CLAUDE.md` records a pre-launch arrangement (all pages built, unlinked,
     `noindex`) that it describes as departing from VISION.md §6's
     landing-only rule. *Resolved 2026-11-12:* VISION.md §6 now describes the
     same arrangement.
   - `CLAUDE.md` says "Work on a branch. `main` deploys. Commit or push only
     when Blake asks." On 2026-11-12 Blake decided that Scribe commits
     documentation-only changes directly to `main`, in this repo too.
     `CLAUDE.md` doesn't say so yet (SCR-018, handoff H-S004).
   - `CLAUDE.md` says "Do not write Blake's prose." Blake decided on
     2026-11-12 that technical docs are allowed authored text; his posts,
     bio and project text stay off-limits.

## 3 Toolchain, versioning and templates

The suite-wide proposal, approved by Blake on 2026-11-12: Quarto with quartodoc for the API
reference, semantic versions per module, version in every page's front matter,
frozen per-version snapshots from the first public release. Docs pages would
use Quarto's `draft: true` with `draft-mode: gone`, so drafts are not
rendered, linked or searchable until approved.

Note: `docs/*.md` files are outside `_quarto.yml`'s `render` list
(`*.qmd`, `explorations/*/*.qmd`, `projects/*/*.qmd`), so this audit file
would not appear on the built site. The file is still readable on GitHub,
because the repo is public.

## 4. Blake's decisions for this repo (2026-11-12)

- Scribe commits documentation-only changes directly to `main`. Anything
  else is written up in [SCRIBE_HANDOFF.md](SCRIBE_HANDOFF.md), and the Steward
  folds approved items into [STEWARD_HANDOFF.md](STEWARD_HANDOFF.md).
- Technical docs are allowed authored text. Blake's own prose is not.
- Docs live in their module's own repo. A module's docs are copied into this
  repo's `docs/` only once the module is public, and after that on every
  update.
- Docs pages here are drafts (`draft: true`, hidden with `draft-mode: gone`)
  until Blake approves them.
- Toolchain: Quarto + quartodoc. Versioning: semantic versions per module,
  `<module>-vX.Y.Z` tags, the version in every page's front matter,
  per-version snapshots from the first public release.
- Naming the employer in Blake's own bio is fine; docs, examples and file
  names never do.
- The `gh-pages` branch: a builder checks whether it is still needed and
  may delete it if it is stale.
