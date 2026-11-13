// Sample figure: a 4-bit ripple-carry adder in block form, built through the editor's own edit functions
// (the same calls the canvas makes), from the "Full adder" block with its pins on the sides a ripple chain wants:
// A and B on top, the sum below, the carry in on the right and the carry out on the left, so the carry runs
// from the least significant block (on the right) towards the most significant one (on the left).

import { addElement, addPort, addWire, newDoc, setLabel, setPort } from "../src/doc.js";
import { BLOCK } from "../src/block.js";

const FA = (i) => ({
  shape: "rect", w: 6, h: 4, label: `$\\mathrm{FA}_${i}$`,
  pins: {
    top: [{ name: "A", label: "$A$" }, { name: "B", label: "$B$" }],
    right: [{ name: "Cin", label: "$C_{\\mathrm{in}}$" }],
    left: [{ name: "Cout", label: "$C_{\\mathrm{out}}$" }],
    bottom: [{ name: "S", label: "$S$" }],
  },
});

export function buildRippleCarryBlocks(pack) {
  let doc = newDoc("ripple_carry_adder_4");
  doc.title = "4-bit ripple-carry adder in block form (sample)";
  const wire = (from, to, extra = {}) => {
    const r = addWire(doc, pack, from, to);
    doc = r.doc;
    doc.wires = doc.wires.map((w) => (w.id === r.id ? { ...w, ...extra } : w));
    return r.id;
  };
  const port = (at, dir, label, side) => {
    const r = addPort(doc, pack, at, dir);
    doc = setPort(r.doc, pack, r.id, { label, side });
    return r.id;
  };
  const pin = (ref) => ({ kind: "pin", ref });

  const x = { 3: -54, 2: -36, 1: -18, 0: 0 };        // 18 steps apart: 12 for a block (6 modules), 6 for the carry wire between
  const ids = {};
  for (const i of [3, 2, 1, 0]) {
    const r = addElement(doc, pack, BLOCK, [x[i], 0], 0, FA(i));
    doc = r.doc; ids[i] = r.id;
  }
  for (const i of [3, 2, 1, 0]) {
    const id = ids[i], cx = x[i];
    // A and B come down from ports above, S goes down to a port below; each port is on its pin's column.
    const a = port([cx - 1, 12], "in", `$A_${i}$`, "left");
    const b = port([cx + 1, 12], "in", `$B_${i}$`, "right");
    const s = port([cx, -12], "out", `$S_${i}$`, "down");
    wire({ kind: "port", id: a, at: [cx - 1, 12] }, pin(`${id}.A`), { arrow: "end" });
    wire({ kind: "port", id: b, at: [cx + 1, 12] }, pin(`${id}.B`), { arrow: "end" });
    wire(pin(`${id}.S`), { kind: "port", id: s, at: [cx, -12] }, { arrow: "end" });
  }
  // The carry chain, right to left: C0 enters block 0; each block's carry out feeds the next block's carry in.
  const cin = port([12, 0], "in", "$C_{\\mathrm{in}}$", "right");
  wire({ kind: "port", id: cin, at: [12, 0] }, pin(`${ids[0]}.Cin`), { arrow: "end" });
  for (const i of [0, 1, 2]) wire(pin(`${ids[i]}.Cout`), pin(`${ids[i + 1]}.Cin`), { arrow: "end" });
  const cout = port([-66, 0], "out", "$C_{\\mathrm{out}}$", "left");
  wire(pin(`${ids[3]}.Cout`), { kind: "port", id: cout, at: [-66, 0] }, { arrow: "end" });
  return doc;
}
