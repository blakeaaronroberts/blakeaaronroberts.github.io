# VISION change log

History of `VISION.md`. Newest first. Written by the Steward only.

- 2026-11-19 (Blake): new private repository `reviews` for reviewer reports,
  one folder per reviewed repository (`<repo>/<agent>.md`). Reviewers write only
  there and never commit to the repositories they read (sections 5 and 8).

- 2026-11-19 (Blake): FSM tool approved. New `fsm` format in the interface
  table (section 4) and an FSM tool among the products: state diagram, transition
  table and next-state and output equations, kept in sync, sending a circuit and
  a trace to the other tools.

- 2026-11-19 (Blake): engine memo approved. SystemVerilog front end is slang
  (with Yosys and yosys-slang for behavioural code), run offline first and in the
  browser if a spike passes; no SystemVerilog simulator ships in Phase 1; Icarus
  Verilog and Verilator are CI reference checks only; analog is ngspice in
  WebAssembly in Phase 3. The engines item leaves section 9; section 4 points to
  the memo.

- 2026-11-19 (Blake): tools are modular. The Schematic Editor is the drawing
  pane, the Figure Editor is the composite (schematic, timing, slides); every
  tool has its own page in the Tools menu and a mount interface so composites
  (Figure Editor, later the simulator) embed it (sections 4 and 6).

- 2026-11-14: **v2** (approved by Blake). Scope 200 to 600 level plus analog;
  FERPA-by-design and clean-IP rules (both ownership doors open); interface
  table adds `scenario`, `trace`, `function` and SystemVerilog in and out;
  phases reordered (Figure Editor, simulator with SystemVerilog import and
  export, small tools, flagship, launch, course run; SystemVerilog reference
  site Phase 2; FPGA lab and analog Phase 3); five weekly report-only
  reviewers incl. IP Inspector; token rules; prompts between agents must state
  model, effort and intent; circuit-model private until ownership is decided;
  change log moved out of VISION.md.

- 2026-11-13: Line weights and a public dark theme (section 7); figure editor
  options queued as F4.

- 2026-11-12 (late night): Figure editor is this week's priority (section 6,
  target 0). Licence working assumption, not final: Apache-2.0 for code,
  CC BY 4.0 for content (section 3).

- 2026-11-12 (night): Circuit-schema proposal approved. New planned public
  repo `circuit-model` (section 5); four-valued logic simulation (section 4);
  `unknown` and `floating` colour roles (section 7); datasheet delays are a
  Phase 3 goal; the location question is settled (section 9).

- 2026-11-12 (evening, closing): READMEs need no draft stage (the Scribe
  approves them); site drafts live in `docs/_drafts/`.

- 2026-11-12 (evening, final): `sync` protocol (section 8): Blake types
  `sync`, the Steward refreshes a Current state block in each handoff file,
  and every agent reconciles its memory with the files.

- 2026-11-12 (evening, last): Tools rule tightened to "free and open-source
  or our own", so the suite never depends on anything it can't keep.

- 2026-11-12 (evening, late): Builder work is centralised in
  `docs/STEWARD_HANDOFF.md`, written by the Steward with Blake's approval;
  the Scribe's handoff feeds it.

- 2026-11-12 (late): New documentation agent, the Scribe (section 8). Site
  launch rule now matches the URL-only pre-launch site; site pages may use
  their own theme while figures keep the default; third-party embeds settled
  as an interim.

- 2026-11-12 (night): Maths unified on STIX Two in every medium; the site
  and web tools move to MathJax 4 with its STIX2 font. Supersedes the
  "fonts by medium" maths rule below.
- 2026-11-12 (evening): Fonts set per medium (site and web tools keep
  MathJax's own maths font; LaTeX outputs use STIX Two). New Language
  convention. The architect chat is now called the Steward. Element count in
  the earlier entry corrected to 21.
- 2026-11-12 (later): Agents may set "approved" on Blake's direct instruction.
  Default theme now exists (Okabe-Ito, STIX Two, Fira Mono; private themes
  git-ignored). LaTeX-figure pipeline question settled. Prompted by
  `manimations/DECISIONS.md`.
- 2026-11-12: Copy placed in every repository; the Steward may write this
  file and no other. All 21 toolbox elements approved (corrected from 22).
- 2026-11-11: First draft. Core model, neutral default theme, first flagship
  and site launch gate decided.
