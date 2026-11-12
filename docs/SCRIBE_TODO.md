---
title: "Scribe TODO: site"
module: site
doc-type: handoff
updated: 2026-11-12
---

# Scribe TODO: site

Steward copies these rows into Blake's action-items tracker. Newest first.
Rows are never deleted; Status changes instead. IDs are shared across the
suite's repos, so gaps are rows kept in another repo. Items that need a
builder are written up in [SCRIBE_HANDOFF.md](SCRIBE_HANDOFF.md) (H-S…); the
Steward folds approved ones into [STEWARD_HANDOFF.md](STEWARD_HANDOFF.md),
where builders record Status.

| ID | Date | Repo | Item | Needs | Status |
|----|------|------|------|-------|--------|
| SCR-036 | 2026-11-12 | site | Review the product overviews (`docs/_drafts/products/`) and the draft README (`docs/_drafts/README.md`). On approval Scribe moves each into `docs/` (README to the root) | Blake | Open |
| SCR-035 | 2026-11-12 | site | Product overviews: Toolbox, Studio, Explorations, Practice, Labs (drafts, from VISION.md) | Scribe | Done |
| SCR-018 | 2026-11-12 | site | CLAUDE.md says "commit or push only when Blake asks"; Blake now lets Scribe commit docs-only changes to `main`. Point builders to the handoff file; log in DECISIONS.md. H-S004 | Builder agent | Done (`a67b467`) |
| SCR-014 | 2026-11-12 | site | Check whether the `gh-pages` branch is stale; delete it if so (Blake pre-authorised). H-S003 | Builder agent | Done (branch deleted; restore SHA in STEWARD_HANDOFF.md, S1) |
| SCR-012 | 2026-11-12 | site | Alt text: kmaps placeholder, WaveDrom and DigitalJS figures, figure-drawing OJS cells on project pages; check DigitalJS shows values, not colour alone. H-S002 | Builder agent | Open |
| SCR-011 | 2026-11-12 | site | Write `README.md` (what the repo is, how to preview on Windows, how it deploys). Draft written at `docs/_drafts/README.md`; Scribe moves it to the root once Blake approves it | Blake | Waiting |
| SCR-007 | 2026-11-12 | site | `docs/` in the render list with `draft-mode: gone`. H-S001 | Builder agent | Done (`706d1bb`) |
