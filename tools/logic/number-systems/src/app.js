// L2.1: number systems converter page. Nothing is stored or sent anywhere. Text from the person typing goes in with textContent.
// Equations and symbols are TeX typeset by MathJax (the page loads it; see ../../common/src/ui.js).

import { convert, rangeFor, SYSTEMS, SYSTEM_NAMES, BASES, MAX_WIDTH } from "./numbers.js";
import { el, typeset } from "../../common/src/ui.js";

const SAMPLES = {
  "-3 as 4-bit two's complement": { text: "-3", base: 10, width: 4, system: "twos" },
  "-5 as 4-bit sign-magnitude": { text: "-5", base: 10, width: 4, system: "signmag" },
  "8 does not fit in 4-bit two's complement": { text: "8", base: 10, width: 4, system: "twos" },
  "Hex F0 as 8-bit two's complement": { text: "F0", base: 16, width: 8, system: "twos" },
};

const group4 = (bits) => bits.replace(/(?<=.)(?=(.{4})+$)/g, " ");
const tex = (s) => `\\(${s}\\)`;
const mono = (s) => el("code", { textContent: s });
const bitsWord = (n) => `${n} ${n === 1 ? "bit" : "bits"}`;

/** Range formula in TeX for `system`, with n filled in. */
const rangeTex = (system, n) => {
  const a = n - 1;
  if (system === "unsigned") return `0 \\text{ to } 2^{${n}}-1`;
  if (system === "twos") return `-2^{${a}} \\text{ to } 2^{${a}}-1`;
  return `-(2^{${a}}-1) \\text{ to } 2^{${a}}-1`;
};

/** The sum for a decoded pattern, as TeX. A negative weight goes in brackets so the signs stay readable. */
function sumTex(d, system) {
  const w = (x) => (x < 0n ? `(${x})` : String(x));
  if (system === "signmag") {
    const mags = d.terms.filter((t) => t.weight !== null).map((t) => `${w(t.weight)}\\cdot ${t.bit}`).join(" + ") || "0";
    return `${d.signBit ? "-" : "+"}\\left(${mags}\\right) = ${d.value}`;
  }
  return `${d.terms.map((t) => `${w(t.weight)}\\cdot ${t.bit}`).join(" + ")} = ${d.value}`;
}

function weightsTable(d) {
  const t = el("table", { className: "ns-weights" });
  const head = el("tr", {}, el("th", { scope: "row", textContent: "Bit position" }));
  const wrow = el("tr", {}, el("th", { scope: "row", textContent: "Weight" }));
  const brow = el("tr", {}, el("th", { scope: "row", textContent: "Bit" }));
  for (const x of d.terms) {
    head.append(el("td", { textContent: tex(`2^{${x.pos}}`) }));
    wrow.append(el("td", { textContent: x.weight === null ? "sign" : String(x.weight) }));
    brow.append(el("td", { className: "ns-bit", textContent: String(x.bit) }));
  }
  t.append(head, wrow, brow);
  return el("div", { className: "an-table-wrap" }, t);
}

function stepsList(steps) {
  const ol = el("ol", { className: "ns-steps" });
  for (const s of steps) ol.append(el("li", {}, el("span", { textContent: s.label }), ...(s.bits ? [" ", mono(group4(s.bits))] : [])));
  return ol;
}

const headRow = (names) => el("thead", {}, el("tr", {}, ...names.map((h) => el("th", { scope: "col", textContent: h }))));

function rangeTable(n, system) {
  const t = el("table", { className: "ns-table" }, headRow(["System", "Formula", `Range for ${bitsWord(n)}`]));
  const body = el("tbody");
  for (const s of SYSTEMS) {
    const r = rangeFor(n, s);
    body.append(el("tr", { className: s === system ? "ns-current" : "" },
      el("th", { scope: "row", textContent: SYSTEM_NAMES[s] }), el("td", { textContent: tex(rangeTex(s, n)) }), el("td", { textContent: `${r.min} to ${r.max}` })));
  }
  t.append(body);
  return el("div", { className: "an-table-wrap" }, t);
}

function allTable(all, system) {
  const t = el("table", { className: "ns-table" }, headRow(["System", "Bits", "Hex", "Value"]));
  const body = el("tbody");
  for (const a of all) {
    const value = a.overflow ? "does not fit" : `${a.value}${a.negativeZero ? " (negative zero)" : ""}`;
    body.append(el("tr", { className: a.system === system ? "ns-current" : "" },
      el("th", { scope: "row", textContent: SYSTEM_NAMES[a.system] }),
      el("td", {}, a.bits ? mono(group4(a.bits)) : "none"), el("td", {}, a.hex ? mono(a.hex) : "none"), el("td", { textContent: value })));
  }
  t.append(body);
  return el("div", { className: "an-table-wrap" }, t);
}

