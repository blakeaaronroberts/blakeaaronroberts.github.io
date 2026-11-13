// Block presets: only pre-filled params for the built-in block (circuit-schema C5). No DOM.
//
// A preset places an ordinary block; nothing about it is remembered once it is on the canvas, and every field
// can be changed afterwards. The pin names follow Harris and Harris, Digital Design and Computer Architecture,
// chapter 5. Pin labels are TeX in the same convention as every other label ("$C_{\\mathrm{in}}$"); a pin with no label
// shows nothing inside the box.

const pin = (name, label) => (label ? { name, label } : name);

const adderPins = {
  half: { left: [pin("A", "$A$"), pin("B", "$B$")], right: [pin("Cout", "$C_{\\mathrm{out}}$"), pin("S", "$S$")] },
  full: { left: [pin("A", "$A$"), pin("B", "$B$"), pin("Cin", "$C_{\\mathrm{in}}$")], right: [pin("Cout", "$C_{\\mathrm{out}}$"), pin("S", "$S$")] },
  wide: { left: [pin("A", "$A$"), pin("B", "$B$")], right: [pin("S", "$S$")], top: [pin("Cin", "$C_{\\mathrm{in}}$")], bottom: [pin("Cout", "$C_{\\mathrm{out}}$")] },
};

/** Each preset: {id, name, group, params}. `group` orders the palette. */
export const PRESETS = [
  { id: "half_adder", name: "Half adder", params: { shape: "rect", w: 5, h: 4, label: "HA", pins: adderPins.half } },
  { id: "half_adder_chevron", name: "Half adder (chevron)", params: { shape: "chevron", w: 5, h: 4, label: "HA", pins: adderPins.half } },
  { id: "full_adder", name: "Full adder", params: { shape: "rect", w: 5, h: 5, label: "FA", pins: adderPins.full } },
  { id: "full_adder_chevron", name: "Full adder (chevron)", params: { shape: "chevron", w: 5, h: 5, label: "FA", pins: adderPins.full } },
  { id: "cpa", name: "Carry-propagate adder", params: { shape: "rect", w: 5, h: 4, label: "$+$", pins: adderPins.wide } },
  { id: "cpa_chevron", name: "Carry-propagate adder (chevron)", params: { shape: "chevron", w: 5, h: 4, label: "$+$", pins: adderPins.wide } },
  { id: "cla", name: "N-bit CLA", params: { shape: "rect", w: 5, h: 4, label: "CLA", pins: adderPins.wide } },
  { id: "cla_chevron", name: "N-bit CLA (chevron)", params: { shape: "chevron", w: 5, h: 4, label: "CLA", pins: adderPins.wide } },
  { id: "subtractor", name: "Subtractor", params: { shape: "rect", w: 5, h: 4, label: "$-$", pins: { left: [pin("A", "$A$"), pin("B", "$B$")], right: [pin("Y", "$Y$")] } } },
  { id: "subtractor_chevron", name: "Subtractor (chevron)", params: { shape: "chevron", w: 5, h: 4, label: "$-$", pins: { left: [pin("A", "$A$"), pin("B", "$B$")], right: [pin("Y", "$Y$")] } } },
  { id: "comparator", name: "Comparator", params: { shape: "rect", w: 5, h: 4, label: "$=$", pins: { left: [pin("A", "$A$"), pin("B", "$B$")], right: [pin("Y", "$Y$")] } } },
  { id: "shifter", name: "Shifter", params: { shape: "rect", w: 5, h: 4, label: "$\\ll$", pins: { left: [pin("A", "$A$")], bottom: [pin("shamt", "$\\mathrm{shamt}$")], right: [pin("Y", "$Y$")] } } },
  { id: "rotator", name: "Rotator", params: { shape: "rect", w: 5, h: 4, label: "ROT", pins: { left: [pin("A", "$A$")], bottom: [pin("shamt", "$\\mathrm{shamt}$")], right: [pin("Y", "$Y$")] } } },
  { id: "multiplier", name: "Multiplier", params: { shape: "rect", w: 5, h: 4, label: "$\\times$", pins: { left: [pin("A", "$A$"), pin("B", "$B$")], right: [pin("P", "$P$")] } } },
  { id: "alu", name: "ALU", params: { shape: "chevron", w: 6, h: 5, label: "ALU", pins: { left: [pin("A", "$A$"), pin("B", "$B$")], bottom: [pin("F", "$F$")], right: [pin("Y", "$Y$")] } } },
  { id: "register_file", name: "Register file", params: { shape: "rect", w: 8, h: 6, label: "Register file", pins: {
    left: [pin("A1", "$A_1$"), pin("A2", "$A_2$"), pin("A3", "$A_3$"), pin("WD3", "$\\mathrm{WD}_3$")], right: [pin("RD1", "$\\mathrm{RD}_1$"), pin("RD2", "$\\mathrm{RD}_2$")],
    top: [pin("CLK", "$\\mathrm{CLK}$")], bottom: [pin("WE3", "$\\mathrm{WE}_3$")] } } },
  { id: "shift_register", name: "Shift register", params: { shape: "rect", w: 8, h: 3, label: "Shift register", pins: { left: [pin("Sin", "$S_{\\mathrm{in}}$")], right: [pin("Sout", "$S_{\\mathrm{out}}$")], top: [pin("CLK", "$\\mathrm{CLK}$")] } } },
  { id: "gain", name: "Gain", params: { shape: "triangle", w: 4, h: 4, label: "$K$", pins: { left: [pin("In")], right: [pin("Out")] } } },
  { id: "summing_junction", name: "Summing junction", params: { shape: "circle", w: 3, h: 3, pins: { left: [pin("P", "$+$")], bottom: [pin("M", "$-$")], right: [pin("Y")] } } },
  { id: "integrator", name: "Integrator", params: { shape: "rect", w: 4, h: 3, label: "$\\int$", pins: { left: [pin("In")], right: [pin("Out")] } } },
  { id: "generic", name: "Generic block", params: { shape: "rect", w: 4, h: 4, pins: { left: [pin("A")], right: [pin("Y")] } } },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id) ?? null;
