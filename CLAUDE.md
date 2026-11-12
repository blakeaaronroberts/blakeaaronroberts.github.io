# CLAUDE.md

Read [`VISION.md`](VISION.md) first. It is the shared charter for every repository
in this project, and this repository holds the canonical copy. **Do not edit
`VISION.md`.** If anything below disagrees with it, stop and tell Blake.

This file adds only rules specific to this repository: the Quarto site that is the
suite's public home.

## What this repo is

- Quarto website deployed to GitHub Pages by `.github/workflows` on every push to `main`.
- **Pre-launch access** (Blake's decision on 2026-11-12, departing from VISION.md §6's landing-only rule):
  - `_quarto.yml` builds and deploys the whole site.
  - `index.qmd` is the landing page. It shows no navigation, only the dark-mode toggle.
  - Every other page is published but reachable only by URL. Its navbar links the whole site.
  - Every page except `index.qmd` loads `_includes/noindex.html` (robots `noindex`). The include sits in each top-level page's front matter and in `explorations/_metadata.yml` and `projects/_metadata.yml`. A new top-level page needs it too.
  - At launch: replace `index.qmd` with `home.qmd` and remove the noindex includes.
- **Themes** (VISION.md §7; site-page look by Blake's decision on 2026-11-12):
  - `themes/` is the only place colours and fonts are set.
  - **Figures always use the universal theme.** `themes/okabe-ito/figures.scss` sets every `$fig-*` role: Okabe-Ito colours, STIX Two Text, Fira Mono. It applies to plots, diagrams, figure plates and embed plates. Site themes must not set `$fig-*`.
  - **Site pages** use `themes/blueprint/` (warm paper, IBM Plex), selected in `_quarto.yml`. Both fonts files are loaded.
  - Alternate site look: `themes/okabe-ito/light.scss` and `dark.scss`. Preview it with `quarto preview --profile okabe-ito`.
  - Maths is MathJax 4 with its STIX2 font, pinned in `_quarto.yml`.
  - Everything else asks for a **role**, never a colour:
    - `custom.scss` uses `$role-*` and `$fig-*`, and publishes the figure roles as `--fig-*` CSS properties.
    - `figtools.js` `palette.accent` / `.high` / `.shade` and the others read those properties.
    - Graphviz `{dot}` cells carry no colours or fonts. CSS styles them, with `class="label"` for muted labels and `class="junction"` for dots.
  - Quarto reads `$body-bg` on its own, so each theme sets it as a literal and derives `$role-background` from it.
  - Thumbnails are screenshots of figure plates. Regenerate them when the theme changes.
- **No licence notice** anywhere until Blake chooses one (VISION.md §3).
- Third-party embeds stay for now, by Blake's decision on 2026-11-12: WaveDrom (with its lecture skin in `assets/wavedrom/`) and DigitalJS.
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
- Focus areas, as Blake chose them (2026-11-12): "Integrated Circuit Design / System-Level
  Design / Engineering Education". Never list "instrumentation".

## Privacy

- Files matching `*_CV_*.pdf` contain a phone number and references' contact details.
  They are git-ignored. Never commit, publish or quote them.
- Never publish phone numbers, references' contacts, GPAs, or anyone's email
  besides what Blake has put on the site himself.
- Before any push, scan the staged files and the rendered output for these.

## Workflow

- Work on a branch. `main` deploys. Commit or push only when Blake asks.
- Look at your own render before handing work over, using headless Chrome screenshots of the
  preview, at the cadence below.
- **Running `quarto render` while a preview is running terminates the preview.**
  With `--no-watch-inputs`, a live preview can also re-render a page from stale
  state. Stop the preview, render, then restart it.
- Stop any preview before switching branches. A running preview can rewrite
  `.gitignore` and block the checkout.
- Shell: the default is Windows PowerShell 5.1. Redirected logs are UTF-16, and
  `2>&1` on native commands produces NativeCommandError noise.

### Render and validation cadence

Set by Blake on 2026-11-12 (see `DECISIONS.md`).

- Make all the edits first. Never render between individual file edits.
- **Small edits** (config, one file, a dependency): render once, screenshot only
  the affected page, and report.
- **Larger changes** (new pages, theme or structural work): render once the work
  is complete, fix what's broken, then take one final screenshot of each changed page.
- Don't screenshot the same page twice unless the first one showed a problem you then fixed.
- Do full comparison checks (light and dark, equation numbering, references) only
  when a change touches the theme, fonts, maths or the build config, or when Blake asks.
- The privacy scan before any push (see Privacy) stays mandatory every time.
