# CLAUDE.md

Read [`VISION.md`](VISION.md) first. It is the shared charter for every repository
in this project, and this repository holds the canonical copy. **Do not edit
`VISION.md`.** If anything below disagrees with it, stop and tell Blake.

This file adds only rules specific to this repository: the Quarto site that is the
suite's public home.

## What this repo is

- Quarto website deployed to GitHub Pages by `.github/workflows` on every push to `main`.
- **Two profiles.**
  - `_quarto.yml`: the public build. It renders only `index.qmd`, the pre-launch landing page, and its navigation links must not be live.
  - `_quarto-dev.yml`: the full site (home, explorations, projects, about), previewed with `quarto preview --profile dev`.
- Per VISION.md §6, the public build stays landing-only until the ripple-carry-adder
  flagship exploration and a project page explaining the suite both exist.
- Theme: `theme-light.scss`, `theme-dark.scss`, `custom.scss`; fonts load from `_includes/fonts.html`.
- Figures and tables use IEEE labelling: "Fig. 1", "TABLE I", numbered equations, and the IEEE CSL style in `_csl/`.
- Shared plotting and numerics live in `assets/js/figtools.js`, imported by OJS cells.

## Content rules

- **Do not write Blake's prose.** No posts, bios or project text in your own words.
  Use Blake's text verbatim from his source documents, or leave a placeholder.
  Captions are the only authored text, and they must be factual.
- **Figures from real data only.**
  - Every plot is computed from published numbers or equations, in code the reader can unfold ("Show the code").
  - Never draw something that merely looks like the original.
  - Report any discrepancy between a recomputation and the source to Blake. Do not silently fix it.
- Credit co-authors and teammates by name. Never publish their contact details.
- Focus areas, as Blake chose them: "Analog, Mixed-Signal & RF IC Design / System-Level
  Design / Engineering Education". Never list "instrumentation".

## Privacy

- Files matching `*_CV_*.pdf` contain a phone number and references' contact details.
  They are git-ignored. Never commit, publish or quote them.
- Never publish phone numbers, references' contacts, GPAs, or anyone's email
  besides what Blake has put on the site himself.
- Before any push, scan the staged files and the rendered output for these.

## Workflow

- Work on a branch. `main` deploys. Commit or push only when Blake asks.
- Look at your own render before handing work over. Use headless Chrome screenshots of the preview.
- **Running `quarto render` while a preview is running terminates the preview.**
  With `--no-watch-inputs`, a live preview can also re-render a page from stale
  state. Stop the preview, render, then restart it.
- Stop any preview before switching branches. A running preview can rewrite
  `.gitignore` and block the checkout.
- Shell: the default is Windows PowerShell 5.1. Redirected logs are UTF-16, and
  `2>&1` on native commands produces NativeCommandError noise.
