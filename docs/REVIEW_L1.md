---
title: "Review checklist: logic tools (batch L1)"
repo: blakeaaronroberts.github.io
doc-type: review checklist
updated: 2026-11-24
---

# Review checklist: logic tools (batch L1)

Four draft pages: **truth table**, **Boolean solver**, **K-map**, and the earlier **circuit analyser** (L5, which gained a few links). All are
drafts on branch `l1`, hidden from search. Nothing is merged. Only you approve them.

## Open them

1. In a terminal in the repository: `git checkout l1`, then `quarto preview --no-browser --port 4871`. Wait for "Listening".
2. Open these addresses in a browser (needs internet: the equations load MathJax from a CDN):
   - `http://localhost:4871/tools/logic/truth-table/`
   - `http://localhost:4871/tools/logic/solver/`
   - `http://localhost:4871/tools/logic/kmap/`
   - `http://localhost:4871/tools/logic/analyze/`
3. After the branch is merged to `main` and the site deploys, the same pages are at `https://blakeaaronroberts.github.io/tools/logic/truth-table/` (and `solver/`, `kmap/`, `analyze/`).
4. Stop the preview (Ctrl+C) before switching branches.

## Truth table generator

| Try | Expect |
|---|---|
| Type `F = A ^ B` | A table of 4 rows, outputs 0 1 1 0, and `Σm(1, 2)  ΠM(0, 3)` under it. |
| Choose the sample "Half adder (two outputs)" | One table with columns A B S C. |
| Tab "Enter rows", press the F cell on row 3 once, twice, three times | It shows 1, then **X**, then 0. The lists under the table follow (X appears as `+ d(3)`). |
| With an X in the table, press "Copy Markdown", "Copy LaTeX table", "Copy CSV" and paste somewhere | The don't care is written **X** in all three. |
| "Download function files" | A `.function.json` file per output. Inside, a don't care is stored as `-` (that is the file format). |

## Boolean solver

| Goal (choose under "Goal") | Type | Expect |
|---|---|---|
| Minimal SOP | `(A + B)(A + C)` | 5 lines ending `A + BC`, each with a law name, the law, and the part it changed. A green tick says every line was checked against the truth table. |
| Minimal POS | `AB + A'C` | A longer working (it goes through the complement) ending `(A' + B)(A + C)`. |
| NAND-only | `AB + C'` | 3 steps ending `((AB)'C)'`, with a note on the two NAND levels. |
| NOR-only | `(A + B)C'` | Ends `((A + B)' + C)'`. |
| Prove two expressions equal | `(AB)'` and `A' + B'` | "Equal", with a short chain of laws. |
| Prove, with a counterexample | `A + B` and `AB` | "Not equal", a table of the differing rows, and the sentence "A = 0, B = 1 gives 1 for the first and 0 for the second". |
| "Your turn" tick-box, then `(A + B)(A + C)` | Only line 1 shows. Pick a law and press **Check**: a wrong pick says "not the law used for the next line"; **Hint** names the law; **Show the next line** reveals it. At the last line the result and buttons appear. |

## K-map

| Try | Expect |
|---|---|
| Type `F = B'D' + AC` | A 4 by 4 map. Orange solid outline round the four cells of `AC`; a blue dashed outline in the four corners (open at the map's edges, as one group), numbered 1 and 2, and the form `F = AC + B'D'`. |
| Press map cells | Each press steps 0, 1, X. The groups and form update. X cells may be drawn inside a group, and the text says which. |
| Choose "Group the 0s" | The groups cover the 0s and the form is a product of sums. |
| Sample "Two equally small forms" | A "Form" choice, 1 of 2 and 2 of 2. |
| Type `F = A + B + C + D + E` | A message: the map takes up to 4 inputs. |

## Hand-offs

**Download and open a function file, in each tool**
1. Truth table: type `F = A ^ B`, press "Download function files". The file `F.function.json` goes to your Downloads folder.
2. Solver: press "Open function file…" and choose it. Expect `F = A ^ B` in the box, with its working.
3. K-map: press "Open function file(s)…" and choose it. Expect the 2 by 2 map for F.
4. Analyser: press "Open file…" and choose it. Expect the line `F = A ^ B` and a 4-row table.

**Send to Figure Editor (opens a new tab)**
1. Keep the sending page open. In the truth table, type `F = A ^ B`.
2. Under "Copy and export", press **Figure Editor** next to "Send F to".
3. A new tab opens with the Figure Editor. Wait a few seconds. The status line says it opened the circuit, and a circuit for F is drawn.
4. Do **not** close the first tab until step 3 is done: the circuit is passed as a temporary address that lives only while that tab is open.
5. If nothing opens, allow pop-ups for the site and repeat. The solver ("Open in Figure Editor"), K-map ("Open in Figure Editor") and analyser (under each form) do the same.
6. The links "Boolean solver" and "K-map tool" next to each output open the other tool in a new tab with the expression filled in.

## Known gaps

- **Not yet seen in a live browser:** the new-tab "Send to Figure Editor" (the page cannot be tested from a script). Treat step 3 above as the real test.
- **"Your turn" limit:** it can only compare your choice with the law the tool uses next. Another law may also be valid on that line, and the tool says so rather than marking it wrong. Checking any valid law needs circuit-model to export how each law is applied.
- **Input limits:** the truth table, solver and analyser take up to 8 inputs (circuit-model's limit). The K-map takes up to 4. Maps for 5 and 6 inputs are not built: circuit-model has no layout for them.
- The solver ignores don't cares: it works the expression as typed. The K-map uses them.
- The NAND-only and NOR-only workings end with an expression; "Open in Figure Editor" draws it as ordinary gates, not as NAND or NOR gates.
- The solver's POS, NAND-only and NOR-only workings go through the complement, so they are long (about 15 lines for a POS).
- Group colours are the figure theme's (Okabe-Ito) and each group also has its own dash pattern and number. Checked in dark mode only so far.
- The analyser now writes don't cares as X as well. Its saved files still use `-`.
