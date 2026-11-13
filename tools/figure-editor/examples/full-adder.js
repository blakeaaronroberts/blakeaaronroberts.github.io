// The sample figure: a 1-bit full adder from gates, built through the editor's own
// edit functions (the same calls the canvas makes).
//
//   S    = A xor B xor Cin              (two XOR gates)
//   Cout = A.B + B.Cin + A.Cin          (three AND gates, two OR gates)
//
// The inputs run down three vertical buses. A and Cin enter their buses at a gate's
// input row, so four wires meet there (a junction dot). B enters between rows, and the
// gate taps on the B bus are T-junctions (no dot). The input lines cross the other
// buses without connecting.

import { addElement, addWire, newDoc } from "../src/doc.js";

export function buildFullAdder(pack) {
  let doc = newDoc("full_adder_gates");
  doc.title = "Full adder from gates (sample)";
  const put = (type, at) => { const r = addElement(doc, pack, type, at); doc = r.doc; return r.id; };
  const pin = (ref) => ({ kind: "pin", ref });
  const port = (id) => ({ kind: "port", id });
  const onWire = (id, at) => ({ kind: "wire", id, at });
  const wire = (from, to, via = []) => { const r = addWire(doc, pack, from, to, via); doc = r.doc; return r.id; };

  const xor1 = put("xor_gate", [0, 24]);
  const and1 = put("and_gate", [0, 12]);
  const and2 = put("and_gate", [0, 0]);
  const and3 = put("and_gate", [0, -12]);
  const xor2 = put("xor_gate", [20, 22]);
  const or1 = put("or_gate", [20, 6]);
  const or2 = put("or_gate", [36, -2]);

  doc.ports.push(
    { id: "A", dir: "in", at: [-40, 13] },
    { id: "B", dir: "in", at: [-40, 7] },
    { id: "Cin", dir: "in", at: [-40, -1] },
    { id: "S", dir: "out", at: [48, 22] },
    { id: "Cout", dir: "out", at: [48, -2] },
  );

  // Input buses: from the top gate's pin, down, into the bottom gate's pin.
  const busA = wire(pin(`${xor1}.A`), pin(`${and3}.A`), [[-30, 25], [-30, -11]]);
  const busB = wire(pin(`${xor1}.B`), pin(`${and2}.A`), [[-26, 23], [-26, 1]]);
  const busC = wire(pin(`${xor2}.B`), pin(`${and3}.B`), [[-22, 21], [-22, -13]]);

  // A and Cin: the input and the gate tap meet the bus at one point: four wires, a dot.
  wire(port("A"), onWire(busA, [-30, 13]));
  wire(onWire(busA, [-30, 13]), pin(`${and1}.A`));
  wire(port("Cin"), onWire(busC, [-22, -1]));
  wire(onWire(busC, [-22, -1]), pin(`${and2}.B`));

  // B: the input and the gate tap meet the bus at different points: two T-junctions.
  wire(port("B"), onWire(busB, [-26, 7]));
  wire(onWire(busB, [-26, 11]), pin(`${and1}.B`));

  // Sum and carry.
  wire(pin(`${xor1}.Y`), pin(`${xor2}.A`));
  wire(pin(`${xor2}.Y`), port("S"));
  wire(pin(`${and1}.Y`), pin(`${or1}.A`));
  wire(pin(`${and2}.Y`), pin(`${or1}.B`));
  wire(pin(`${or1}.Y`), pin(`${or2}.A`));
  wire(pin(`${and3}.Y`), pin(`${or2}.B`));
  wire(pin(`${or2}.Y`), port("Cout"));
  return doc;
}
