# Decisions

Notable choices for this repository (VISION.md §7): date, decision, reason. Newest first.

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
