// L5.2: the analyser's page. A text editor (type or paste a circuit, or one `output = expression` per line), a verdict,
// and the truth table. All text from the person typing goes in with textContent, never as HTML.

import { analyseText, CAP } from "./analyze.js";
import { shownCell, bestText, circuitFile, csv, functionFile, latexEquations, latexTable, markdown, verilogAssign } from "./export.js";
import { checkAnswer } from "./check.js";
import { sendToFigureEditor, solverHref, kmapHref, expressionOfFunction } from "../../common/src/handoff.js";

const EXPRESSION_SAMPLES = {
  "Half adder (expressions)": "S = A ^ B\nC = AB\n",
  "Majority of three (expressions)": "M = AB + AC + BC\n",
  "2-to-4 decoder (expressions)": "Y0 = A'B'\nY1 = A'B\nY2 = AB'\nY3 = AB\n",
};
const CIRCUIT_SAMPLES = {
  "Full adder from gates (circuit)": "full_adder_gates",
  "2-bit comparator (circuit)": "comparator_2bit",
  "BCD to 7-segment (circuit)": "bcd_to_7seg",
  "NAND SR latch (circuit, not combinational)": "nand_sr_latch",
  "D flip-flop (circuit, not combinational)": "d_flipflop",
};

// MathJax: the site's pinned MathJax 4 bundle (same URL as _quarto.yml, with its SHA-384 hash). Quarto only loads it on pages
// that contain maths, and this page makes its maths at run time, so the page loads it itself unless it is already there.
const MATHJAX_URL = "https://cdn.jsdelivr.net/npm/@mathjax/mathjax-stix2-font@4.1.3/tex-mml-chtml-mathjax-stix2.js";
const MATHJAX_SRI = "sha384-CJjhmfvJA5XRHyZl+TpLl4s4BjLmd4GJzhwHAYQyq+Zu+728ElSiWdPtmhSuPG60";
let mathjax = null;
function loadMathJax() {
  mathjax ??= new Promise((resolve, reject) => {
    const ready = () => window.MathJax.startup.promise.then(() => resolve(window.MathJax), reject);
    if (window.MathJax?.typesetPromise) { resolve(window.MathJax); return; }
    if (!window.MathJax) window.MathJax = { startup: { typeset: false }, tex: { inlineMath: [["\\(", "\\)"]] } };
    const s = el("script", { src: MATHJAX_URL, async: true, integrity: MATHJAX_SRI, crossOrigin: "anonymous" });
    s.onload = ready;
    s.onerror = () => { mathjax = null; reject(new Error("could not load MathJax (offline?)")); };
    document.head.append(s);
  });
  return mathjax;
}

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
};

function verdictView(r) {
  const v = r.verdict;
  const box = el("section", { className: "an-verdict" });
  box.setAttribute("aria-live", "polite");
  const [mark, word, tone] = v.undecided ? ["?", "Cannot decide", "unsure"] : v.combinational ? ["✓", "Combinational", "yes"] : ["✕", "Not combinational", "no"];
  box.dataset.tone = tone;
  box.append(el("h2", {}, el("span", { className: "an-mark", textContent: mark }), ` ${word}`));
  if (v.from === "expressions") box.append(el("p", { textContent: "An expression has no memory and no loops, so what you typed is combinational." }));
  if (v.combinational && v.from !== "expressions") box.append(el("p", { textContent: "No memory, no feedback loop, no tri-state, and every input and output is connected. Every input combination was simulated." }));
  if (v.reasons.length) {
    const list = el("ul", { className: "an-reasons" });
    for (const x of v.reasons) list.append(el("li", {}, el("code", { textContent: x.kind }), ` ${x.message}`));
    box.append(list);
  }
  if (v.sequential) box.append(el("p", { className: "an-note", textContent: "This is a clocked circuit, a state machine. Analysing those is planned for the FSM tool, which is not built yet." }));
  if (!r.groups.length && !v.combinational) box.append(el("p", { className: "an-note", textContent: "No table is shown for this circuit." }));
  if (r.groups.length && !v.combinational) box.append(el("p", { className: "an-note", textContent: "The table below is the simulator's answer for reference; the reasons above say why it does not describe a combinational circuit." }));
  return box;
}

