# Handoff: first run (pre-launch page, release home, Figure Editor first open)

## Overview

The redesign covers what a visitor sees first:

1. **Pre-launch page** (`index.qmd`): the title block and "Site under construction". No navigation, no internal links.
2. **Release home** (`home.qmd`, live at launch): the bio, then Projects, Explorations and Tools as three equal sections.
3. **Figure Editor, first open** (`tools/figure-editor/`, and the Schematic Editor page without the composite parts): loading state, a start chooser, a three-step tour, tooltips, a Keys dialog, and a clearer toolbar and status bar.

## About the design files

`design/First Run v2.dc.html` is a **design reference built in HTML**: a clickable prototype of the intended look and behaviour. It is not production code. Rebuild it in this repository's own environment: Quarto pages and SCSS for the site pages, and the editor's ES modules (`tools/schematic-editor/src/app.js`, `tools/figure-editor/src/index.js`) with `editor.css` for the tool. Open the file in a browser; the **Jump to** row above the artboard goes straight to any state. Click the artboard first to use the keyboard.

Placeholders in the reference that the real site replaces:
- Striped boxes labelled "examples/full-adder.json", "timing diagram" and "figure plate" are where the editor's real drawing, the timing diagram and screenshot thumbnails go.
- Element tiles show an empty plate; the real tiles keep the symbol pack thumbnails.

## Fidelity

**High fidelity** for layout, spacing, type, states and interactions. Colours are the existing blueprint roles, so use the roles, never the hex values (see "Design tokens"). The reference is drawn at 1440 × 900.

---

## Design tokens

All values map to existing roles. Light / dark from `themes/blueprint/light.scss` and `dark.scss`; canvas from `themes/okabe-ito/figures.scss` and `custom.scss`.

