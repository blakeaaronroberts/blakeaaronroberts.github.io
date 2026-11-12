---
title: "Documentation style guide"
module: docs
module-version: 0.1.0
doc-type: reference
updated: 2026-11-12
draft: true
---

# Documentation style guide

This guide is for anyone writing documentation for the suite: Scribe, the
builder agents (for README stubs and HOW_TO guides), and Blake. VISION.md
outranks it; where they differ, VISION.md wins and this guide is corrected.

Every page is built from one of the four templates in
[`docs/templates/`](templates/). Start there, not from a blank file.

## 1. Readers

Write for all of these readers. When you have to choose, serve the higher one.

1. **Blake, as author**, including Blake learning to build modules himself.
2. **Other agents** working in the repos.
3. **Faculty** who might adopt the tools.
4. **Students.**
5. **Self-learners.**

Assume the reader knows electrical and computer engineering well: logic
levels, flip-flop timing, Kirchhoff's laws, a datasheet. Do not assume they
know web development, packaging or CI. Explain those terms the first time
they appear on a page (section 6).

## 2. Voice

- **Textbook-clear, second person.** "You place the gate with
  `Circuit.place`", not "The user places…" or "We place…".
- **Academic and understated.** State what something does and why. No hype
  ("powerful", "seamless", "blazing"), no exclamation marks, no emoji.
- **Encouraging, never belittling.** Never write "simply", "just",
  "obviously", "trivially", "easy" or "of course". If a step is short, the
  reader will notice.
- **Short sentences, one idea each.** Lead with the point; put conditions
  after it.
- **Accurate over polished.** Document what the code does. If you are unsure,
  write a TODO in `docs/SCRIBE_TODO.md` instead of guessing, and say on the
  page that the point is unconfirmed.

## 3. Language

Use current, descriptive terms everywhere (VISION.md section 7):

| Use | Not |
|---|---|
| leader / follower (latches, flip-flops, buses) | master / slave |
| controller / peripheral, primary / secondary | master / slave |
| allowlist / denylist | whitelist / blacklist |
| `main` | master (branch) |
| placeholder, stub | dummy |
| check, smoke test | sanity check |

Where a datasheet, standard or textbook uses an older term, use the current
term and mention the older one **once** where students need to recognise it:
"controller (older texts: master)".

## 4. Employer-agnostic, privacy, licence

- No institution names, brand names, brand-colour names, work emails or work
  paths in docs, file names, folder names or examples. Institution branding
  exists only as a private theme, and docs never name one.
- No student data, ever. Example names, grades, IDs and measurements are
  invented, and recognisably so ("Student A", "Lab bench 3").
- Docs for a private module stay in that module's repo until Blake clears
  the module for publication.
- No licence text, headers or badges until Blake chooses a licence.

## 5. Commands and setup

- **Windows first** for local setup: give the PowerShell command first, then
  bash under a separate heading or fence. Label each fence with its shell:
  ` ```powershell ` and ` ```bash `.
- If a command is identical in both shells (most `uv` and `git` commands),
  give it once in a ` ```powershell ` fence and say it works in bash too.
- **Browser first** for public tools: describe using the tool on the site
  before any local install.
- Never use a `$` or `>` prompt inside a fence, and never mix output into a
  command fence. Put expected output in its own fence, labelled ` ```text `.
- Paths in prose use forward slashes (`src/manimations/toolbox`); PowerShell
  accepts them.

## 6. First-use definitions

Define these terms the first time they appear on a page, in one clause. Keep
the wording below so definitions read the same everywhere.

| Term | First-use wording |
|---|---|
| repository (repo) | a project folder tracked by git, with its full history |
| commit | a saved snapshot of changes in a repository |
| branch | a separate line of commits, merged back when ready |
| uv | a Python package and project manager |
| virtual environment | a private copy of Python and packages for one project (`.venv`) |
| dependency | another package this project needs in order to run |
| CI (continuous integration) | checks a server runs automatically on every push |
| workflow (GitHub Actions) | a CI recipe, stored in `.github/workflows/` |
| front matter | the block of settings between `---` lines at the top of a page |
| JSON | a plain-text format for structured data, readable by Python and JavaScript |
| SVG | a vector image format that browsers draw at any size without blurring |
| JavaScript module | a `.js` file that other scripts load with `import` |
| static hosting | serving prebuilt files only, with no program running on the server |

Add a row here when a new term keeps recurring.

## 7. Maths

- Maths is STIX Two in every medium (VISION.md section 7). In docs pages,
  write TeX between `$...$` (inline) or `$$...$$` (display). Quarto renders it
  with the pinned MathJax 4 STIX2 bundle; never load another maths font or a
  floating MathJax version.
- Number display equations that you refer to: `$$ ... $$ {#eq-carry}`, and
  refer to them as `(@eq-carry)`, which renders IEEE-style as "(1)".
- Variables are italic (`$C_\mathrm{in}$`); subscripts that are words or
  names are upright (`\mathrm{in}`, `\mathrm{DD}`). Units are upright with a
  thin space: `$10\,\mathrm{k\Omega}$`.
- Logic: use `\overline{Q}` for complement, `\oplus` for XOR, `\cdot` or
  juxtaposition for AND, `+` for OR. Say once per page which notation you use.
- Pin and signal names in prose match the code exactly, in code font when you
  mean the identifier (`Cout`) and in maths when you mean the signal
  ($C_\mathrm{out}$).

## 8. Figures

- **Circuits come from the toolbox, always.** Use the committed exports
  (`exports/elements/<name>.svg`, `exports/circuits/<name>.svg`) or a render
  from a toolbox script. Never redraw a circuit by hand, in LaTeX, in a
  drawing program or in a web canvas.
