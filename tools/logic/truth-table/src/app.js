// L1.1: truth table generator page. Two ways in (expressions, or rows entered by hand), one table, copy and export.
// All text from the person typing goes in with textContent, never as HTML.

import { CAP, parseVariableList, fromExpressions, blank, nextCell, setCell, setVariables, setOutputNames, addOutput, removeOutput, groupOf, listsOf, toFunctions, fromFunctions, markdownTable, latexTable, csvTable, shownCell } from "./table.js";
import { functionFile } from "../../analyze/src/export.js";
import { el, button, fileName, plural, copyText, download } from "../../common/src/ui.js";
import { circuitFor, sendToFigureEditor, solverHref, kmapHref, expressionOfFunction } from "../../common/src/handoff.js";

const SAMPLES = {
  "Exclusive OR": "F = A ^ B\n",
  "Majority of three": "M = AB + AC + BC\n",
  "Half adder (two outputs)": "S = A ^ B\nC = AB\n",
  "De Morgan: (AB)' and A' + B'": "X = (AB)'\nY = A' + B'\n",
};

/** The table. `onCell(output, row)` makes the output cells clickable (hand entry); without it they are plain text. */
function tableView(state, onCell) {
  const g = groupOf(state);
  const wrap = el("div", { className: "an-table-wrap" });
  const t = el("table", { className: "an-table" });
  t.append(el("thead", {},
    el("tr", {}, el("th", { rowSpan: 2, textContent: "#", scope: "col", title: "Row number" }), el("th", { colSpan: g.inputs.length, textContent: "Inputs", scope: "colgroup" }), el("th", { colSpan: g.outputs.length, textContent: "Outputs", scope: "colgroup", className: "an-out" })),
    el("tr", {}, ...g.inputs.map((c) => el("th", { textContent: c.shown, scope: "col" })), ...g.outputs.map((c) => el("th", { textContent: c.shown, scope: "col", className: "an-out" })))));
  const body = el("tbody");
  for (const row of g.rows) {
    const tr = el("tr", {}, el("td", { className: "an-row", textContent: String(row.index) }));
    row.inputs.forEach((b) => tr.append(el("td", { textContent: String(b) })));
    row.outputs.forEach((o, k) => {
      const shown = shownCell(o);
      const td = el("td", { className: o === "-" ? "an-out an-dc" : "an-out", title: o === "-" ? "Don't care (X)" : "" });
      if (onCell) {
        const b = el("button", { type: "button", className: "tt-cell", textContent: shown, ariaLabel: `Row ${row.index}, ${g.outputs[k].shown}: ${o === "-" ? "don't care" : o}. Press to change.` });
        b.dataset.output = k; b.dataset.row = row.index;
        b.addEventListener("click", () => onCell(k, row.index, b));
        td.append(b);
      } else td.textContent = shown;
      tr.append(td);
    });
    body.append(tr);
  }
  t.append(body);
  wrap.append(t);
  return wrap;
}

