# Decisions

Notable choices for this repository (VISION.md §7): date, decision, reason. Newest first.

## 2026-11-25: Yosys engine for behavioural SystemVerilog import (F22.1c)

**Decision.**
- `@yowasp/yosys` **0.71.1284** (npm integrity `sha512-sEqbe2F1XgBk/pkykD8YBAF1/3BvyT6DgeJjzZEubo+piXAkFq/ih9WmXuplrpXtTQ6iHkQg6BbBxBgZYFfHWg==`, the pin in circuit-model's DECISIONS C11.0b; Yosys 0.71, git b4c586fd3) is committed as gzipped copies in `tools/shared/src/sv/third_party/yowasp/` (`bundle.js` as published; `yosys.core*.wasm` and `yosys-resources.0.tar` as `.gz`, 18.5 MB in all), with a MANIFEST of the SHA-256 of every file and of the raw file inside each `.gz`. The raw 75 MB binary is not committed.
- `tools/shared/scripts/copy-yowasp.js` is the only writer: it refuses a tarball whose sha512 is not the pin. `manifests.test.js` checks the committed bytes and that gunzip gives the recorded raw hash.
- The files are served by this site only and loaded on demand, in the import Worker, through a fetch wrapper (`tools/shared/src/yowasp-fetch.js`) that answers the bundle's five fixed file requests from the `.gz`. The vendored package is not edited.
- Licences: ISC for YoWASP (Catherine), Yosys (Claire Xenia Wolf) and yosys-slang (Martin Povišer), plus the components listed in `tools/shared/src/sv/third_party/NOTICES.md` (circuit-model's file, shipped beside the files and linked from the Import panel). The resources tar is shipped byte-exact; it holds ten third-party authors' email addresses in file headers (Blake accepted this, 2026-11-25).
- **Open for the IP Inspector (circuit-model's file, not changed here):** `NOTICES.md` has no sections for `ezsat`, `subcircuit` or WASI libc, which circuit-model's DECISIONS (C11.0 d) names among the YoWASP licences; the Yosys techlib `.v` files in the tar were not read one by one; the IEEE `vpi_user.h` flag.

**Measured on Pages (2026-11-25, first deploy of the files).** Every `.gz` is served as `Content-Type: application/gzip` with no `Content-Encoding`, so the bytes on the wire are the file sizes: `yosys.core.wasm.gz` 17,044,483, `yosys-resources.0.tar.gz` 856,245, the three small `.wasm.gz` 11,419 together, `bundle.js` 56,383 (Pages gzips JavaScript): 17,968,530 bytes (17.97 MB) in all. `Cache-Control: max-age=600`, `Access-Control-Allow-Origin: *`; a ranged request returns the whole file. 0.86 to 1.11 s for the big file here (15 to 20 MB/s; this link only).

**Why.** Behavioural code needs synthesis (engine memo). Pre-gzipped files do not depend on how Pages compresses, and Pages sends a `.gz` untouched (measured for slang, 2026-11-25). Cost: about 18 MB in git history, and again for each Yosys version.

## 2026-11-24: Pinned copies checked in CI, same-site circuits, WaveDrom skin notice (F25.2 to F25.4)

**Decision.**
- `data-circuit` on a DigitalJS plate names a file of this site only (`sameSiteUrl` in `_includes/digitaljs.html`): another origin, another scheme, a login in the address or an empty value is refused, and the fetch sends no credentials and refuses redirects.
- `tools/schematic-editor/MODEL_PIN.json` is the one place the model tags are written (`tag`, `commit`, `logic_tag`, `logic_commit`). `copy-model.js` reads it and refuses a tag whose commit differs from the pin.
- `tools/schematic-editor/test/manifests.test.js` recomputes every pinned copy against its MANIFEST (symbol pack, the editors' simulator, validator and schemas, the logic tools' copy) and runs in CI with the other tests. `.gitattributes` marks those folders `-text`; the old rule named a folder that had moved, so a Windows checkout rewrote line endings and broke the hashes.
- `tools/figure-editor-beta/` stays as a redirect page and is kept out of search by `tools/_metadata.yml` (checked by the same test); it is not deleted.
- `assets/wavedrom/lecture.js` uses STIX Two Text (text) and Fira Mono (a `.mono` class, not yet used by any WaveDrom element), through `--fig-font` and `--fig-font-mono` with the same values as fallbacks, and carries WaveDrom 3.7.0's MIT licence text as a comment.

**Why.** F25 (Security, Engineer and IP Inspector reviews): a stale or edited copy must fail CI, a page cannot point a visitor's browser at a third party, and a restyled copy of an MIT file keeps its notice.

## 2026-11-20: Third-party licences and delivery safeguards (F25)

**Decision.** Every third-party piece the site ships or loads is listed here with its licence (VISION.md §3). Blake's own
licence is still undecided: there is no LICENSE file, header or badge. Licences below are as the packages declare them
(npm `license` field, the font families' published licence, the CSL file's own `rights` line); the IP Inspector may check
them again.

| Component | Version | Licence | Where it is used | Loaded from |
|---|---|---|---|---|
| MathJax 4 with the STIX2 font package | 4.1.3 | Apache-2.0 | page maths; labels in the editors | jsDelivr, pinned, SHA-384 integrity |
| WaveDrom (and its default skin) | 3.7.0 | MIT | WaveDrom pages; the timing tool credits its source format | cdnjs, pinned, SHA-384 integrity |
| DigitalJS | 0.14.2 | BSD-2-Clause | DigitalJS pages | unpkg, pinned, SHA-384 integrity |
| IBM Plex Sans and Mono | Google Fonts | SIL OFL 1.1 | site pages | Google Fonts stylesheet (cannot be hashed) |
| STIX Two Text, Fira Mono | Google Fonts | SIL OFL 1.1 | figures | Google Fonts stylesheet (cannot be hashed) |
| IEEE citation style (`_csl/ieee.csl`) | as copied | CC BY-SA 3.0 (the file's own `rights` line) | references | in the repository |
| Okabe-Ito palette | n/a | a published colour set, not code | figures | in the repository |
| Quarto and its bundled OJS runtime, Bootstrap | 1.11.9 | MIT and others, each bundled with its notice | build tool; `site_libs/` | built into the site |
| circuit-model (simulator, validator, symbol pack) | model-v0.9.0, symbols-v0.3.0 | Blake's own; licence undecided (VISION.md §3) | the editors | copied into `tools/`, pinned by tag and hash |
| `@yowasp/yosys` (Yosys with yosys-slang, WebAssembly) | 0.71.1284 | ISC, with the components in `third_party/NOTICES.md` | Import SystemVerilog, behavioural code (F22.1c) | this site, on demand, pre-gzipped, pinned by npm integrity and MANIFEST |
| `assets/wavedrom/lecture.js` | n/a | a restyled copy of WaveDrom's default skin (MIT) | WaveDrom pages | in the repository |

**Delivery safeguards.**

- `.github/workflows/publish.yml`: the tests and the privacy scan run first and the deploy needs them; the workflow
  starts with no permissions and each job asks only for what it uses; actions are pinned to commits (Dependabot proposes
  updates).
- `scripts/third-party.json` and `scripts/sri.js`: the CDN scripts above get `integrity` attributes after each render, and the
  build fails if an external script has none. MathJax's dynamic font files load after the pinned bundle and carry no hash.
- `scripts/privacy-scan.js`: fails on a tracked or rendered CV file, a phone number, a GPA, or an email address not listed in
  `scripts/privacy-allow.json` (Blake's own). Third-party files with authors' contact lines (`_csl/`, `site_libs/`) are skipped
  for email only.
- **Not done, and only Blake can do it:** branch protection on `main` (require the test job before merge). **Open items,
  not recorded as done:** co-author consent, and the advisor's OK, for what the site names.

**Why.** Reviewers found that tests did not gate the deploy, workflow permissions were broad, actions floated on tags, the
privacy scan was manual, CDN scripts had no integrity hashes, and no table of licences existed.

## 2026-11-13: Figure editor finish (F3): build choices

**Decision.** Choices made while building F3, where the pack or the plan left room:

- **Pack re-copied from tag `symbols-v0.2.0`** (commit `ca16539`); all 44 manifest hashes
  checked against the working copy and the tag's own files. Mirror now follows each element's
  `mirrorable` flag (15 on, 6 off). The `unknown` and `floating` levels use the theme's roles.
  The straight-joint size is `line.straight_joint_frac`; a pack without it is refused, so no
  drawing constant lives in the editor.
- **Label size is not in the pack, so it is a setting.** The toolbox's labels are LaTeX's 10 pt
  (the `standalone` class default). The editor uses `theme.label.size_pt` if a pack ever has it,
  else 10 pt, which the user can change (Export panel). Points convert to cm with the pack's own
  ratio (line width in pt and in cm). To fix properly, the toolbox could export the size.
- **Labels: MathJax 4.1.3, SVG output, `fontCache: "none"`**, from the site's pinned STIX2 package
  (`tex-mml-svg-mathjax-stix2.js`); no new dependency. Two MathJax 4 behaviours were found by
  looking at real glyphs, and are handled in `src/mathjax.js`:
  - Automatic line breaking cut `A ⊕ B` into two `<svg>` lines (only the "A" was drawn). Inline
    line breaking is off, and output in more than one piece is refused.
  - Dynamic glyph files are preloaded once. `tex2svgPromise` never settled in headless Chrome, so
    the synchronous call is used after that preload.
- **A label that would carry a colour or a font is refused.** MathJax draws an unknown TeX command
  in literal red and `\color` sets named colours; a glyph the font lacks falls back to `<text>`.
  Any such label is an error and the export stops, so the file never has a colour that is not
  from the theme or a font.
- **Labels need no schema change.** Ports (`label`, `side`) and free labels (`text`, `at`, `side`)
  already exist in circuit/0.2. A port has no symbol in the pack, so only its label is drawn;
  the editor marks ports on screen (never in an export). An element's own label is drawn only
  where the pack gives that element a label position.
- **Levels** are the schema's optional wire `level` (circuit-model `1b63797`): "0", "1", "X",
  "Z", set per wire (several selected wires at once, or keys 0 1 X Z). A wire's pin leads, line
  joints and junction dots take its colour. The level is always written as text in the panel.
  The export's optional 0/1/X/Z tag is an export setting (off by default), not part of the saved
  figure, because the schema has no field for it.
- **Private theme:** `roles` only, `#RRGGBB`, kept in `localStorage`. The pack's symbols carry
  their colours baked in, so the editor maps each baked colour to the role that owns it (`ink`
  first) and then to the private colour.
- **Copy as PNG** draws the exported SVG to a canvas at 300 dpi (capped at 16000 px a side); if
  the browser refuses clipboard access the PNG downloads instead.

**Reason.** Blake's F3.1 instructions and proposal section 10; each item records a choice a later
reader might otherwise take for an accident.

## 2026-11-12: Figure editor core (F2): build choices

**Decision.** Choices made while building F2, where the plan left room or its letter
didn't work:

- **Copy script is `.js`, not `.mjs`.** `quarto run` refuses `.mjs` ("no handler") but
  runs `.js` as an ES module under its Deno. Same for the test runner `test/run.js`,
  which starts that Deno's own `deno test`. No Node and no new dependency.
- **The pack is copied from tag `symbols-v0.1.0`** (commit `0cf7f80`), which existed
  before F2 started. So the untagged-copy step was never needed. The script reads files
  with `git show <ref>:symbols/...`, so the copy doesn't depend on what is checked out.
- **`.gitattributes`** marks `tools/figure-editor/symbol-pack/**` as `-text`. This repo
  checks out with `core.autocrlf=true`, which would otherwise rewrite the copied files
  and break the SHA-256 values in `MANIFEST.json`.
- **Router fixtures come from the toolbox.** `test/fixtures/router-fixtures.json` (64
  cases) was generated by the toolbox's own `route()` (manimations `dd94f70`). The plan
  wanted these fixtures in `circuit-model`, but F2 may not touch that repo, so they live
  here until they move. The Z midpoint rounds half to even, as Python's `round()` does.
- **Saved files sort ids by code point, with numbers compared numerically.** Not
  `localeCompare`, because collation can differ between browsers and a saved figure must
  be the same bytes everywhere.
- **The whole pack loads at start-up** (44 small files), not each element on first use,
  because the palette shows a preview of every element.
- **The straight-joint size is fixed at 0.6 of the line width,** copied from the
  toolbox's `Joint.SEAM_PATCH`. `theme.json` doesn't export this ratio. It is the only
  drawing constant in the editor's code.
- **Fewer source files than the plan's layout:** select, place, wire and pan live in
  `app.js`, and hit-testing in `hit.js`, instead of `tools/*.js` and `keys.js`.

**Reason.** Blake's F2 instructions and proposal section 10; each item records a choice
a later reader might otherwise take for an accident.

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

## 2026-11-13: Dark canvas for the figure editor (interim)

**Decision.** The figure editor has a canvas theme option (Auto, Light, Dark; Auto follows the system and is
the default) and an "Export in dark theme" checkbox (off by default). In dark, the editor draws with dark
values of every drawing role, found by role name in `--fig-dark-<role>` CSS properties. Hues are set in
`themes/okabe-ito/figures.scss` (`$fig-dark-*`); the background and grid are derived in `custom.scss` from the
site's dark background token (a shade darker, using Sass's own `darken` and `mix`), because `figures.scss`
loads before the site theme and cannot see that token. The editor maps the symbol pack's baked black to ink and
white to background at render time with the existing theme mechanism (`withTheme`); the pack is not edited.
Okabe-Ito hues are kept except that blue becomes sky blue (the light blue is only about 3.5:1 on dark) and
vermillion is lightened 8%. Exports stay on the light theme unless the checkbox is on.

**Interim.** These dark values are a stand-in until the toolbox's dark theme (`theme-dark.json`) lands in the
symbol pack. Then the editor reads the pack's dark roles and this `--fig-dark-*` set is deleted.

**Reason.** Blake's instruction (2026-11-13): in dark mode the whole editor should look dark, with colours
chosen to complement the site theme and stay accessible. Palette thumbnails keep the pack's colours as shipped.