- **LaTeX figures only for non-circuit figures** (timing diagrams, plots),
  built with `figures/figstyle.sty`.
- Figures on web pages are SVGs whose glyphs are outlines, so fonts survive in
  every browser. The toolbox's `pdftocairo` exports already are.
- **Every figure has alt text and a caption.**
  - Alt text (`fig-alt="..."`) says what the figure shows, for someone who
    can't see it: the components, how they connect, and the point of the
    figure. One to three sentences. Don't start with "Image of".
  - The caption is factual, IEEE style: "Fig. 1. Four full adders in a
    ripple-carry chain."
- **Colour is never the only carrier of meaning.** When a figure uses the
  high and low colours, say the level in words or labels too ("the carry
  wire, now high (1)").
- Refer to colours by role (high, low, accent, flow), never by hue. The
  default theme maps roles as follows; describe what the role means, not the
  colour:

  | Role | Meaning | Default (Okabe-Ito) |
  |---|---|---|
  | ink | symbols and labels | black |
  | low | wire at logic 0 | black |
  | high | wire at logic 1 | vermillion |
  | flow | electron-flow dots (demos only) | bluish green |
  | accent | time cursor, status words | blue |
  | highlight | translucent fills (transparent latch, clock-edge band) | orange |

  Because **low and ink are the same colour**, a figure shows logic 0 only by
  the absence of the high colour. Always state levels in text.
- Figure files sit beside the page or in `exports/`. Name them after what they
  show (`ripple_carry_4bit.svg`), in lowercase with underscores, like the
  toolbox exports.

## 9. Animations, clips and captures

- Short Manim clips only where motion explains behaviour (a carry rippling,
  a latch going transparent). A still figure is better when nothing moves.
- Clips come from the scene's `--save_sections` output: one clip per section.
  Name the clip after its section (`03_rising_edge.mp4`).
- **Every clip has captions** in a WebVTT file with the same name
  (`03_rising_edge.vtt`) and alt text describing what happens. Captions
  repeat the on-screen caption text and describe changes of level in words.
  TODO: confirm how Quarto's video embedding attaches a caption track
  (SCR-021).
- GIFs or short captures of web tools in use: under 10 seconds, no cursor
  flicker, with alt text describing the interaction.
- Video scripts: only when Blake asks. They go in `docs/scripts/` and are
  never published.

## 10. Front matter, versions and the draft gate

Every page starts with this front matter:

```yaml
---
title: "<Page title, sentence case>"
module: <toolbox | schema | site | ...>
module-version: <X.Y.Z of the module this page describes>
doc-type: <tutorial | how-to | reference | explanation>
updated: <YYYY-MM-DD>
tested: false            # tutorials and pages with runnable code only
tested-on: null          # date of the last passing CI run
draft: true
---
```

- `module-version` is the version the page was checked against. When the
  module changes, recheck the page and update the field, or add a TODO.
- `draft: true` stays until **Blake** approves the page in conversation.
  Scribe removes it only on his direct instruction, for the pages he names.
- On the site, a draft page also lives in `docs/_drafts/`, which Quarto never
  renders, and moves into `docs/` when Blake approves it. (`draft: true` alone
  isn't enough there: Quarto still writes an empty file at the page's
  address. Site `DECISIONS.md`, 2026-11-12.)
- `tested: true` is set only from a passing CI run, never by hand.
- Each change to a page goes in the repo's `CHANGELOG.md` under
  `[Unreleased]`.

## 11. Code snippets

- Every snippet must run as written, against the module version in the front
  matter. Copy from working code; don't type from memory.
- Snippets that a reader runs are complete: imports included, no `...`
  placeholders in executable lines.
- Until CI runs a page (`tested: false`), tutorials carry the untested banner
  from the tutorial template, and are listed in `docs/SCRIBE_TODO.md`.
- API signatures are never copied by hand into prose; link to the generated
  API reference instead.

## 12. Where docs live and how they are named

- Docs live in their module's own repo, under `docs/`:

  | Folder | Contents |
  |---|---|
  | `docs/tutorials/` | tutorials |
  | `docs/how-to/` | how-to guides |
  | `docs/reference/` | reference prose; `docs/reference/elements/` for one page per element; `docs/reference/api/` generated by quartodoc (never edited by hand) |
  | `docs/explanation/` | explanations |
  | `docs/templates/` | the four templates |
  | `docs/scripts/` | video scripts (never published) |
  | `docs/_drafts/` | site repo only: draft pages, never rendered, same layout as `docs/` |

- File names: lowercase, hyphens between words, ending in `.qmd`
  (`build-ripple-carry-adder.qmd`). An element's reference page uses the
  registry key: `docs/reference/elements/full_adder.qmd`.
- A module's docs are copied to the site repo's `docs/` only once the module
  is public. After the first copy, **every** update is copied too, in the
  same session.
- Repo-root files keep their conventional names: `README.md`, `CHANGELOG.md`,
  `HOW_TO_*.md`, `DECISIONS.md`.

## 13. Links and cross-references

- Link to other docs with relative paths; check that each target exists
  before committing.
- Refer to figures, tables and equations with Quarto cross-references
  (`@fig-…`, `@tbl-…`, `(@eq-…)`), which render IEEE style.
- Refer to code as `path/to/file.py` and, where useful, a line number
  (`toolbox/wire.py:5`). Line numbers go stale, so prefer a function or class
  name in published pages.
- External links: only to stable, free sources (official documentation,
  standards). No links to paywalled or commercial tutorials.
