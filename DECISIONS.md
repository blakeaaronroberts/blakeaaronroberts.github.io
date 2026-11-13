# Decisions

Notable choices for this repository (VISION.md §7): date, decision, reason. Newest first.

## 2026-11-12: Figure editor plan approved (F1)

**Decision.** `proposals/figure-editor.md` is approved with Blake's answers in its
section 10:

- **Symbol pack:** copied from the toolbox exporter's output (21 elements, 44 files).
  - The SVGs are in modules (0.5 cm) with y pointing down; the JSON is in grid steps
    with y pointing up.
  - The editor converts between them in one place.
- **Pinned copy, no submodule.** A copy script copies `symbols/` from `../circuit-model`
  and writes a manifest of the source commit or tag. Nobody edits the copy by hand.
- **Schema v0.2:** v0.1 plus an optional `mirror`, allowed only where the pack says
  `"mirrorable": true`.
- **Grid:** integer grid steps only. Parts snap to whole modules; wire corners may use
  half modules.
- **Partial figures** save, with warnings only.
- **Colour:**
  - Wire colours come only from the pack's `theme.json` roles; level choices missing
    there are greyed out.
  - An optional 0/1/X/Z tag can be shown next to each wire, off by default.
  - A selected wire's level is always shown as text on screen.
- **Tests:** a DOM-free ES-module core, tested with Quarto's bundled Deno. No Node.

**Reason.** Blake's answers to the plan's open questions. They keep the editor drawing
only from the toolbox's own exports and its integer-grid schema, never let state rely
on colour alone (VISION.md §7), and add no new dependency.

## 2026-11-12: Docs drafts live in `docs/_drafts/`

**Decision.** Draft docs pages live in `docs/_drafts/`, which Quarto never renders, and move
into `docs/` when Blake approves them. `draft-mode: gone` stays as a backstop for any page
marked `draft: true`.

**Reason.** Blake's choice. With `draft-mode: gone`, Quarto still writes an empty HTML
file at a draft's address, so its file name can be confirmed. An underscore folder keeps
drafts out of `_site/` completely, with no extra build code.

## 2026-11-12: Documentation and handoff process

**Decision.**

- The Scribe writes docs and commits them to `main`.
- Work that needs a builder goes from the Scribe's `docs/SCRIBE_HANDOFF.md` to the
  Steward, who adds it to `docs/STEWARD_HANDOFF.md` once Blake approves.
- Blake starts each batch by name.
- Commits that touch only those handoff and to-do files don't redeploy.

**Reason.** Blake's instruction, to keep builder work in one place he has approved.

## 2026-11-12: Render and validation cadence

**Decision.** Agents render and check their work at a fixed cadence, set out in `CLAUDE.md`
under Workflow → "Render and validation cadence":

- Make all the edits first. Never render between individual file edits.
- Small edits (config, one file, a dependency): render once, screenshot only the affected page, report.
- Larger changes (new pages, theme or structural work): render once the work is complete,
  fix what's broken, take one final screenshot of each changed page.
- Don't screenshot the same page twice unless the first one showed a problem that was then fixed.
- Full comparison checks (light and dark, equation numbering, references) only when a change
  touches the theme, fonts, maths or the build config, or when Blake asks.
- The privacy scan before any push stays mandatory every time.

**Reason.** Blake's instruction. The full light/dark comparison was asked for only for the
MathJax 4 font switch, and should not become the default check for every update.
