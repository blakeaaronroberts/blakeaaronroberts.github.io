---
title: "Review checklist: number systems converter (L2.1)"
repo: blakeaaronroberts.github.io
doc-type: review checklist
updated: 2026-11-25
---

# Review checklist: number systems converter (L2.1)

One draft page: **number systems converter**, on branch `l2-1`, hidden from search. Not merged. Only you approve it.

## Open it

1. In a terminal in the repository: `git checkout l2-1`, then `quarto preview --no-browser --port 4871`. Wait for "Listening".
2. Open `http://localhost:4871/tools/logic/number-systems/` (needs internet: the equations load MathJax from a CDN).
3. Stop the preview (Ctrl+C) before switching branches.

A case can also be opened from the address: `?n=-3&base=10&w=4&sys=twos` (`base` is 2, 10 or 16; `sys` is `unsigned`, `signmag`, `ones` or `twos`). Nothing is stored.

## Try these

| Try (Number, Entered as, Width, Representation) | Expect |
|---|---|
| `-3`, Decimal, 4, Two's complement | Bits `1101`, hex `D`, value -3, "Read as unsigned" 13. Working: "Magnitude 3 in 4 bits" `0011`, "Invert every bit" `1100`, "Add 1" `1101`. Weights -8, 4, 2, 1 with bits 1, 1, 0, 1 and the sum -8 + 4 + 0 + 1 = -3. |
| `-5`, Decimal, 4, Sign-magnitude | Bits `1101`. Working: magnitude `0101`, "Set the sign bit to 1". The sign column of the weights table says "sign"; the sum is written as minus the bracket (4 + 0 + 1). |
| `-5`, Decimal, 4, Ones' complement | Bits `1010`, one step: invert. Top weight is -7. |
| `8`, Decimal, 4, Two's complement | A red-bordered "Overflow" box: "8 does not fit in 4 bits as two's complement. The range is -8 to 7." Under it the ranges table, and a table showing 8 does fit as unsigned (`1000`). |
| `1011`, Binary, 4, Two's complement | Value -5. Under "Working", "Find the magnitude of a negative pattern": invert `0100`, add 1 `0101`. |
| The same `1011`, change Representation in turn | Unsigned 11, sign-magnitude -3, ones' complement -4, two's complement -5. The table "The same bits in each system" shows all four at once. |
| `1000`, Binary, 4, Sign-magnitude | Value 0 (negative zero) and a note that this system has two zeros. Same for `1111` in ones' complement. |
| `F0`, Hexadecimal, 8, Two's complement | Bits `1111 0000`, value -16. `0xF0` and `f0` give the same result. |
| `10000`, Binary, 4, Unsigned | Overflow: "needs 5 bits, but the width is 4". |
| `102`, Binary | Message: `"2" is not a binary digit (use 0 and 1).` Hex `12G`: `"G" is not a hexadecimal digit …`. `-101` as Binary: a sign goes only with decimal entry. |
| Width 1 to 32 | The range table follows. At 32 bits two's complement is -2147483648 to 2147483647. Width 0 or 33: a message, nothing drawn. |
| Leave Number empty | "Type a number, or choose a sample." and the ranges table for the chosen width (4-bit two's complement: -8 to 7). |
| Dark mode toggle | Table highlight (left bar on the chosen system) and the bit weights stay readable. |

## Checks made

- 15 tests (`quarto run tools/logic/number-systems/test/run.js`): ranges, a round trip of every value in every system for 1 to 5 bits, known patterns, overflow, the working steps, weights, negative zero, invalid digits, prefixes, and 32-bit values.
- The page loads no script except MathJax (the site's pinned copy) and stores nothing.

## Strings on screen: not approved

Every string below is as built and is **not approved**. Edit or strike any of them.

- Page: "Number systems converter (draft)"; "Convert between binary, decimal and hexadecimal in unsigned, sign-magnitude, ones' complement and two's complement, and see the range for a chosen width. Draft: it changes until Blake approves it."
- Fields: "Number", "Entered as", "Width in bits", "Representation", "Choose a sample…"; hint: "Decimal entry is a value and may have a sign. Binary and hexadecimal entry is the bit pattern. Spaces, underscores and the prefixes 0b and 0x are accepted."
- Samples: "-3 as 4-bit two's complement", "-5 as 4-bit sign-magnitude", "8 does not fit in 4-bit two's complement", "Hex F0 as 8-bit two's complement".
- Results: "Type a number, or choose a sample."; "Overflow"; "Bits", "Hexadecimal", "Value", "Read as unsigned"; "(negative zero)"; "has two zeros: 0 and negative zero."
- Section headings: "Working", "Bit weights", "Encode <value>", "Find the magnitude of a negative pattern", "Ranges for n bits", "The same value in each system", "The same bits in each system"; table heads "System", "Formula", "Bits", "Hex", "Value", "Bit position", "Weight", "Bit"; cell words "sign", "none", "does not fit".
- Steps: "Magnitude m in n bits", "Invert every bit", "Add 1", "Set the sign bit to 1", "Clear the sign bit", "Magnitude m, so the value is v".
- Messages: "<value> does not fit in n bits as <system>. The range is a to b."; "<entry> needs k bits, but the width is n. The largest pattern is … (…)."; `"<c>" is not a <binary|decimal|hexadecimal> digit (use …).`; "A sign goes only with decimal entry. A … entry is a bit pattern; choose decimal to enter a negative number."; "A sign needs digits after it."; "No digits after the prefix."; "The width must be a whole number from 1 to 32."
- Menu entry: "Number Systems (draft)".

## Known gaps

- Widths go to 32 bits. Wider needs a decision on what the weights table should do (it has one column per bit).
- Binary or hex entry with leading zeros beyond the width is accepted when the value fits (`00001010` at width 4 is `1010`).
- Fractions and radix points are not handled (integers only).
- Not yet seen in a live browser by Blake; the screenshots are headless Chrome.
