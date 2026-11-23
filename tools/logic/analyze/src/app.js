// L5.2: the analyser's page. A text editor (type or paste a circuit, or one `output = expression` per line), a verdict,
// and the truth table. All text from the person typing goes in with textContent, never as HTML.

import { analyseText, CAP } from "./analyze.js";

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
    row.outputs.forEach((o) => tr.append(el("td", { className: o === "-" ? "an-out an-dc" : "an-out", textContent: o === "-" ? "–" : o, title: o === "-" ? "X or Z on this row: a don't care" : "" })));
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
  for (const g of r.groups) {
    const cells = g.rows.length;
    const info = `${g.inputs.length} input${g.inputs.length === 1 ? "" : "s"}, ${g.outputs.length} output${g.outputs.length === 1 ? "" : "s"}, ${cells} rows` + (g.dontCares ? `, ${g.dontCares} don't-care cell${g.dontCares === 1 ? "" : "s"} (X or Z in the simulation, shown as –)` : "");
    out.append(el("p", { className: "an-info", textContent: info }), tableView(g));
  }
  return out;
}

export function mount(root, { examples = "model/examples/" } = {}) {
  const editor = el("textarea", { className: "an-editor", spellcheck: false, rows: 18, ariaLabel: "Circuit or expressions" });
  editor.setAttribute("autocapitalize", "off");
  const sample = el("select", { ariaLabel: "Sample" }, el("option", { value: "", textContent: "Choose a sample…" }));
  for (const name of [...Object.keys(EXPRESSION_SAMPLES), ...Object.keys(CIRCUIT_SAMPLES)]) sample.append(el("option", { value: name, textContent: name }));
  const file = el("input", { type: "file", accept: ".json,.txt,application/json,text/plain", hidden: true });
  const upload = el("button", { type: "button", textContent: "Open file…" });
  const clear = el("button", { type: "button", textContent: "Clear" });
  const status = el("span", { className: "an-status" });
  const results = el("div", { className: "an-results" });
  const side = el("div", { className: "an-side" },
    el("div", { className: "an-bar" }, sample, upload, clear, file),
    editor,
    el("p", { className: "an-hint", textContent: `Expressions: A' or ~A is NOT, AB or A*B is AND, + is OR, ^ is XOR. Circuits: the JSON the Schematic Editor saves. Up to ${CAP} inputs.` }),
    status);
  root.replaceChildren(el("div", { className: "an-layout" }, side, results));

  let timer = 0;
  const run = () => {
    const r = analyseText(editor.value);
    results.replaceChildren(resultView(r));
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
  file.addEventListener("change", async () => { const f = file.files[0]; if (f) { editor.value = await f.text(); sample.value = ""; run(); } file.value = ""; });
  clear.addEventListener("click", () => { editor.value = ""; sample.value = ""; run(); editor.focus(); });
  run();
  const first = new URLSearchParams(location.search).get("sample");   // ?sample=2 opens the second sample (for links and screenshots)
  if (first && sample.options[+first]) { sample.selectedIndex = +first; sample.dispatchEvent(new Event("change")); }
  return { set: (text) => { editor.value = text; run(); }, run, editor };
}