function tableView(g) {
  const wrap = el("div", { className: "an-table-wrap" });
  const t = el("table", { className: "an-table" });
  const head1 = el("tr", {}, el("th", { rowSpan: 2, textContent: "#", scope: "col", title: "Row number" }), el("th", { colSpan: g.inputs.length, textContent: "Inputs", scope: "colgroup" }), el("th", { colSpan: g.outputs.length, textContent: "Outputs", scope: "colgroup", className: "an-out" }));
  const head2 = el("tr", {});
  g.inputs.forEach((c) => head2.append(el("th", { textContent: c.shown, scope: "col" })));
  g.outputs.forEach((c) => head2.append(el("th", { textContent: c.shown, scope: "col", className: "an-out" })));
  t.append(el("thead", {}, head1, head2));
  const body = el("tbody");
  for (const row of g.rows) {
    const tr = el("tr", {}, el("td", { className: "an-row", textContent: String(row.index) }));
    row.inputs.forEach((b) => tr.append(el("td", { textContent: String(b) })));
    row.outputs.forEach((o) => tr.append(el("td", { className: o === "-" ? "an-out an-dc" : "an-out", textContent: shownCell(o), title: o === "-" ? "X or Z on this row: a don't care" : "" })));
    body.append(tr);
  }
  t.append(body);
  wrap.append(t);
  return wrap;
}

function resultView(r) {
  const out = el("div", { className: "an-result" });
  if (r.empty) { out.append(el("p", { className: "an-note", textContent: "Type or paste a circuit, or write one line per output such as  Y = A'B + C , or choose a sample." })); return out; }
  if (r.error) { out.append(el("p", { className: "an-error", role: "alert", textContent: r.error })); return out; }
  out.append(verdictView(r));
  if (r.renames?.length) out.append(el("p", { className: "an-info", textContent: `In expressions and equations the inputs are named ${r.renames.map((c) => `${c.id} (${c.shown})`).join(", ")}.` }));
  for (const g of r.groups) {
    const cells = g.rows.length;
    const info = `${g.inputs.length} input${g.inputs.length === 1 ? "" : "s"}, ${g.outputs.length} output${g.outputs.length === 1 ? "" : "s"}, ${cells} rows` + (g.dontCares ? `, ${g.dontCares} don't-care cell${g.dontCares === 1 ? "" : "s"} (X or Z in the simulation, shown as X)` : "");
    out.append(el("p", { className: "an-info", textContent: info }), tableView(g));
  }
  if (r.groups.length) {
    out.append(exportView(r));
    for (const g of r.groups) g.forms.forEach((f, i) => out.append(formCard(f, g.functions[i], r)));
  }
  return out;
}

// ---- L5.3 to L5.5: forms, copy and export ----

