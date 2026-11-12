---
title: "README (draft)"
module: site
doc-type: reference
updated: 2026-11-12
draft: true
---

<!--
DRAFT for Blake's approval (SCRIBE_TODO SCR-011). A README can't be hidden
as a draft, so it waits here. Once Blake approves it, Scribe moves it to the
repository root as README.md and removes this comment and the front matter.
-->

# blakeaaronroberts.github.io

The source of the suite's public home: a Quarto website, published with
GitHub Pages. It holds the site's pages, explorations and project pages, the
suite's public documentation (`docs/`), and the canonical copy of
[VISION.md](../../VISION.md), the charter every repository shares.

Quarto is a free, open-source publishing system: it turns Markdown pages
with maths, figures and code (`.qmd` files) into a website.

## Preview the site on your computer (Windows first)

1. Install **Quarto 1.11.9** from quarto.org (the same version the build
   uses, so your preview matches the published site).
2. In the repository's root folder, run, in PowerShell or bash:

   ```powershell
   quarto preview
   ```

   Quarto renders the site and opens it in your browser, reloading when you
   save a file. Stop the preview before running `quarto render`, or the
   render ends the preview.
3. To try the alternate site look (Okabe-Ito colours with STIX Two and Fira
   Mono), run `quarto preview --profile okabe-ito`.

## How it is published

Every push to `main` runs `.github/workflows/publish.yml`. A workflow is a
recipe that GitHub runs automatically: this one renders the site with Quarto
1.11.9 and publishes it to GitHub Pages. Pushes that change only the agents'
handoff and to-do files (`docs/SCRIBE_*.md`, `docs/STEWARD_HANDOFF.md`)
don't trigger it.

Before launch, the home page is a landing page with no navigation. Every
other page is published but reachable only by URL, and marked `noindex` so
search engines skip it (VISION.md section 6).

## Where things are

| Path | Contents |
|---|---|
| `index.qmd`, `home.qmd` | The landing page, and the full home page used at launch |
| `explorations/` | Interactive essays; `kmaps/` is the feature template |
| `projects/` | Project pages, with figures computed in the browser |
| `themes/`, `custom.scss` | The only places colours and fonts are set |
| `assets/js/figtools.js` | Shared plotting and numerics for the pages' code cells |
| `docs/` | Suite documentation, handoff and to-do files |
| `VISION.md`, `CLAUDE.md`, `DECISIONS.md` | The charter, the rules for agents in this repository, and its decision log |

## Licence

Not yet chosen (VISION.md section 3).
