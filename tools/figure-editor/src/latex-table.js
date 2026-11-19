const LATEX_ESCAPE = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "$": "\\$",
  "&": "\\&",
  "#": "\\#",
  "%": "\\%",
  "_": "\\_",
  "^": "\\textasciicircum{}",
  "~": "\\textasciitilde{}",
};

function splitRow(line, delimiter) {
  const cells = [];
  let cell = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("A quoted table value is missing its closing quote.");
  cells.push(cell.trim());
  return cells;
}

export function parseTable(text) {
  const lines = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error("Enter a truth-table header.");
  if (lines.length > 65) throw new Error("A truth table can contain at most 64 cases.");
  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : null;
  if (!delimiter) throw new Error("Separate truth-table columns with commas or tabs.");
  const rows = lines.map((line) => splitRow(line, delimiter));
  const headers = rows[0];
  if (headers.some((cell) => !cell) || new Set(headers).size !== headers.length) {
    throw new Error("Every truth-table column needs a unique, non-empty heading.");
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length !== headers.length) {
      throw new Error(`Row ${i + 1} has ${rows[i].length} values; expected ${headers.length}.`);
    }
  }
  return rows;
}

export function latexTable(text) {
  const rows = parseTable(text);
  const escape = (cell) => [...cell].map((ch) => LATEX_ESCAPE[ch] ?? ch).join("");
  const columns = `|${"c|".repeat(rows[0].length)}`;
  const body = rows.map((row, i) => `${row.map((cell) => i === 0 ? `\\textbf{${escape(cell)}}` : escape(cell)).join(" & ")} \\\\`).join("\n\\hline\n");
  return `\\begin{tabular}{${columns}}\n\\hline\n${body}\n\\hline\n\\end{tabular}`;
}