| Role in the design | Light | Dark | Existing source |
|---|---|---|---|
| background | `#f6f4ee` | `#1c1b19` | `--role-background` |
| ink | `#1a1917` | `#e6e2d8` | `--role-ink` |
| muted | `#5c5950` | `#a8a39a` | `--role-muted` |
| rule | `#cfcac0` | `#3a3834` | `--role-rule` |
| rule, soft (inner dividers) | `#e2ded5` | `#2c2b28` | **new**: derive as `mix(rule, background, 50%)` in `custom.scss`, publish as `--role-rule-soft` |
| surface | `#ece8df` | `#262522` | `--role-surface` |
| accent | `#1f4e79` | `#e38b3f` | `--role-accent` |
| accent hover | darken 10% | lighten 8% | `--role-accent-hover` |
| text on accent | background | background | `--role-background` |
| canvas | `#ffffff` | `#131311` | `--fig-background` / `--fig-dark-background` |
| canvas grid dots | `#d4d4d4` | `#34322e` | `--fig-grid` / `--fig-dark-grid` |
| scrim (behind dialogs, tour) | ink at 42% | black at 55% | `color-mix(in srgb, var(--role-ink) 42%, transparent)` (the editor's dialogs already use 40%) |
| floating shadow | `0 1px 2px rgb(26 25 23 / .08), 0 8px 28px rgb(26 25 23 / .14)` | same, alpha .4 / .5 | existing `.fe-popover` uses `0 4px 14px rgb(0 0 0 / .18)`; either is fine |

**Type.** IBM Plex Sans (text, weight 450 body, 600 headings) and IBM Plex Mono (labels), already loaded by `themes/blueprint/fonts.html`.

| Use | Family | Size / weight | Other |
|---|---|---|---|
| Mono label (section labels, tabs, meta) | Plex Mono | 11–11.5px / 400 | uppercase, letter-spacing .06–.08em, muted. This is `.label-mono` at a smaller size |
| Keycap | Plex Mono | 10.5–11px | 1px rule border, 2px bottom border, padding 1px 5–6px, surface or background fill |
| Editor body | Plex Sans | 14px / 450 | line-height 1.5 (the reference uses 14px; the current `.fe` is 1.05rem; the builder may keep 1.05rem if Blake prefers legibility) |
| Dialog heading | Plex Sans | 17px / 600 | letter-spacing -0.01em |
| Tour title | Plex Sans | 15px / 600 | |
| Card title (release home) | Plex Sans | 14.5px / 600 | line-height 1.3 |
| Section heading (release home) | Plex Sans | 19px / 600 | |
| Name in title block | Plex Sans | 30px / 600 | line-height 1.15, letter-spacing -0.02em |

**Shape.** Square corners everywhere (the site rule). Hairline 1px rules. Shadows only on floating layers (start chooser, tour popover, Keys dialog, toast). The status dots are the only round shapes.

**Spacing.** 4px base: 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 40px.

**Motion.** 120–150ms for hover colour and border changes; 300ms `cubic-bezier(.2,.8,.2,1)` for the tour spotlight and popover moving between steps; 200ms for dock and chevron. All off under `prefers-reduced-motion: reduce`.

---

## Screen 1: pre-launch page (`index.qmd`)

**Purpose.** Show who Blake is. Links to nothing on the site (CLAUDE.md, pre-launch access).

**Layout.** Top bar 52px with only the dark-mode toggle at the right (as today). Content column 794px (unchanged), 120px from the top bar to the title block.

**Components.**
- Title block: unchanged structure (`_title-block.qmd`): grid `1.4fr 1fr 160px`, 1px gaps showing the rule colour. Cells padded 20px 22px (top cell) and 16px 22px (lower cells). Name 30px/600; role and affiliation 15px (affiliation muted); credential mono 11.5px uppercase muted, 12px above. "Areas of focus" mono label, then the three areas at 14.5px with 4px gap. REV stamp: mono 11.5px uppercase accent, 1px accent border, padding 2px 8px. GitHub and LinkedIn links: mono 11.5px uppercase accent, underline 1px, offset 3px, 18px apart.
- Status line, 28px below the block: a 6px accent dot that pulses (opacity 1 → .35, 2.4s ease-in-out, infinite; static under reduced motion), then "Site under construction" (mono 11.5px, uppercase, letter-spacing .08em, muted).

## Screen 2: release home (`home.qmd`)

**Purpose.** At launch: who Blake is, then his work, with Projects, Explorations and Tools given equal weight.

**Layout.** Site navbar (Screen 3). Scrolling content column 794px, 40px top padding.
1. Title block (as Screen 1).
2. Bio paragraph, 28px below: the existing `home.qmd` paragraph, verbatim. 15.5px, line-height 1.7.
3. **Section bar**, 36px below: a three-column grid with a 1px ink rule above and a 1px rule below. It sticks to the top of the scroll area. Each cell is a button, padding 12px 14px, 1px soft-rule left border: number (mono 11px muted, "01"), title (mono 12px uppercase, .08em), count right-aligned (mono 11px muted). Hover: surface fill. Click scrolls to that section (smooth; scroll-margin-top 46px).
4. **Three sections**, same template, in this order: 01 Projects, 02 Explorations, 03 Tools. Each: padding 28px 0 8px; header row with the number (mono 11px muted), title (19px/600) and "All projects →" / "All explorations →" / "All tools →" at the right (mono 11px uppercase accent; underline on hover). Then a two-column grid of cards, 12px gap.
5. Footer: 36px above, a soft rule, "© 2026 Blake Roberts" (mono 11px uppercase muted).

**Card.** A grid: 128px thumbnail column, then text. Minimum height 96px. 1px rule border, background fill. Thumbnail: white plate (`--fig-background`), 1px rule on its right, image contained, max height 80px, 8px padding. Text: padding 12px 14px; title 14.5px/600; subtitle 12.5px muted, line-height 1.4. Hover: accent border, surface fill, 150ms.

**Data.** Use Quarto listings so cards come from front matter:
- Projects: `contents: projects`, `sort: priority`, fields image, title, subtitle.
- Explorations: `contents: explorations`, `sort: "date desc"`, fields image, title, description.
- Tools: a small YAML file (for example `tools/listing.yml`) with title, description and href for Figure Editor, Schematic Editor and Timing Diagram, and a thumbnail when one exists.
- The navbar's Explorations, Projects and Tools links keep pointing at their own pages (`explorations.qmd`, `projects.qmd`, the Tools menu). In the reference they scroll to the section only because the prototype has one page.

Content shown in the reference (from the repo):
- Projects: CSNN - Compressive Sensing Neural Network; Low Power, Wide Tuning Range PLL with 8 Output Phases; Low-Pass Switched Capacitor Filter Design; TouchSynth Modular Audio Synthesis System, each with its `subtitle` and `thumbnail.png`.
- Explorations: K-Maps (template) with `kmap.svg`, and a `[Exploration title]` placeholder card.
- Tools: Figure Editor ("The Schematic Editor and the Timing Diagram, with slide export."), Schematic Editor `[Description]`, Timing Diagram `[Description]`.

## Screen 3: site navbar (every page except pre-launch)

Height 48px, 1px rule below. Left: "Blake Roberts" (15px/600, -0.01em) linking home; nav links in mono 11.5px uppercase (.06em), padding 6px 8px, muted, ink on hover; the active link is ink with a 1px accent underline (inset box-shadow). On tool pages, after the links: a "/" separator (rule colour) and the tool name (13.5px/500). Right: search field 180 × 30px (surface fill, rule border, magnifier icon, "Search", a "/" keycap); GitHub icon button and the dark-mode toggle, each 32 × 32px, surface on hover.

The look applies to Quarto's navbar through `custom.scss` (`.navbar`, `.nav-link`); the existing hide rules for the landing page stay.

## Screen 4: Figure Editor

### Loading
Shown while `loadPack` runs (today: the text "Loading the symbol pack…"). A 2px progress line under the navbar: a 40%-wide accent bar sliding across a soft-rule track (1s, `cubic-bezier(.4,0,.2,1)`, infinite). The toolbar, left column and right column show flat surface-coloured placeholder blocks in their final positions. Centre: "Loading the symbol pack…" (mono 12px muted). Status bar shows the same text.

### Layout
The grid is 240px | 1fr | 264px columns and 44px | 1fr | 28px rows. **U1.6 only:** the right-hand column and the dock are new. Without U1.6, keep the current left column of panes and the section stack, and apply the toolbar, status bar, chooser and tour work to them.

### Toolbar (44px, 1px rule below)
- **Figure name block**, 240px wide, aligned over the left column, rule on its right, padding 0 16px. Name 13.5px/600 ("Untitled figure", or the figure's title). Under it, mono 10.5px muted with a 5px dot: "Not saved yet" (rule-coloured dot) before the first change, then "Autosaved in this browser" (accent dot). If `store.set` fails, show the existing message "Autosave is off: …" instead (dot hollow). The text carries the state, not the dot alone.
- **Button groups**, as today (Tool, Edit, History and Clipboard, View, Grid), separated by 1px soft rules with 6px padding. Buttons are 30 × 30px, 16px icons from `ICONS` in `app.js`, no border; surface fill on hover; the pressed tool is filled with accent and drawn in background colour. Undo and Redo at 35% opacity while there is nothing to undo or redo.
- **Grid**: mono 11px "GRID" label, then a two-segment control (½ | 1) with a 1px rule border, 28 × 24px segments; the selected segment is ink fill with background text.
- **Right side**, 8px gap:
  - **Frame stepper**: a 1px rule box holding ◀, "Frame n/8" (mono 11.5px, the "/8" muted, min-width 64px) and ▶. Buttons are 26 × 26px.
  - **Keys** (?) icon button.
  - A soft divider, 20px tall.
  - **Open…** and **Save** icon buttons.
  - **Export** as the only filled button: accent fill, 30px tall, padding 0 12px, 13px/600, with the export icon at 14px.

### Tooltips
On hover or keyboard focus of any toolbar button: a tooltip 0px below the toolbar, centred on the button, ink fill, background text, 12px, padding 5px 8px. If the button has a key, a keycap follows (mono 10.5px, border in background colour at 35%). Labels and keys come from the existing `btn()` titles and `aria-keyshortcuts`. No delay on first hover; hide on leave or blur.

### Left column: Elements
Header padding 12px 12px 8px with the mono label "ELEMENTS" and a search field (30px, rule border, surface fill, magnifier, placeholder "Search elements"). The field filters element types by name, ignoring underscores. While filtering, categories with matches open and the others hide; with no matches, show "No elements match “…”." (13px muted). Category rows are 32px: chevron, title (600 when open), count right-aligned (mono 11px muted); surface on hover. Tiles sit in a three-column grid with 6px gaps: a 1px soft-rule border, a 40px plate on the canvas colour, then the name in mono 10px muted; accent border on hover.

### Right column: inspector (U1.6)
Sections are separated by soft rules, padded 12px 14px:
- **Selection**: "Nothing selected" when nothing is selected.
- **Figure**: Figure id and Title fields, 30px, surface fill.
- **Logic**: "Calculate logic levels" as a square switch (30 × 16px track, accent when on, 10px knob), with the existing hint text below.
- **Collapsed rows**, 38px each, for Export, Theme, Node levels, Frames, Backdrop and Warnings: mono 11px uppercase, with a right chevron.
- Slide shows only in the slide view, as today.

### Canvas
Canvas colour with a 20px dot grid (dots on the grid colour). The drawing comes from the editor, unchanged.

### Dock (U1.6)
A 1px rule above, then a 32px tab bar: "TIMING DIAGRAM" and "SLIDE" (mono 11.5px uppercase), each tab padded 0 10px. The active tab is ink with a 2px accent underline; inactive tabs are muted. A chevron at the far right shows or hides the panel. The open panel is 230px tall (resizable as today) and holds the existing Timing Diagram or Slide view.

### Status bar (28px, surface fill, 1px rule above)
Left: the status text (mono 11.5px muted, cut off with an ellipsis). Right, 16px gaps:
- the Tour button, shown once the example has loaded and no tour is running (20px tall, rule border, "Tour 0/3" or "Tour 3/3");
- "Grid ½";
- zoom percentage;
- "Frame n/8".

## Screen 5: start chooser (first open)

**When.** No `?open=`, no autosave, the pack has loaded. Replaces the block that loads `examples/full-adder.json` without asking. With an autosave, or with `?open=`, nothing changes: the figure loads with no chooser.

**Look.**
- **Panel**: 600px wide, centred on the canvas, background fill, 1px rule border, floating shadow.
- **Header**: padding 16px 20px 4px; heading "Start a figure" (17px/600); a close button at the right (28px, ✕ icon, muted). Close does the same as Empty figure.
- **Intro**: padding 0 20px 14px, 13.5px muted: "Autosave stays in this browser; use Save to take a figure to another computer."
- **Options**: three in a row, 10px gap, padding 0 20px 20px. Each option has:
  - a 92px preview strip;
  - text padded 10px 12px 12px: title 13.5px/600, line 12.5px muted;
  - a keycap in its top-right corner (1, 2, 3).
- **The three options**:
  1. **Full adder example**, "Eight frames and a timing diagram". Its preview is the full-adder thumbnail. A "RECOMMENDED" tag sits top-left (mono 9.5px, accent fill), and the option has a 2px accent border.
  2. **Empty figure**, "Place elements, press W to wire". Its preview is a dot grid.
  3. **Open…**, "A saved .json or an SVG". Its preview is the open icon on a surface fill.
- **Hover**: accent border and surface fill.

**Behaviour.**
- **Full adder example (key 1)** runs today's example code: load the example, build the truth-table frames, and seed the timing source when it's empty. The status becomes "A full adder to start: step through its eight frames with ◀ ▶, or open Timing Diagram." Do not overwrite it. If the tour hasn't been seen, start it.
- **Empty figure (key 2, Esc or ✕)** leaves the figure empty with the status "Pick an element on the left to place it, or press W to draw a wire. Press ? for the keys." The canvas centre shows an empty state:
  - "Empty figure" (15px/600);
  - the line above (13.5px muted, max-width 320px);
  - keycap hints: W Wire, P Port, T Label, ? Keys.
  The empty state hides as soon as the figure has content.
- **Open… (key 3)** shows a drop zone over the canvas: inset 32px, a 1.5px dashed rule border, and background at 70% over the canvas. It holds the open icon, "Drop a figure here" (15px/600) and "A saved figure (.json) or an SVG" (13px muted), with two buttons: **Choose file…** (filled, opens the existing `.fe-file` input) and **Back** (returns to the chooser). The status reads "Open: drop a .json or .svg file, or choose one." Dropping or choosing a file uses the existing load path.
- **Accessibility**: the chooser is a dialog (`role="dialog"`, labelled by its heading). Focus moves to option 1, and focus stays inside the dialog until a choice is made.

## Screen 6: tour, toast and Keys dialog

**Tour.** Three steps, started after the full adder loads if `figure-editor/tour-seen` is not set. It replays from the status bar's Tour button.

| Step | Target | Popover position | Title | Body | Extra button |
|---|---|---|---|---|---|
| 1 | Frame stepper | Below, right-aligned to the target, 14px gap | Step through the frames | A full adder to start: step through its eight frames with ◀ ▶ or the arrow keys. | |
| 2 | Dock tab bar (or the Timing Diagram section bar without U1.6) | Above, left-aligned 24px in, 14px gap. Anchor by its **bottom** edge so the height can change | Timing Diagram | The same eight frames, as signals over time. Open it here; it docks under the schematic. | "Open it" (opens Timing Diagram; hidden once it is open) |
| 3 | Elements column | Right of the target, 16px gap, 80px below its top | Place elements | Pick an element on the left to place it, or press W to draw a wire. Press ? for the keys. | |

- **Spotlight**: a box at the target's rectangle with a 2px accent outline, inset by 2px so it is never cut off at the window edge. A `0 0 0 9999px` scrim shadow dims everything around it. The box and popover glide 300ms between steps; under reduced motion they jump instead. The spotlight doesn't catch clicks, so the target stays usable: step 1's ◀ ▶ work during the tour.
- **Popover**: 300px wide, background fill, rule border, floating shadow, and a 10px rotated-square arrow pointing at the target.
  - **Header**: padding 14px 16px 4px. "n / 3" (mono 11px muted), then three 14 × 2px progress bars (accent up to the current step, rule after), then "Skip tour" (12.5px muted) at the right.
  - **Title** and **body** below the header.
  - **Footer** with a soft rule above, padding 10px 16px 14px: Back (from step 2), the extra button if the step has one, then Next (filled) at the right with a "↵" hint. Next reads "Done" on step 3.
- **Keys**: Enter means Next, Esc means Skip, and ← → step frames during step 1.
- **Ending**: Done or Skip sets `figure-editor/tour-seen` and shows a toast. Done: "You’re set. Press ? any time for the keys." Skip: "Tour skipped. Replay it from the status bar."

**Toast.** Bottom centre, 48px above the window bottom. Ink fill, background text, 13px, padding 9px 14px, floating shadow, a "?" keycap after the text. It hides after 3.8s. Use `role="status"`.

**Keys dialog** (the existing `.fe-help`, restyled):
- **Size**: 720px wide, at most 680px tall, background fill, rule border, floating shadow, over the scrim.
- **Header**: padding 16px 20px, soft rule below. "Keys" (17px/600), a "?" keycap, and a close ✕ at the right.
- **Body**: scrolls if needed. Each row is a grid of 200px and 1fr, padded 9px 0, with a soft rule below. Keys are keycaps on the left; the description is on the right at 13px.
- **Content**: the `KEYS` array in `app.js`, unchanged.
- **Closing**: Esc, ?, the ✕, or a click on the scrim.

---

## State (editor)

| State | Where it lives | Values |
|---|---|---|
| Start choice | in memory, this session | none (chooser open), `example`, `empty`, `open` |
| Tour step | in memory | 0 (off), 1, 2, 3 |
| Tour seen | browser storage, `figure-editor/tour-seen` (Schematic Editor page: `schematic-editor/tour-seen`) | `"1"` |
| Element filter | in memory | text |
| Autosave state | from `store.set` result | not yet, saved, off |
| Toast | in memory, timer | text or none |

The chooser never opens when `?open=` or an autosave exists. Clearing the autosave (New) does not re-open it.

## Copy needing approval (VISION.md section 3)

The design adds UI text that is not in the repo today. Blake approves or replaces each string:

- Pre-launch and home: "Projects", "Explorations", "Tools" (from the navbar); "All projects →", "All explorations →", "All tools →". Tool description: "The Schematic Editor and the Timing Diagram, with slide export." (adapted from `tools/figure-editor/README.md`). Placeholders: `[Exploration title]`, `[Description]` (×3).
- Editor: "Untitled figure"; "Not saved yet"; "Autosaved in this browser"; "Start a figure"; "Full adder example", "Eight frames and a timing diagram", "Recommended"; "Empty figure", "Place elements, press W to wire"; "Open…", "A saved .json or an SVG"; "Drop a figure here", "A saved figure (.json) or an SVG", "Choose file…", "Back"; "Open: drop a .json or .svg file, or choose one."; "Search elements", "No elements match “…”."; "Nothing selected".
- Tour: the titles "Step through the frames", "Timing Diagram" and "Place elements". The bodies reuse existing status strings, apart from "or the arrow keys", "The same eight frames, as signals over time. Open it here; it docks under the schematic." and "Open it". Also "Skip tour", "Back", "Next", "Done", "Tour", "You’re set. Press ? any time for the keys." and "Tour skipped. Replay it from the status bar."

Existing strings reused unchanged:
- "Site under construction"
- the bio paragraph
- "Loading the symbol pack…"
- "A full adder to start: …"
- "Pick an element on the left …"
- "Autosave stays in this browser; …"
- the Logic hint
- the `KEYS` list
- the toolbar titles

## Assets

| Asset | Source in repo |
|---|---|
| Headshot | `images/headshot.jpg` |
| Project thumbnails | `projects/csnn/`, `projects/pll/`, `projects/sc-filter/`, `projects/touchsynth/` `thumbnail.png` |
| Exploration thumbnail | `explorations/kmaps/kmap.svg` |
| Toolbar icons | `ICONS` in `tools/schematic-editor/src/app.js` (no new icons) |
| Navbar icons | Bootstrap Icons already loaded by Quarto: `bi-github`, `bi-search`, `bi-toggle-on`, `bi-toggle-off`, `bi-x-lg` |

Tool thumbnails do not exist yet. CLAUDE.md says thumbnails are screenshots of figure plates, so make them from the editor's own export.

## Files

- `design/First Run v2.dc.html`: the reference (all screens and states; **Jump to** row above the artboard).
- Repo files the design was built from: `index.qmd`, `home.qmd`, `_title-block.qmd`, `custom.scss`, `themes/blueprint/*.scss`, `_quarto.yml`, `projects.qmd`, `explorations.qmd`, `projects/*/index.qmd`, `explorations/kmaps/index.qmd`, `tools/figure-editor/index.qmd`, `tools/figure-editor/src/index.js`, `tools/schematic-editor/src/app.js`, `tools/schematic-editor/src/categories.js`, `tools/schematic-editor/editor.css`, `themes/okabe-ito/figures.scss`.
