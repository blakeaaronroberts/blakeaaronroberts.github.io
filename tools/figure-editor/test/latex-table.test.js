import { assert, assertEquals, assertThrows } from "../../schematic-editor/test/helpers.js";
import { latexTable, parseTable } from "../src/latex-table.js";

Deno.test("truth-table LaTeX converts CSV and escapes text safely", () => {
  assertEquals(latexTable('A_B,Q\n0,"1, 0"\n1,0'), String.raw`\begin{tabular}{|c|c|}
\hline
\textbf{A\_B} & \textbf{Q} \\
\hline
0 & 1, 0 \\
\hline
1 & 0 \\
\hline
\end{tabular}`);
});

Deno.test("truth-table LaTeX accepts tab-separated values and escapes TeX controls", () => {
  assertEquals(parseTable("A\tB\n0\t1"), [["A", "B"], ["0", "1"]]);
  assertEquals(latexTable("A{bar},C%\nQ_0,\\x"), String.raw`\begin{tabular}{|c|c|}
\hline
\textbf{A\{bar\}} & \textbf{C\%} \\
\hline
Q\_0 & \textbackslash{}x \\
\hline
\end{tabular}`);
});

Deno.test("truth-table LaTeX accepts a header template and rejects ragged tables", () => {
  assert(latexTable("A,B").includes("\\textbf{A}"), "a prefilled header can be converted before values are filled");
  assertThrows(() => latexTable(""), /truth-table header/);
  assertThrows(() => latexTable("A,B\n0"), /expected 2/);
  assertThrows(() => latexTable('A,B\n0,"1'), /missing its closing quote/);
});