export function mount(root, { schemaUrl = "../analyze/model/schema/function.schema.json" } = {}) {
  let mode = "expr", state = null, schema = null, notice = "";
  const schemaReady = fetch(schemaUrl).then((r) => r.json()).then((s) => { schema = s; }).catch(() => { notice = "Could not load the function schema, so function files are not checked."; });

  // --- inputs ---
  const sample = el("select", { ariaLabel: "Sample" }, el("option", { value: "", textContent: "Choose a sample…" }));
  for (const name of Object.keys(SAMPLES)) sample.append(el("option", { value: name, textContent: name }));
  const file = el("input", { type: "file", accept: ".json,application/json", multiple: true, hidden: true });
  const upload = button("Open function file(s)…", () => file.click(), "Read function/0.1 files, for example from the analyser or the Boolean solver");
  const exprTab = el("button", { type: "button", role: "tab", textContent: "From expressions" });
  const rowsTab = el("button", { type: "button", role: "tab", textContent: "Enter rows" });
  const tabs = el("div", { className: "tt-tabs", role: "tablist" }, exprTab, rowsTab);

  const editor = el("textarea", { className: "an-editor", spellcheck: false, rows: 6, ariaLabel: "Expressions" });
  editor.setAttribute("autocapitalize", "off");
  const inputsField = el("input", { type: "text", className: "tt-field", ariaLabel: "Inputs, most significant first", placeholder: "A B C" });
  const outputsField = el("input", { type: "text", className: "tt-field", ariaLabel: "Output names", placeholder: "F" });
  const exprPane = el("div", {},
    el("p", { className: "an-hint", textContent: "One output per line, as  name = expression . A line with no name is called F. A' or ~A is NOT, AB or A*B is AND, + is OR, ^ is XOR." }),
    editor,
    el("label", { className: "tt-label" }, "Inputs (optional, most significant first) ", inputsField),
  );
  const rowsInputs = el("input", { type: "text", className: "tt-field", ariaLabel: "Inputs, most significant first", value: "A B C" });
  const rowsPane = el("div", {},
    el("p", { className: "an-hint", textContent: "Press a cell in the table to step it through 0, 1 and X (don't care). The first input is the most significant bit." }),
    el("label", { className: "tt-label" }, "Inputs ", rowsInputs),
    el("label", { className: "tt-label" }, "Outputs ", outputsField),
    el("div", { className: "an-bar" }, button("Add output", () => { state = addOutput(state, ""); draw(); }), button("Remove last output", () => { state = removeOutput(state, state.outputs.length - 1); draw(); }), button("All 0", () => fill("0")), button("All 1", () => fill("1"))),
  );
  const fill = (ch) => { state = { ...state, outputs: state.outputs.map((o) => ({ name: o.name, table: ch.repeat(o.table.length) })) }; draw(); };
  const status = el("p", { className: "an-status", role: "status" });
  const side = el("div", { className: "an-side" }, el("div", { className: "an-bar" }, sample, upload, file), tabs, exprPane, rowsPane, status);
  const results = el("div", { className: "an-results" });
  root.replaceChildren(el("div", { className: "an-layout" }, side, results));

  const say = (msg, bad = false) => { status.textContent = msg; status.className = bad ? "an-error" : "an-status"; };

  function draw() {
    exprTab.ariaSelected = String(mode === "expr"); rowsTab.ariaSelected = String(mode === "rows");
    exprPane.hidden = mode !== "expr"; rowsPane.hidden = mode !== "rows";
    results.replaceChildren();
    if (!state) { results.append(el("p", { className: "an-note", textContent: mode === "expr" ? "Type one or more expressions, or choose a sample." : "Name the inputs and press cells." })); return; }
    const g = groupOf(state);
    results.append(el("p", { className: "an-info", textContent: `${plural(g.inputs.length, "input")}, ${plural(g.outputs.length, "output")}, ${g.rows.length} rows${g.dontCares ? `, ${plural(g.dontCares, "don't-care cell")} (shown as X)` : ""}` }));
    results.append(tableView(state, mode === "rows" ? (k, r, b) => { state = setCell(state, k, r, nextCell(state.outputs[k].table[r])); draw(); document.querySelector(`.tt-cell[data-output="${k}"][data-row="${r}"]`)?.focus(); } : null));
    const lists = el("ul", { className: "an-forms tt-lists" });
    for (const l of listsOf(state)) lists.append(el("li", {}, el("span", { className: "an-label", textContent: l.name }), el("code", { textContent: `${l.sigma}   ${l.pi}` })));
    results.append(el("section", { className: "an-card" }, el("h3", { textContent: "Minterms and maxterms" }), lists));
    if (mode === "expr") results.append(el("div", { className: "an-bar" }, button("Edit as rows", () => { state = { variables: state.variables, outputs: state.outputs.map((o) => ({ name: o.name, table: o.table })) }; mode = "rows"; syncRowsFields(); draw(); }, "Switch to hand entry with this table, so cells can be changed or set to don't care")));
    results.append(exportView());
  }

  function exportView() {
    const box = el("section", { className: "an-export" }, el("h3", { textContent: "Copy and export" }));
    const g = groupOf(state);
    const bar = el("div", { className: "an-bar" });
    bar.append(
      button("Copy Markdown", (b) => copyText(markdownTable(state), b)),
      button("Copy LaTeX table", (b) => copyText(latexTable(state), b), "A tabular with one column per input and output"),
      button("Copy CSV", (b) => copyText(csvTable(state), b)),
      button("Download function files", () => {
        try { toFunctions(state, schema).forEach((fn) => download(`${fileName(fn.output ?? fn.id)}.function.json`, functionFile(fn))); }
        catch (e) { say(`Could not make the function files: ${e.message}`, true); }
      }, "One function/0.1 file per output, for the other logic tools"),
    );
    box.append(bar);
    // L1.4: send each output on. The solver takes its expression, the Figure Editor a circuit built from it.
    let fns = [];
    try { fns = toFunctions(state, schema); } catch (e) { box.append(el("p", { className: "an-error", role: "alert", textContent: `Could not make the function files: ${e.message}` })); }
    const send = el("div", { className: "tt-send" });
    for (const fn of fns) {
      const name = fn.output ?? fn.id, text = expressionOfFunction(fn);
      const row = el("div", { className: "an-bar" }, el("span", { className: "an-label", textContent: `Send ${name} to` }));
      row.append(
        button("Figure Editor", () => {
          const c = circuitFor(text, { id: `${name}_table`, output: name, variables: fn.variables, title: name });
          if (c.error) { say(`Could not build the circuit for ${name}: ${c.error}`, true); return; }
          const m = sendToFigureEditor(c.text);
          say(m ?? "Opened the Figure Editor in a new tab. Keep this tab open until the circuit has loaded.", !!m);
        }, "Opens a circuit for this output (its smallest sum of products, or the expression it came from) in a new tab"),
        el("a", { className: "an-link", href: solverHref(text, { goal: "sop", from: "../solver/" }), target: "_blank", rel: "noopener", textContent: "Boolean solver", title: "Opens the expression in the step-by-step solver in a new tab" }),
        ...(kmapHref(text, { name, variables: fn.variables }) ? [el("a", { className: "an-link", href: kmapHref(text, { name, variables: fn.variables }), target: "_blank", rel: "noopener", textContent: "K-map tool", title: "Opens the function on a K-map in a new tab" })] : []),
      );
      send.append(row);
    }
    box.append(send, el("p", { className: "an-hint", textContent: "Function files made here open in the K-map tool and the analyser." }));
    return box;
  }

  function syncRowsFields() {
    rowsInputs.value = state.variables.join(" ");
    outputsField.value = state.outputs.map((o) => o.name).join(" ");
  }

  // --- events ---
  let timer = 0;
  const runExpr = () => {
    let variables;
    if (inputsField.value.trim()) {
      const p = parseVariableList(inputsField.value);
      if (p.error) { state = null; draw(); say(p.error, true); return; }
      variables = p.variables;
    }
    const r = fromExpressions(editor.value, { variables });
    if (r.error) { state = null; draw(); say(r.error, true); return; }
    state = r.state ?? null;
    draw();
    say(notice);
  };
  const soon = () => { clearTimeout(timer); timer = setTimeout(runExpr, 150); };
  editor.addEventListener("input", soon);
  inputsField.addEventListener("input", soon);

  const applyRowsFields = () => {
    const v = parseVariableList(rowsInputs.value);
    if (v.error) { say(v.error, true); return; }
    state = setVariables(state, v.variables);
    const names = outputsField.value.split(/[\s,;]+/).filter(Boolean);
    if (names.length !== state.outputs.length) {
      // More or fewer names than columns: add or drop columns to match.
      let s = state;
      while (s.outputs.length < names.length) s = addOutput(s, names[s.outputs.length]);
      while (s.outputs.length > names.length && names.length) s = removeOutput(s, s.outputs.length - 1);
      state = s;
    }
    const r = setOutputNames(state, names.length ? names : state.outputs.map((o) => o.name));
    if (r.error) { say(r.error, true); return; }
    state = r.state;
    say("");
    draw();
  };
  rowsInputs.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(applyRowsFields, 250); });
  outputsField.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(applyRowsFields, 250); });

  const setMode = (m) => {
    if (m === mode) return;
    mode = m;
    if (m === "rows") { state ??= blank(["A", "B", "C"]); syncRowsFields(); draw(); }
    else runExpr();
  };
  exprTab.addEventListener("click", () => setMode("expr"));
  rowsTab.addEventListener("click", () => setMode("rows"));

  sample.addEventListener("change", () => {
    if (!sample.value) return;
    editor.value = SAMPLES[sample.value]; inputsField.value = "";
    mode = "expr"; runExpr(); sample.value = "";
  });
  file.addEventListener("change", async () => {
    await schemaReady;
    const list = [];
    for (const f of file.files) {
      try { list.push(JSON.parse(await f.text())); } catch (e) { say(`${f.name} is not valid JSON: ${e.message}`, true); file.value = ""; return; }
    }
    file.value = "";
    if (!schema) { say("The function schema did not load, so the file cannot be checked.", true); return; }
    const r = fromFunctions(list, schema);
    if (r.error) { say(r.error, true); return; }
    state = r.state; mode = "rows"; syncRowsFields(); say(`Opened ${plural(list.length, "function file")}.`); draw();
  });

  // ?expr=... fills the editor (for links and screenshots); ?mode=rows starts in hand entry.
  const params = new URLSearchParams(location.search);
  if (params.get("expr")) editor.value = params.get("expr");
  if (params.get("mode") === "rows") { mode = "rows"; state = blank(["A", "B", "C"], ["F"]); syncRowsFields(); draw(); }
  else runExpr();
  return { state: () => state, setExpressions: (t) => { editor.value = t; runExpr(); } };
}
