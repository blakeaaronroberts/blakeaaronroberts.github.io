// L1.2: K-map page. A map you can type into (expression) or click (cells step 0, 1, X), with the groups of the library's minimal
// covers drawn on it. Every cover shown has been checked against the table in kmap.js.

import { MAX_VARS, mapOf, coverCount } from "./kmap.js";
import { parseVariableList, fromExpressions, blank, nextCell, setCell, setVariables, toFunctions, fromFunctions, shownCell } from "../../truth-table/src/table.js";
import { el, button, copyText, download, fileName, plural, typeset } from "../../common/src/ui.js";
import { circuitFor, sendToFigureEditor, solverHref } from "../../common/src/handoff.js";

const SAMPLES = {
  "Majority of three": "M = AB + AC + BC",
  "Four corners wrap round: B'D'": "F = B'D' + AC",
  "Two equally small forms": "F = A'B' + BC' + AC",
  "Four variables: AB + CD": "F = AB + CD",
};
const CELL = 56, SVGNS = "http://www.w3.org/2000/svg";
const DASH = ["", "7 4", "2 4", "9 3 2 3", "4 3"];
const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) e.append(k);
  return e;
};
const text = (x, y, s, cls = "", anchor = "middle", size = 16) => { const t = svg("text", { x, y, "text-anchor": anchor, "font-size": size, class: cls }); t.textContent = s; return t; };

/** Draw the map. `onCell(row, col)` is called when a cell is pressed. */
function drawMap(m, onCell) {
  const left = 74, top = 64, W = left + m.cols * CELL + 12, H = top + m.rows * CELL + 12;
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, class: "km-svg", role: "group", "aria-label": `K-map of ${m.variables.join(", ")}` });
  const rv = m.rowVariables.join(""), cv = m.colVariables.join("");
  s.append(text(left - 8, top - 8, rv ? `${rv} \\ ${cv}` : cv, "km-muted", "end", 14));
  m.colCodes.forEach((code, c) => s.append(text(left + c * CELL + CELL / 2, top - 22, code, "km-muted", "middle", 14)));
  m.rowCodes.forEach((code, r) => s.append(text(left - 8, top + r * CELL + CELL / 2 + 5, code, "km-muted", "end", 14)));
  m.cells.forEach((row, r) => row.forEach((cell, c) => {
    const g = svg("g", { class: "km-cell", tabindex: 0, role: "button", "aria-label": `Row ${m.rowCodes[r]}, column ${m.colCodes[c]}, minterm ${cell.minterm}: ${cell.value === "-" ? "don't care" : cell.value}. Press to change.` });
    g.append(svg("rect", { x: left + c * CELL, y: top + r * CELL, width: CELL, height: CELL }));
    g.append(text(left + c * CELL + CELL - 5, top + r * CELL + 13, String(cell.minterm), "km-muted", "end", 10));
    g.append(text(left + c * CELL + CELL / 2, top + r * CELL + CELL / 2 + 7, shownCell(cell.value), cell.value === "-" ? "km-x km-muted" : "", "middle", 22));
    g.addEventListener("click", () => onCell(r, c));
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCell(r, c); } });
    s.append(g);
  }));
  // The groups: one colour and dash each, nested outlines inset a little more each time. A side that runs off the map's edge (a group that
  // wraps round) is left open, so the pieces read as one group.
  for (const grp of m.groups) {
    const cls = `km-g${(grp.number - 1) % 5}`, dash = DASH[(grp.number - 1) % 5];
    const inset = 4 + 3 * ((grp.number - 1) % 4);
    const lines = svg("g", { class: `km-line ${cls}`, "stroke-dasharray": dash, "aria-hidden": "true" });
    grp.rects.forEach((r, i) => {
      const x1 = left + r.col * CELL + inset, y1 = top + r.row * CELL + inset, x2 = left + (r.col + r.cols) * CELL - inset, y2 = top + (r.row + r.rows) * CELL - inset;
      const seg = (a, b, c2, d) => lines.append(svg("line", { x1: a, y1: b, x2: c2, y2: d }));
      if (!r.open.top) seg(x1, y1, x2, y1);
      if (!r.open.bottom) seg(x1, y2, x2, y2);
      if (!r.open.left) seg(x1, y1, x1, y2);
      if (!r.open.right) seg(x2, y1, x2, y2);
      if (i === 0) s.append(text(x1 + 3, y2 - 5, String(grp.number), `km-badge ${cls}`, "start", 11));
    });
    s.append(lines);
  }
  return s;
}

function legendSwatch(n) {
  const s = svg("svg", { viewBox: "0 0 42 14", "aria-hidden": "true" });
  s.append(svg("line", { x1: 2, y1: 7, x2: 40, y2: 7, class: `km-line km-g${(n - 1) % 5}`, "stroke-dasharray": DASH[(n - 1) % 5] }));
  return s;
}