function copyText(text, button) {
  const done = () => { const was = button.textContent; button.textContent = "Copied"; setTimeout(() => { button.textContent = was; }, 1200); };
  const fallback = () => { const t = el("textarea", { value: text }); document.body.append(t); t.select(); try { document.execCommand("copy"); done(); } catch { button.textContent = "Copy failed"; } t.remove(); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}
function download(name, text, type = "application/json") {
  const a = el("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const button = (label, onclick, title = "") => el("button", { type: "button", textContent: label, title, onclick: (e) => onclick(e.currentTarget) });

/** The assign for the form that costs least: the minimal SOP unless the minimal POS is cheaper. */
function verilogFor(r) {
  return r.groups.flatMap((g) => g.forms.map((f, i) => {
    if (f.error) return `// ${f.name}: ${f.error}`;
    const pos = f.best === "pos";
    return verilogAssign(f, (pos ? f.minimal.pos : f.minimal.sop)[0], g.functions[i], r, pos ? "pos" : "sop");
  })).join("\n") + "\n";
}

function exportView(r) {
  const box = el("section", { className: "an-export" }, el("h3", { textContent: "Copy and export" }));
  const bar = el("div", { className: "an-bar" });
  const all = (fn) => r.groups.map(fn).join("\n\n");
  bar.append(
    button("Copy Markdown", (b) => copyText(markdown(r), b), "The verdict, the table and every form"),
    button("Copy LaTeX table", (b) => copyText(all((g) => latexTable(g, r)), b), "A tabular with one column per bit"),
    button("Copy LaTeX equations", (b) => copyText(all((g) => latexEquations(g.forms)), b), "One aligned block for each output"),
    button("Copy LaTeX, all outputs in one block", (b) => copyText(all((g) => latexEquations(g.forms, { all: true })), b)),
    button("Copy CSV", (b) => copyText(all(csv), b)),
    button("Copy Verilog assign", (b) => copyText(verilogFor(r), b), "From the minimal form that costs least"),
    button("Download function files", () => r.groups.forEach((g) => g.functions.forEach((fn) => download(`${(fn.output ?? fn.id).replace(/[^A-Za-z0-9_-]/g, "_")}.function.json`, functionFile(fn)))), "One function/0.1 file per output bit, for the other logic tools"),
  );
  box.append(bar, el("p", { className: "an-hint", textContent: "Each form below can be opened in the K-map tool, the Boolean solver or the Figure Editor." }));
  return box;
}

const line = (label, latex, cost) => el("li", {}, el("span", { className: "an-label", textContent: label }), " ", el("span", { className: "an-math", textContent: `\\(${latex}\\)` }), cost ? el("span", { className: "an-cost", textContent: ` ${cost}` }) : "");
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

function formCard(f, fn, r) {
  const card = el("section", { className: "an-card" }, el("h3", { textContent: f.name }));
  if (f.error) { card.append(el("p", { className: "an-error", role: "alert", textContent: f.error })); return card; }
  if (f.problems.length) card.append(el("p", { className: "an-error", role: "alert", textContent: `A form did not match the table, so it is not shown as an answer: ${f.problems.join("; ")}` }));
  const cost = (x) => `(${plural(x.terms, "term")}, ${plural(x.literals, "literal")}, ${plural(x.gateInputs, "gate input")})`;
  const list = el("ul", { className: "an-forms" });
  list.append(line("Minterms", f.sigmaLatex), line("Maxterms", f.piLatex));
  list.append(line("Canonical SOP", f.canonical.sop.latex, `(${plural(f.canonical.sop.terms, "term")})`), line("Canonical POS", f.canonical.pos.latex, `(${plural(f.canonical.pos.terms, "term")})`));
  for (const [kind, covers] of [["SOP", f.minimal.sop], ["POS", f.minimal.pos]]) {
    covers.forEach((x, i) => list.append(line(covers.length > 1 ? `Minimal ${kind}, form ${i + 1} of ${covers.length}` : `Minimal ${kind}`, x.latex, cost(x))));
  }
  card.append(list);
  if (f.minimal.sop.length > 1 || f.minimal.pos.length > 1) card.append(el("p", { className: "an-note", textContent: "More than one form is equally small, so all are listed. None of them can be reduced further." }));
  card.append(el("p", { className: "an-best" }, el("strong", { textContent: "Cheapest: " }), bestText(f)));
  const bar = el("div", { className: "an-bar" });
  const pos = f.best === "pos";
  bar.append(
    button("Copy LaTeX", (b) => copyText(latexEquations([f]), b)),
    button("Copy Verilog assign", (b) => copyText(verilogAssign(f, (pos ? f.minimal.pos : f.minimal.sop)[0], fn, r, pos ? "pos" : "sop") + "\n", b)),
    button("Download function file", () => download(`${(fn.output ?? fn.id).replace(/[^A-Za-z0-9_-]/g, "_")}.function.json`, functionFile(fn))),
    button("Download circuit for the Figure Editor", () => {
      const c = circuitFile(fn, (pos ? f.minimal.pos : f.minimal.sop)[0]);
      if (c.text) download(`${(fn.output ?? fn.id).replace(/[^A-Za-z0-9_-]/g, "_")}_minimal.circuit.json`, c.text); else alert(`Could not build the circuit: ${c.error}`);
    }, "A starting layout; open it in the Figure Editor with its Open command"),
    button("Open in Figure Editor", () => {
      const c = circuitFile(fn, (pos ? f.minimal.pos : f.minimal.sop)[0]);
      if (!c.text) { alert(`Could not build the circuit: ${c.error}`); return; }
      const m = sendToFigureEditor(c.text);
      if (m) alert(m);
    }, "Opens the minimal form's circuit in a new tab. Keep this tab open until it has loaded."),
    el("a", { className: "an-link", href: solverHref((pos ? f.minimal.pos : f.minimal.sop)[0].text, { goal: pos ? "pos" : "sop" }), target: "_blank", rel: "noopener", textContent: "Open in Boolean solver", title: "The minimal form, worked step by step in a new tab" }),
    ...(kmapHref((pos ? f.minimal.pos : f.minimal.sop)[0].text, { name: f.name, kind: pos ? "pos" : "sop", variables: fn.variables }) ? [el("a", { className: "an-link", href: kmapHref((pos ? f.minimal.pos : f.minimal.sop)[0].text, { name: f.name, kind: pos ? "pos" : "sop", variables: fn.variables }), target: "_blank", rel: "noopener", textContent: "Open in K-map tool" })] : []),
  );
  card.append(bar);
  return card;
}

// ---- L5.6: check my answer ----

function checkView(c) {
  const out = el("div", { className: "an-check-out" });
  if (c.empty) return out;
  if (c.error) { out.append(el("p", { className: "an-error", role: "alert", textContent: c.error })); return out; }
  for (const x of c.results) {
    const name = x.output ?? "The output";
    if (x.problem) { out.append(el("p", { className: "an-error", role: "alert", textContent: `${name}: ${x.problem}` })); continue; }
    const box = el("div", { className: "an-verdict", role: "status" });
    box.dataset.tone = x.equal ? "yes" : "no";
    box.append(el("h4", {}, el("span", { className: "an-mark", textContent: x.equal ? "✓" : "✕" }), x.equal ? ` ${name} matches on every row (don't cares match anything).` : ` ${name} differs on ${plural(x.total, "row")}${x.total > x.rows.length ? `; the first ${x.rows.length} are listed` : ""}.`));
    if (!x.equal) {
      const t = el("table", { className: "an-table an-diff" });
      const vars = Object.keys(x.rows[0].values);
      t.append(el("thead", {}, el("tr", {}, ...vars.map((v) => el("th", { textContent: v })), el("th", { textContent: "Yours", className: "an-out" }), el("th", { textContent: "Expected", className: "an-out" }))));
      t.append(el("tbody", {}, ...x.rows.map((row) => el("tr", {}, ...vars.map((v) => el("td", { textContent: row.values[v] })), el("td", { textContent: row.yours, className: "an-out" }), el("td", { textContent: row.expected, className: "an-out" })))));
      box.append(el("div", { className: "an-table-wrap" }, t));
    }
    out.append(box);
  }
  return out;
}

export function mount(root, { examples = "model/examples/" } = {}) {
  const editor = el("textarea", { className: "an-editor", spellcheck: false, rows: 18, ariaLabel: "Circuit or expressions" });
  editor.setAttribute("autocapitalize", "off");
  const sample = el("select", { ariaLabel: "Sample" }, el("option", { value: "", textContent: "Choose a sample…" }));
  for (const name of [...Object.keys(EXPRESSION_SAMPLES), ...Object.keys(CIRCUIT_SAMPLES)]) sample.append(el("option", { value: name, textContent: name }));
  const file = el("input", { type: "file", accept: ".json,.txt,application/json,text/plain", multiple: true, hidden: true });
  const upload = el("button", { type: "button", textContent: "Open file…", title: "A circuit, expressions as text, or function files" });
  const clear = el("button", { type: "button", textContent: "Clear" });
  const status = el("span", { className: "an-status" });
  const results = el("div", { className: "an-results" });
  const side = el("div", { className: "an-side" },
    el("div", { className: "an-bar" }, sample, upload, clear, file),
    editor,
    el("p", { className: "an-hint", textContent: `Expressions: A' or ~A is NOT, AB or A*B is AND, + is OR, ^ is XOR. Circuits: the JSON the Schematic Editor saves. Up to ${CAP} inputs.` }),
    status);
  // L5.6: check my answer, under the editor.
  const expected = el("textarea", { className: "an-editor an-expected", spellcheck: false, rows: 4, ariaLabel: "Expected answer", placeholder: "Y = A'B + C\nor  Y(A,B,C) = 01101001" });
  const checkOut = el("div", { className: "an-check-out" });
  side.append(el("section", { className: "an-check" }, el("h3", { textContent: "Check my answer" }),
    el("p", { className: "an-hint", textContent: "Type what the circuit should do, as an expression or a compact table (first input is the most significant bit, X is a don't care). The first rows where it differs are listed." }),
    expected, checkOut));
  root.replaceChildren(el("div", { className: "an-layout" }, side, results));

  let timer = 0, last = null;
  const check = () => checkOut.replaceChildren(checkView(checkAnswer(last, expected.value)));
  let ctimer = 0;
  expected.addEventListener("input", () => { clearTimeout(ctimer); ctimer = setTimeout(check, 150); });
  const typeset = () => { loadMathJax().then((mj) => mj.typesetPromise([results])).catch(() => { /* the equations stay as TeX text */ }); };
  const run = () => {
    const r = analyseText(editor.value);
    last = r;
    results.replaceChildren(resultView(r));
    typeset();
    check();
    status.textContent = r.error ? "" : r.empty ? "" : `${r.mode === "circuit" ? "Circuit" : "Expressions"}${r.title ? `: ${r.title}` : ""}`;
    root.dispatchEvent(new CustomEvent("analysed", { detail: r }));
  };
  const soon = () => { clearTimeout(timer); timer = setTimeout(run, 150); };
  editor.addEventListener("input", soon);
  sample.addEventListener("change", async () => {
    const name = sample.value;
    if (!name) return;
    if (name in EXPRESSION_SAMPLES) editor.value = EXPRESSION_SAMPLES[name];
    else {
      try { editor.value = await (await fetch(`${examples}${CIRCUIT_SAMPLES[name]}.json`)).text(); }
      catch { status.textContent = "Could not load the sample."; return; }
    }
    run();
  });
  upload.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const files = [...file.files]; file.value = "";
    if (!files.length) return;
    const texts = await Promise.all(files.map((f) => f.text()));
    // L1.4: function/0.1 files (from the truth table generator or the solver) become one `output = expression` line each.
    const lines = texts.map((t) => { try { const fn = JSON.parse(t); return fn?.schema === "function/0.1" ? `${fn.output ?? fn.id} = ${expressionOfFunction(fn) ?? "0"}` : null; } catch { return null; } });
    if (lines.every(Boolean)) editor.value = lines.join("\n") + "\n";
    else if (files.length === 1) editor.value = texts[0];
    else { status.textContent = "Open one circuit at a time, or several function files together."; return; }
    sample.value = ""; run();
  });
  clear.addEventListener("click", () => { editor.value = ""; sample.value = ""; run(); editor.focus(); });
  run();
  const params = new URLSearchParams(location.search);
  if (params.get("expected")) { expected.value = params.get("expected"); check(); }   // ?expected=... fills the answer box (for links and screenshots)
  const first = params.get("sample");   // ?sample=2 opens the second sample
  if (first && sample.options[+first]) { sample.selectedIndex = +first; sample.dispatchEvent(new Event("change")); }
  return { set: (text) => { editor.value = text; run(); }, run, editor };
}