export function mount(root) {
  const text = el("input", { type: "text", className: "tt-field ns-text", ariaLabel: "Number", spellcheck: false, placeholder: "-3" });
  text.setAttribute("autocomplete", "off");
  const base = el("select", { ariaLabel: "Entered as" });
  for (const [b, name] of Object.entries(BASES)) base.append(el("option", { value: b, textContent: name }));
  const width = el("input", { type: "number", className: "tt-field ns-width", min: 1, max: MAX_WIDTH, step: 1, value: 4, ariaLabel: "Width in bits" });
  const system = el("select", { ariaLabel: "Representation" });
  for (const s of SYSTEMS) system.append(el("option", { value: s, textContent: SYSTEM_NAMES[s], selected: s === "twos" }));
  const sample = el("select", { ariaLabel: "Sample" }, el("option", { value: "", textContent: "Choose a sample…" }));
  for (const name of Object.keys(SAMPLES)) sample.append(el("option", { value: name, textContent: name }));

  const side = el("div", { className: "an-side" },
    el("div", { className: "an-bar" }, sample),
    el("label", { className: "tt-label" }, "Number ", text),
    el("label", { className: "tt-label" }, "Entered as ", base),
    el("label", { className: "tt-label" }, "Width in bits ", width),
    el("label", { className: "tt-label" }, "Representation ", system),
    el("p", { className: "an-hint", textContent: "Decimal entry is a value and may have a sign. Binary and hexadecimal entry is the bit pattern. Spaces, underscores and the prefixes 0b and 0x are accepted." }));
  const results = el("div", { className: "an-results", "aria-live": "polite" });
  root.replaceChildren(el("div", { className: "an-layout" }, side, results));

  const card = (title, ...kids) => el("section", { className: "an-card" }, el("h3", { textContent: title }), ...kids);
  const widthOk = (w) => Number.isInteger(w) && w >= 1 && w <= MAX_WIDTH;

  function draw() {
    const w = width.value === "" ? NaN : Number(width.value);
    const r = convert({ text: text.value, base: Number(base.value), width: w, system: system.value });
    results.replaceChildren();
    if (r.empty) {
      results.append(el("p", { className: "an-note", textContent: "Type a number, or choose a sample." }));
      if (widthOk(w)) results.append(card(`Ranges for ${bitsWord(w)}`, rangeTable(w, system.value)));
      typeset(results);
      return;
    }
    if (r.error) { results.append(el("p", { className: "an-error", role: "alert", textContent: r.error })); return; }
    if (r.overflow) {
      results.append(el("div", { className: "an-verdict", "data-tone": "no", role: "alert" }, el("h2", {}, el("span", { className: "an-mark", textContent: "!" }), "Overflow"), el("p", { textContent: r.message })));
      results.append(card(`Ranges for ${bitsWord(w)}`, rangeTable(w, system.value)));
      if (r.all) results.append(card("The same value in each system", allTable(r.all, system.value)));
      typeset(results);
      return;
    }
    const n = r.width;
    results.append(el("div", { className: "an-verdict", "data-tone": "yes" },
      el("h2", { textContent: `${SYSTEM_NAMES[r.system]}, ${bitsWord(n)}` }),
      el("dl", { className: "ns-result" },
        el("dt", { textContent: "Bits" }), el("dd", {}, mono(group4(r.bits))),
        el("dt", { textContent: "Hexadecimal" }), el("dd", {}, mono(r.hex)),
        el("dt", { textContent: "Value" }), el("dd", { textContent: `${r.value}${r.negativeZero ? " (negative zero)" : ""}` }),
        ...(r.system !== "unsigned" ? [el("dt", { textContent: "Read as unsigned" }), el("dd", { textContent: String(r.unsigned) })] : []))));
    if (r.negativeZero) results.append(el("p", { className: "an-note", textContent: `${SYSTEM_NAMES[r.system]} has two zeros: 0 and negative zero.` }));

    const d = r.decoded;
    const working = [];
    if (r.encoded && r.encoded.steps.length) working.push(el("h4", { textContent: `Encode ${r.value}` }), stepsList(r.encoded.steps));
    working.push(el("h4", { textContent: "Bit weights" }), weightsTable(d), el("p", { className: "ns-sum", textContent: tex(sumTex(d, r.system)) }));
    if (!r.encoded && d.steps.length) working.push(el("h4", { textContent: "Find the magnitude of a negative pattern" }), stepsList(d.steps));
    results.append(card("Working", ...working));
    results.append(card(`Ranges for ${bitsWord(n)}`, rangeTable(n, r.system)));
    results.append(card(base.value === "10" ? "The same value in each system" : "The same bits in each system", allTable(r.all, r.system)));
    typeset(results);
  }

  for (const c of [text, base, width, system]) c.addEventListener("input", draw);
  sample.addEventListener("change", () => {
    const s = SAMPLES[sample.value];
    if (!s) return;
    text.value = s.text; base.value = String(s.base); width.value = String(s.width); system.value = s.system;
    sample.value = ""; draw();
  });
  const q = new URLSearchParams(location.search);
  if (q.has("n")) text.value = q.get("n");
  if ([...Object.keys(BASES)].includes(q.get("base"))) base.value = q.get("base");
  if (q.has("w")) width.value = q.get("w");
  if (SYSTEMS.includes(q.get("sys"))) system.value = q.get("sys");
  draw();
  return { text, base, width, system, sample, draw };
}
