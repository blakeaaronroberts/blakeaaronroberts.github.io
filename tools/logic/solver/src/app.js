// L1.3: Boolean solver page. Every line shown has been checked against the truth table in solver.js before it gets here.
// "Your turn": the student picks the law for the next line; lines appear as they are got right (or hinted, or shown).

import { solve, prove, checkChoice, GOALS, LAWS, outputNameOf } from "./solver.js";
import { el, button, copyText, download, fileName, plural, typeset } from "../../common/src/ui.js";
import { expressionOfFunction, circuitFor, sendToFigureEditor } from "../../common/src/handoff.js";
import { fromExpression, checkFunction, RULES } from "../../analyze/model/logic/index.mjs";

const SAMPLES = {
  "Distributive: (A + B)(A + C)": { goal: "sop", a: "(A + B)(A + C)" },
  "Absorption and consensus: AB + A'C + BC": { goal: "sop", a: "AB + A'C + BC" },
  "Product of sums: AB + A'C": { goal: "pos", a: "AB + A'C" },
  "NAND-only: AB + C'": { goal: "nand", a: "AB + C'" },
  "NOR-only: (A + B)C'": { goal: "nor", a: "(A + B)C'" },
  "Prove De Morgan: (AB)' = A' + B'": { goal: "prove", a: "(AB)'", b: "A' + B'" },
  "Prove (and fail): A + B = AB": { goal: "prove", a: "A + B", b: "AB" },
};

