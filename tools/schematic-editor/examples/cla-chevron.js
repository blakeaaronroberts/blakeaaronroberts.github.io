// Sample figure: an N-bit carry-lookahead adder in chevron form, built through the editor's own edit functions.
// The two operands and the sum are buses (a slash and "N" on each), every signal has an arrowhead where it arrives,
// and the block is the "N-bit CLA (chevron)" preset with its pins as the preset gives them.

import { addElement, addPort, addWire, newDoc, setPort } from "../src/doc.js";
import { BLOCK } from "../src/block.js";
import { presetById } from "../src/presets.js";

export function buildClaChevron(pack) {
  let doc = newDoc("cla_chevron");
  doc.title = "N-bit carry-lookahead adder, chevron form (sample)";
  const wire = (from, to, extra = {}) => {
    const r = addWire(doc, pack, from, to);
    doc = r.doc;
    doc.wires = doc.wires.map((w) => (w.id === r.id ? { ...w, ...extra } : w));
    return r.id;
  };
  const port = (at, dir, label, side) => {
    const r = addPort(doc, pack, at, dir);
    doc = setPort(r.doc, pack, r.id, { label, side });
    return { kind: "port", id: r.id, at };
  };
  const pin = (ref) => ({ kind: "pin", ref });

  const cla = addElement(doc, pack, BLOCK, [0, 0], 0, structuredClone(presetById("cla_chevron").params));
  doc = cla.doc;
  const b = cla.id;
  // Operands in on the left, the sum out on the right.
  // first: "h" runs each operand across before it steps to its pin, so the bus marks sit on long runs well apart.
  wire(port([-24, 6], "in", "$A_{N-1:0}$", "left"), pin(`${b}.A`), { first: "h", arrow: "end", bus: "$N$" });
  wire(port([-24, -6], "in", "$B_{N-1:0}$", "left"), pin(`${b}.B`), { first: "h", arrow: "end", bus: "$N$" });
  wire(pin(`${b}.S`), port([22, 0], "out", "$S_{N-1:0}$", "right"), { arrow: "end", bus: "$N$" });
  // The carry in on top, the carry out below.
  wire(port([0, 14], "in", "$C_{\\mathrm{in}}$", "up"), pin(`${b}.Cin`), { arrow: "end" });
  wire(pin(`${b}.Cout`), port([0, -14], "out", "$C_{\\mathrm{out}}$", "down"), { arrow: "end" });
  return doc;
}
