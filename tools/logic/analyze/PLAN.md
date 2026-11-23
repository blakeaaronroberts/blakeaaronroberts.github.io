# L5.1 Plan: Circuit analyser (draft until Blake approves)

Folder `tools/logic/analyze/`. Pinned to circuit-model `model-v0.10.0` (C17: `analyze/`, `logic/`). No new minimiser, no new format.

## Page layout (one page, top to bottom)

1. **Input bar.** Paste a `circuit`, upload a `.json`, or pick a sample (full adder from gates, 2-bit comparator, BCD to 7-segment, the NAND SR latch as a "not combinational" example). Later: "Use the Schematic Editor's circuit" and SystemVerilog (C11).
2. **Verdict.** One line, "Combinational" or "Not combinational", then the reasons from `analyze()` (kind, message, the element, pin or nets named). Not combinational: no table; a clocked circuit gets a pointer to the FSM tool (F23, when it exists). Undecided (`not_simulated`, a `block`) says so rather than guessing.
3. **Truth table.** One column per input bit and per output bit (`A[3]`, `Y[0]`), rows in table order, X/Z outputs shown as `-` with a flag and a count ("2 rows are don't cares").
4. **Per output bit** (tabs or stacked cards): minterms (Σm) and maxterms (ΠM) lists; canonical SOP and POS with term counts; minimal SOP and POS from `L.minimize` (every minimal cover listed, the cheapest by terms then literals marked); best pick; all rendered in MathJax.
5. **Copy bar.** Copy / download: LaTeX (`tabular`, per-output equations, combined `aligned`), Markdown, CSV, the `function` files, Verilog `assign` (L5.4).

## Data flow

`circuit` text, then `circuitToFunctions(circuit)` (C17): `{verdict, functions[], names}`; each `function/0.1` goes to `L.minimize` and the library's SOP/POS builders; text and LaTeX come from `expr.mjs` printers. The page only formats. All results are checked against the table in code before display (a minimal form that disagrees with the table is shown as an error, never as an answer).

## Where things go (needs Blake's OK, they touch files outside `tools/logic/analyze/`)

- `tools/shared/scripts/copy-model.js`: also copy `logic/*.mjs` and `analyze/*.mjs` at the pinned tag into `tools/shared/src/model/` (hashes in MANIFEST.json, as for `sim/`). L1 to L4 reuse the same copy.
- `_quarto.yml`: add `tools/logic/*/index.qmd` to `render` and `tools/logic/*/src/**` to `resources` (the current globs only reach one folder deep).
- Page loads MathJax from the site's pinned bundle (same one the editors use). Colours as roles only; figures theme untouched.

## Steps

L5.2 verdict + table (screenshot: full adder). L5.3 expressions (screenshot: comparator). L5.4 copy/export. L5.5 send to K-map / solver / Figure Editor. L5.6 check my answer (C17.5 `compareCircuit`). Tests per step with Deno, in `tools/logic/analyze/test/`.

## First release (L5.2 to L5.4)

In: pasted or uploaded circuit, verdict, table, canonical and minimal forms, LaTeX, Markdown, CSV. Out until later: SystemVerilog input, editor hand-off, hazard finder, NAND-only rewrites.

## Questions for Blake

1. Input: is paste, upload and samples enough for the first release (editor hand-off in L5.5)?
2. Beyond 8 inputs, C17 gives per-output tables over the inputs that reach each output. Show those with a clear note, or refuse above 8?
3. Show every minimal cover or only the first? (Default proposed: the first, with "n other equally small forms".)
4. OK to touch `copy-model.js` and `_quarto.yml` as above?
5. Student-facing wording avoids "simply", "obviously", "trivially".