export function mount(root, { schemaUrl = "../analyze/model/schema/function.schema.json" } = {}) {
  let state = blank(["A", "B", "C"], ["F"]), out = 0, kind = "sop", cover = 0, schema = null, fromHand = false;
  const schemaReady = fetch(schemaUrl).then((r) => r.json()).then((x) => { schema = x; }).catch(() => {});

  const sample = el("select", { ariaLabel: "Sample" }, el("option", { value: "", textContent: "Choose a sample…" }));
  for (const name of Object.keys(SAMPLES)) sample.append(el("option", { value: name, textContent: name }));
  const file = el("input", { type: "file", accept: ".json,application/json", multiple: true, hidden: true });
  const upload = button("Open function file(s)…", () => file.click(), "Read function/0.1 files (up to 4 inputs)");
  const editor = el("textarea", { className: "an-editor", spellcheck: false, rows: 3, ariaLabel: "Expressions", placeholder: "F = AB + A'C" });
  editor.setAttribute("autocapitalize", "off");
  const inputs = el("input", { type: "text", className: "km-field", ariaLabel: "Inputs, most significant first (optional)", placeholder: "A B C" });
  const outSel = el("select", { ariaLabel: "Output" });
  const kindSel = el("select", { ariaLabel: "What to group" }, el("option", { value: "sop", textContent: "Group the 1s (sum of products)" }), el("option", { value: "pos", textContent: "Group the 0s (product of sums)" }));
  const coverSel = el("select", { ariaLabel: "Equally small form" });
  const coverBox = el("label", { className: "km-ctl" }, "Form", coverSel);
  const outBox = el("label", { className: "km-ctl" }, "Output", outSel);
  const status = el("p", { className: "an-status", role: "status" });
  const side = el("div", { className: "an-side" },
    el("div", { className: "an-bar" }, sample, upload, file, button("Clear the map", () => { state = blank(state.variables, state.outputs.map((o) => o.name)); fromHand = true; draw(); })),
    el("p", { className: "an-hint", textContent: `Type expressions (one  name = expression  per line), or press cells on the map to step them through 0, 1 and X (don't care). Up to ${MAX_VARS} inputs.` }),
    editor,
    el("label", { className: "km-ctl" }, "Inputs (optional; blank reads them from the expression), most significant first ", inputs),
    outBox,
    el("label", { className: "km-ctl" }, "Group", kindSel), coverBox, status);
  const results = el("div", { className: "an-results" });
  root.replaceChildren(el("div", { className: "an-layout" }, side, results));
  const say = (m, bad = false) => { status.textContent = m; status.className = bad ? "an-error" : "an-status"; };

  function draw() {
    outSel.replaceChildren(...state.outputs.map((o, i) => el("option", { value: i, textContent: o.name })));
    out = Math.min(out, state.outputs.length - 1); outSel.value = out; outBox.hidden = state.outputs.length < 2;
    const n = state.variables.length <= MAX_VARS ? coverCount(state, out, kind) : 1;
    cover = Math.min(cover, n - 1);
    coverSel.replaceChildren(...[...Array(n)].map((_, i) => el("option", { value: i, textContent: `${i + 1} of ${n}` })));
    coverSel.value = cover; coverBox.hidden = n < 2;
    kindSel.value = kind; inputs.placeholder = state.variables.join(" ");
    results.replaceChildren();
    const m = mapOf(state, out, kind, cover);
    if (m.error) { results.append(el("p", { className: "an-error", role: "alert", textContent: m.error })); return; }
    results.append(drawMap(m, (r, c) => {
      const minterm = m.cells[r][c].minterm;
      state = setCell(state, out, minterm, nextCell(state.outputs[out].table[minterm]));
      fromHand = true; draw();
      document.querySelectorAll(".km-cell")[r * m.cols + c]?.focus();
    }));
    const name = state.outputs[out].name;
    const want = kind === "sop" ? "1" : "0";
    results.append(el("p", { className: "an-info", textContent: `${plural(m.groups.length, "group")}, ${plural(m.groups.reduce((k, g) => k + g.cube.replace(/-/g, "").length, 0), "literal")} in the ${kind === "sop" ? "sum of products" : "product of sums"}.` + (m.dontCaresUsed.length ? ` X cells used as ${want}: ${m.dontCaresUsed.map((r) => `m${r}`).join(", ")}.` : "") }));
    const list = el("ul", { className: "km-legend" });
    for (const g of m.groups) {
      list.append(el("li", {}, legendSwatch(g.number), el("span", { textContent: `\\(${g.termLatex}\\)` }), el("span", { className: "km-cells", textContent: `group ${g.number}: ${plural(g.size, "cell")} (${g.minterms.map((r) => `m${r}`).join(", ")})${g.wraps ? ", wraps round the edge" : ""}${g.dontCaresUsed.length ? `, uses X at ${g.dontCaresUsed.map((r) => `m${r}`).join(", ")}` : ""}` })));
    }
    if (!m.groups.length) list.append(el("li", {}, el("span"), el("span", { textContent: kind === "sop" ? "No 1s: the function is 0." : "No 0s: the function is 1." })));
    results.append(list);
    results.append(el("div", { className: "km-eq", textContent: `\\[${name === "F" || /^[A-Za-z]$/.test(name) ? name : `\\mathrm{${name}}`} = ${m.expressionLatex}\\]` }));
    if (m.covers > 1) results.append(el("p", { className: "an-note", textContent: `${plural(m.covers, "form")} are equally small; choose between them under Form. None can be reduced further.` }));
    results.append(exportBar(m, name));
    typeset(results);
  }

  function exportBar(m, name) {
    const box = el("section", { className: "an-export" }, el("h3", { textContent: "Copy and send" }));
    const bar = el("div", { className: "an-bar" });
    const text = `${name} = ${m.expression}`;
    bar.append(
      button("Copy expression", (b) => copyText(text, b)),
      button("Copy LaTeX", (b) => copyText(`${name} = ${m.expressionLatex}\n`, b)),
      button("Download function file", () => {
        try { const fn = toFunctions(state, schema)[out]; download(`${fileName(name)}.function.json`, JSON.stringify(fn, null, 2) + "\n"); }
        catch (e) { say(`Could not make the function file: ${e.message}`, true); }
      }, "A function/0.1 file for the other logic tools"),
      button("Open in Figure Editor", () => {
        const c = circuitFor(m.expression, { id: `${name}_kmap`, output: name, variables: m.variables, title: name });
        if (c.error) { say(`Could not build the circuit: ${c.error}`, true); return; }
        const msg = sendToFigureEditor(c.text);
        say(msg ?? "Opened the Figure Editor in a new tab. Keep this tab open until the circuit has loaded.", !!msg);
      }, "Opens a circuit for the form shown, in a new tab"),
      el("a", { className: "an-link", href: solverHref(m.expression, { goal: kind }), target: "_blank", rel: "noopener", textContent: "Open in Boolean solver" }),
    );
    box.append(bar);
    return box;
  }

  // ---- events ----
  let timer = 0;
  const fromExpr = () => {
    const v = inputs.value.trim() ? parseVariableList(inputs.value) : {};
    if (v.error) { say(v.error, true); return; }
    const r = fromExpressions(editor.value, { variables: v.variables });
    if (r.empty) { say(""); return; }
    if (r.error) { say(r.error, true); return; }
    state = r.state; fromHand = false; out = 0; cover = 0; say(""); draw();
  };
  editor.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(fromExpr, 200); });
  inputs.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!inputs.value.trim()) { if (editor.value.trim() && !fromHand) fromExpr(); return; }
      const v = parseVariableList(inputs.value);
      if (v.error) { say(v.error, true); return; }
      if (editor.value.trim() && !fromHand) { fromExpr(); return; }
      state = setVariables(state, v.variables); cover = 0; say(v.variables.length > MAX_VARS ? "" : ""); draw();
    }, 250);
  });
  outSel.addEventListener("change", () => { out = +outSel.value; cover = 0; draw(); });
  kindSel.addEventListener("change", () => { kind = kindSel.value; cover = 0; draw(); });
  coverSel.addEventListener("change", () => { cover = +coverSel.value; draw(); });
  sample.addEventListener("change", () => { if (SAMPLES[sample.value]) { editor.value = SAMPLES[sample.value]; sample.value = ""; inputs.value = ""; fromExpr(); } });
  file.addEventListener("change", async () => {
    await schemaReady;
    const list = [];
    for (const f of file.files) { try { list.push(JSON.parse(await f.text())); } catch (e) { say(`${f.name} is not valid JSON: ${e.message}`, true); file.value = ""; return; } }
    file.value = "";
    if (!schema) { say("The function schema did not load, so the file cannot be checked.", true); return; }
    const r = fromFunctions(list, schema);
    if (r.error) { say(r.error, true); return; }
    state = r.state; fromHand = true; out = 0; cover = 0; inputs.value = "";
    say(state.variables.length > MAX_VARS ? `Opened, but it has ${state.variables.length} inputs and the map takes up to ${MAX_VARS}.` : `Opened ${plural(list.length, "function file")}.`); draw();
  });

  const p = new URLSearchParams(location.search);
  if (p.get("kind") === "pos") kind = "pos";
  if (p.get("expr")) { editor.value = p.get("expr"); fromExpr(); }
  else draw();
  return { draw, state: () => state };
}