export function mount(root, { schemaUrl = "../analyze/model/schema/function.schema.json" } = {}) {
  let schema = null, current = null;
  const schemaReady = fetch(schemaUrl).then((r) => r.json()).then((s) => { schema = s; }).catch(() => {});

  const sample = el("select", { ariaLabel: "Sample" }, el("option", { value: "", textContent: "Choose a sample…" }));
  for (const name of Object.keys(SAMPLES)) sample.append(el("option", { value: name, textContent: name }));
  const file = el("input", { type: "file", accept: ".json,application/json", hidden: true });
  const upload = button("Open function file…", () => file.click(), "Read a function/0.1 file: its expression, or its smallest sum of products");
  const first = el("textarea", { className: "an-editor", spellcheck: false, rows: 3, ariaLabel: "Expression" });
  const second = el("textarea", { className: "an-editor", spellcheck: false, rows: 3, ariaLabel: "Second expression" });
  for (const t of [first, second]) t.setAttribute("autocapitalize", "off");
  const goal = el("select", { ariaLabel: "Goal" });
  for (const [k, label] of Object.entries(GOALS)) goal.append(el("option", { value: k, textContent: label }));
  goal.append(el("option", { value: "prove", textContent: "Prove two expressions equal" }));
  const turn = el("input", { type: "checkbox", ariaLabel: "Your turn" });
  const secondBox = el("div", {}, el("p", { className: "an-hint", textContent: "Second expression:" }), second);
  const status = el("p", { className: "an-status", role: "status" });
  const side = el("div", { className: "an-side" },
    el("div", { className: "an-bar" }, sample, upload, file),
    el("label", { className: "sv-goal" }, "Goal", goal),
    el("p", { className: "an-hint", textContent: "Type one expression. A' or ~A is NOT, AB or A*B is AND, + is OR, ^ is XOR. A leading  F =  is ignored." }),
    first, secondBox,
    el("label", { className: "sv-goal" }, turn, " Your turn: I choose the law for each line"),
    status);
  const results = el("div", { className: "an-results" });
  root.replaceChildren(el("div", { className: "an-layout" }, side, results));

  const say = (m, bad = false) => { status.textContent = m; status.className = bad ? "an-error" : "an-status"; };
  const isProve = () => goal.value === "prove";

  // ---- one line of a working ----
  function partView(l) {
    const p = l.part;
    if (!p) return null;
    const box = el("span", { className: "sv-part" });
    if (l.reversed) box.append("Read backwards. ");
    if (p.whole) { box.append("Applied to the whole line."); return box; }
    box.append(p.after === null ? "Removed " : "Applied to ", el("span", { className: "sv-inline", textContent: `\\(${p.beforeLatex}\\)` }));
    if (p.after !== null) box.append(" giving ", el("span", { className: "sv-inline", textContent: `\\(${p.afterLatex}\\)` }));
    return box;
  }
  function lineView(l, i, last) {
    const li = el("li", { className: last ? "sv-final" : "" });
    li.append(el("span", { className: "sv-math", textContent: `\\(${l.latex}\\)` }));
    const why = el("span", { className: "sv-why" });
    if (l.rule === "given") why.append(el("span", { className: "sv-rule", textContent: "given" }));
    else {
      why.append(el("span", { className: "sv-rule", textContent: l.rule }));
      if (l.law) why.append(el("span", { className: "sv-law", textContent: l.law }));
      const part = partView(l);
      if (part) why.append(part);
    }
    li.append(why);
    return li;
  }
  const stepsList = (lines, upto = lines.length) => el("ol", { className: "sv-steps" }, ...lines.slice(0, upto).map((l, i) => lineView(l, i, i === lines.length - 1 && upto === lines.length && i > 0)));

  // ---- text for copying ----
  const plain = (lines) => lines.map((l, i) => `${String(i + 1).padStart(2)}. ${l.expression}    [${l.rule}${l.law ? `: ${l.law}` : ""}]`).join("\n") + "\n";
  const tex = (lines) => ["\\begin{aligned}", lines.map((l) => `${l.latex} &\\quad \\text{${l.rule}}`.replace(/_/g, "\\_")).join(" \\\\\n"), "\\end{aligned}"].join("\n");

  // ---- one expression, one goal ----
  function showSolution(r, text) {
    const out = [];
    if (r.minimal === false) out.push(el("p", { className: "an-note", textContent: "This form is correct but the tool could not confirm it is the smallest." }));
    out.push(el("p", { className: "sv-checked", textContent: `Every line equals the original expression on all ${plural(r.rows, "row")} of its truth table (checked in code before it is shown).` }));
    if (r.note) out.push(el("p", { className: "an-note", textContent: r.note }));
    return out;
  }

  function actions(r, text) {
    const bar = el("div", { className: "an-bar" });
    const name = outputNameOf(text);
    const fn = () => fromExpression(r.final, { id: name, output: name, variables: r.variables });
    bar.append(
      button("Copy steps", (b) => copyText(plain(r.lines), b)),
      button("Copy LaTeX", (b) => copyText(tex(r.lines) + "\n", b), "An aligned block, one line per step, with the law named"),
      button("Download function file", () => {
        try { const f = fn(); if (schema) { const p = checkFunction(schema, f); if (p.length) throw new Error(p[0]); } download(`${fileName(name)}.function.json`, JSON.stringify(f, null, 2) + "\n"); }
        catch (e) { say(`Could not make the function file: ${e.message}`, true); }
      }, "The result as a function/0.1 file, for the truth table generator and the other logic tools"),
      button("Open in Figure Editor", () => {
        const c = circuitFor(r.final, { id: `${name}_solved`, output: name, variables: r.variables, title: `${name} (${GOALS[r.goal] ?? r.goal})` });
        if (c.error) { say(`Could not build the circuit: ${c.error}`, true); return; }
        const m = sendToFigureEditor(c.text);
        say(m ?? "Opened the Figure Editor in a new tab. Keep this tab open until the circuit has loaded.", !!m);
      }, "Opens the circuit for the result in a new tab (a starting layout)"),
    );
    return bar;
  }

  // ---- your turn ----
  function turnView(r) {
    const wrap = el("div", { className: "sv-turn-wrap" });
    let shown = 1;
    const list = el("div"), controls = el("div", { className: "sv-turn" });
    const msg = el("p", { className: "sv-msg", role: "status" });
    const pick = el("select", { ariaLabel: "Law for the next line" });
    for (const k of LAWS) pick.append(el("option", { value: k, textContent: k, title: RULES[k] }));
    const check = button("Check", () => {
      const r2 = checkChoice(r.lines, shown, pick.value);
      if (r2.correct) { msg.textContent = `Yes: ${pick.value}.`; reveal(); }
      else msg.textContent = "That is not the law used for the next line in this working. Another law might also apply to the line, so try again, or press Hint.";
    });
    const hint = button("Hint", () => { msg.textContent = `The next line uses ${r.lines[shown].rule}${r.lines[shown].law ? `: ${r.lines[shown].law}` : ""}.`; });
    const showNext = button("Show the next line", () => reveal());
    const reveal = () => { shown++; draw(); typeset(list); };
    const draw = () => {
      list.replaceChildren(stepsList(r.lines, shown));
      if (shown >= r.lines.length) { controls.replaceChildren(el("p", { className: "sv-msg", textContent: "That is the last line." })); wrap.append(...showSolution(r), actions(r, first.value)); return; }
      controls.replaceChildren(el("p", { className: "sv-msg", textContent: `Which law turns line ${shown} into line ${shown + 1}?` }), el("div", { className: "an-bar" }, pick, check, hint, showNext), msg);
    };
    wrap.append(list, controls);
    draw();
    return wrap;
  }

  function counterexample(r) {
    const box = el("section", { className: "an-verdict", role: "status" });
    box.dataset.tone = "no";
    box.append(el("h2", {}, el("span", { className: "an-mark", textContent: "✕" }), ` Not equal: they differ on ${plural(r.total, "row")} of ${r.rows}`));
    const t = el("table", { className: "an-table an-diff" });
    t.append(el("thead", {}, el("tr", {}, ...r.variables.map((v) => el("th", { textContent: v })), el("th", { textContent: "First", className: "an-out" }), el("th", { textContent: "Second", className: "an-out" }))));
    t.append(el("tbody", {}, ...r.differing.map((d) => el("tr", {}, ...r.variables.map((v) => el("td", { textContent: d.values[v] })), el("td", { textContent: d.a, className: "an-out" }), el("td", { textContent: d.b, className: "an-out" })))));
    box.append(el("p", { textContent: `A counterexample: ${r.variables.map((v) => `${v} = ${r.differing[0].values[v]}`).join(", ")} gives ${r.differing[0].a} for the first and ${r.differing[0].b} for the second.` }), el("div", { className: "an-table-wrap" }, t));
    if (r.total > r.differing.length) box.append(el("p", { className: "an-note", textContent: `The first ${r.differing.length} are listed.` }));
    return box;
  }

  function draw() {
    secondBox.hidden = !isProve();
    results.replaceChildren();
    const text = first.value;
    if (!text.trim() || (isProve() && !second.value.trim())) { results.append(el("p", { className: "an-note", textContent: isProve() ? "Type two expressions, or choose a sample." : "Type an expression, or choose a sample." })); current = null; return; }
    if (isProve()) {
      const r = prove(text, second.value);
      current = r;
      if (r.error) { results.append(el("p", { className: "an-error", role: "alert", textContent: r.error })); return; }
      if (!r.equal) { results.append(counterexample(r)); return; }
      const head = el("section", { className: "an-verdict", role: "status" });
      head.dataset.tone = "yes";
      head.append(el("h2", {}, el("span", { className: "an-mark", textContent: "✓" }), " Equal"));
      results.append(head);
      if (r.lines) {
        const wantLines = r.lines;
        const sol = { lines: wantLines, final: wantLines.at(-1).expression, variables: r.variables, goal: "prove", rows: r.rows };
        results.append(turn.checked ? turnView(sol) : stepsList(wantLines), ...(turn.checked ? [] : [el("p", { className: "sv-checked", textContent: `Every line equals both expressions on all ${plural(r.rows, "row")} of the truth table (checked in code before it is shown).` })]));
        if (!turn.checked) results.append(el("div", { className: "an-bar" }, button("Copy steps", (b) => copyText(plain(wantLines), b)), button("Copy LaTeX", (b) => copyText(tex(wantLines) + "\n", b))));
        results.append(el("p", { className: "an-note", textContent: "The chain reduces the first expression to its minimal sum of products, then follows the second expression's reduction backwards. Laws are equalities, so each reversed line uses the same law." }));
      } else {
        results.append(el("p", { className: "an-note", textContent: r.note }));
        r.reductions.forEach((lines, i) => results.append(el("h3", { textContent: i ? "Second expression" : "First expression" }), stepsList(lines)));
        results.append(el("p", { className: "sv-checked", textContent: `Every line equals its own expression on all ${plural(r.rows, "row")} of the truth table.` }));
      }
      typeset(results);
      return;
    }
    const r = solve(text, goal.value);
    current = r;
    if (r.error) { results.append(el("p", { className: "an-error", role: "alert", textContent: r.error })); return; }
    results.append(el("p", { className: "an-info", textContent: `${GOALS[r.goal]}: ${r.lines.length - 1} step${r.lines.length === 2 ? "" : "s"}. Inputs: ${r.variables.join(", ")}.` }));
    if (turn.checked) results.append(turnView(r));
    else results.append(stepsList(r.lines), ...showSolution(r, text), actions(r, text));
    typeset(results);
  }

  let timer = 0;
  const soon = () => { clearTimeout(timer); timer = setTimeout(draw, 200); };
  first.addEventListener("input", soon); second.addEventListener("input", soon);
  goal.addEventListener("change", draw); turn.addEventListener("change", draw);
  sample.addEventListener("change", () => {
    const s = SAMPLES[sample.value]; if (!s) return;
    goal.value = s.goal; first.value = s.a; second.value = s.b ?? ""; sample.value = ""; draw();
  });
  file.addEventListener("change", async () => {
    const f = file.files[0]; file.value = "";
    if (!f) return;
    await schemaReady;
    let fn;
    try { fn = JSON.parse(await f.text()); } catch (e) { say(`${f.name} is not valid JSON: ${e.message}`, true); return; }
    if (!schema) { say("The function schema did not load, so the file cannot be checked.", true); return; }
    const problems = checkFunction(schema, fn);
    if (problems.length) { say(`${f.name}: ${problems[0]}`, true); return; }
    const text = expressionOfFunction(fn);
    if (!text) { say(`${f.name} has no expression or sum of products to work on.`, true); return; }
    first.value = `${fn.output ?? fn.id} = ${text}`; goal.value = "sop"; say(`Opened ${f.name}${fn.table.includes("-") ? " (it has don't-care rows; the solver treats them as the rows the expression gives)" : ""}.`); draw();
  });

  // ?expr=... &goal=sop|pos|nand|nor|prove &expr2=... &turn=1 fill the page (for links from the other tools, and for screenshots).
  const p = new URLSearchParams(location.search);
  if (p.get("expr")) first.value = p.get("expr");
  if (p.get("expr2")) second.value = p.get("expr2");
  if (p.get("goal") && (p.get("goal") in GOALS || p.get("goal") === "prove")) goal.value = p.get("goal");
  if (p.get("turn")) turn.checked = true;
  draw();
  return { draw, first, second, goal, current: () => current };
}
