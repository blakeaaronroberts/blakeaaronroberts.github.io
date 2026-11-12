---
title: "Scribe handoff to Rising Edge: site"
module: site
doc-type: handoff
updated: 2026-11-12
---

# Scribe handoff to Rising Edge: site

This file is how Scribe (the documentation agent) passes work to Rising Edge
and the builder agents. Blake does not copy prompts by hand: **Rising Edge
reads this file, sends each Open item to the right builder, and changes its
Status.** Builders working in this repo should also read it before starting
other work, so they take the pending items into account.

Rules for this file:
- Newest first. Rows are never deleted; Status changes instead
  (Open, In progress, Done, Waiting).
- Each item has a ready-to-run prompt below the table.
- Scribe's own task list is [SCRIBE_TODO.md](SCRIBE_TODO.md).

## Standing process (Blake, 2026-11-12)

1. **Scribe commits documentation-only changes itself**, directly to `main`.
   Blake does not commit for Scribe. Anything that is not documentation goes
   through this file instead.
2. **Docs live in their module's own repo.** They are copied into this
   repo's `docs/` only once the module is public. After the first copy,
   **every** update is copied here too, in the same session.
3. Builder prompts reach builders only through these handoff files.
4. **Whenever Scribe needs Blake to relay something to Rising Edge, Scribe
   writes the message as a ready-to-paste prompt**: thorough, clear and
   strategic (context, what to do in what order and why, decision rules,
   limits, how to report back). Blake never has to compose it himself.
5. **Specs for a new module or schema are built by Rising Edge working
   directly with Blake.** Scribe does not draft them. When Blake approves a
   spec, Rising Edge adds a row to this file addressed to Scribe, and Scribe
   documents it (reference and explanation pages).

## Items

| ID | Date | For | Item | TODO | Status |
|----|------|------|------|------|--------|
| H-S004 | 2026-11-12 | Builder (CLAUDE.md, DECISIONS.md) | Point builders to this file; record Blake's documentation process | SCR-018 | Open |
| H-S003 | 2026-11-12 | Builder | Check whether the `gh-pages` branch is stale; delete it if so | SCR-014 | Open |
| H-S002 | 2026-11-12 | Builder | Alt text, and signal state not carried by colour alone | SCR-012 | Open |
| H-S001 | 2026-11-12 | Builder | `docs/` section with drafts hidden | SCR-007 | Open |

---

### H-S004: point builders to this file; record the process

- **Goal:** Make sure every agent working in this repo sees Scribe's
  handoffs, and that `CLAUDE.md` matches Blake's documentation process.
- **What and where:**
  - `CLAUDE.md`, opening paragraph: add "Before starting work, read
    `docs/SCRIBE_HANDOFF.md` and take its Open items into account."
  - `CLAUDE.md`, Workflow section: after "Work on a branch. `main` deploys.
    Commit or push only when Blake asks.", add "Exception (Blake,
    2026-11-12): Scribe commits documentation-only changes directly to
    `main`."
  - `DECISIONS.md`: add an entry dated 2026-11-12, "Documentation process":
    Scribe commits documentation-only changes directly to `main`; builder
    prompts reach builders through `docs/SCRIBE_HANDOFF.md` via Rising Edge;
    docs live in each module's repo and are copied into `docs/` here only
    once the module is public, then on every update. Reason: Blake's
    instruction, so he does not commit for Scribe or copy prompts by hand.
- **Scope limits:** do not edit VISION.md; change nothing else in CLAUDE.md.
- **Mandatory:** the privacy scan before push (CLAUDE.md, Privacy).
- **Review stop:** show Blake the diff before committing.

### H-S003: stale `gh-pages` branch

- **Goal:** Find out whether the `gh-pages` branch is still used, and delete
  it only if it is stale.
- **What to check:**
  1. The GitHub Pages source setting:
     `gh api repos/blakeaaronroberts/blakeaaronroberts.github.io/pages`.
     A `build_type` of `workflow` means Pages deploys from
     `.github/workflows/publish.yml` and not from the branch.
  2. That no workflow, script or doc in the repo refers to `gh-pages`.
  3. The date of the branch's last commit, compared with the last successful
     run of the publish workflow.
- **Decision rule (Blake, 2026-11-12):** if Pages builds from the workflow and
  nothing refers to the branch, it is stale. Delete it with
  `git push origin --delete gh-pages` **without asking Blake**. If anything
  shows it is still in use, or the Pages API can't be read, keep it and
  report why.
- **Scope limits:** no other branch; no change to Pages settings, `main` or
  `projects-showcase`.
- **Mandatory:** before deleting, record the `build_type` value and the
  branch's last commit SHA in this file (Status column or a note under this
  item), so the branch can be restored from that SHA.
- **Report:** one line to Blake: kept or deleted, with the evidence.

### H-S002: alt text, and state not shown by colour alone

- **Goal:** Every figure on the site has real alt text, and no interactive
  figure shows logic state by colour alone (VISION.md §7).
- **What and where:**
  1. `explorations/kmaps/index.qmd`: replace the placeholder
     `fig-alt="Describe the figure."` with a factual description of
     `kmap.svg`; add alt text to the WaveDrom (`#fig-timing`) and DigitalJS
     (`#fig-circuit`) figures, for example with an `aria-label` on the wrapper
     or a visually hidden description.
  2. `projects/*/index.qmd`: find the OJS cells that draw figures (there are
     17 OJS cells across the four pages; not all draw a figure) and give each
     figure a `fig-alt` describing what the plot shows, factually, from the
     data. Do not change Blake's prose.
  3. DigitalJS: check whether buttons and lamps show their value (0/1) and
     not only a colour. If not, report the options to Blake; don't patch
     DigitalJS itself.
- **Scope limits:** alt text and accessibility attributes only; no change to
  theme files, figures' data or page prose.
- **Mandatory:** the render cadence and privacy scan in CLAUDE.md; check with
  a screen-reader view or the accessibility tree that the text is exposed.
- **Review stop:** show Blake the diff and one screenshot per changed page
  before committing.

### H-S001: `docs/` section with drafts hidden

- **Goal:** Let docs pages live in `docs/` and stay invisible until Blake
  approves them. (Toolchain approved by Blake, 2026-11-12: Quarto with
  quartodoc for API reference.)
- **What and where:** in `_quarto.yml`, add `"docs/**/*.qmd"` to
  `project.render` and set `website.draft-mode: gone`. Add
  `docs/_metadata.yml` with the `noindex` include, as in
  `explorations/_metadata.yml`. Scribe's handoff files in `docs/` are `.md`,
  so they stay outside the render list. Exclude `docs/templates/` from
  rendering (for example `"!docs/templates/"` in `project.render`; confirm
  Quarto skips it): the templates are full of placeholders and are not pages.
- **Scope limits:** no theme, maths or navbar changes; no new top-level page;
  do not edit VISION.md.
- **Mandatory:** the render cadence in CLAUDE.md; confirm that a test page
  with `draft: true` is absent from `_site/` and from the search index, then
  remove the test page; the privacy scan before push.
- **Review stop:** show Blake the diff and the render check before
  committing.
