// The Elements pane's sections (F16). One data file: a new element needs no code, only a line here.
// An element type that no section lists falls into "Other", so nothing is ever hidden.
// `presets: true` marks the section that holds the block presets.

export const CATEGORIES = [
  { id: "logic", title: "Logic gates", types: ["and_gate", "or_gate", "not_gate", "nand_gate", "nor_gate", "xor_gate"], open: true },
  { id: "sequential", title: "Sequential", types: ["d_flipflop", "d_latch"], open: true },
  { id: "arithmetic", title: "Arithmetic and selection", types: ["full_adder", "mux2", "decoder2to4"] },
  { id: "passive", title: "Passive and semiconductor", types: ["resistor", "capacitor", "inductor", "diode", "switch", "npn_bjt", "nmos"] },
  { id: "sources", title: "Sources and ground", types: ["voltage_source", "ground", "vdd"] },
  { id: "blocks", title: "Blocks", presets: true },
];

/**
 * The sections to show: [{ id, title, types, presets, open }], empty sections dropped, with the
 * unlisted types gathered under "Other". `available` is the pack's type list (drafts included or not).
 */
export function sections(available, categories = CATEGORIES) {
  const have = new Set(available), listed = new Set(categories.flatMap((c) => c.types ?? []));
  const out = categories.map((c) => ({ id: c.id, title: c.title, types: (c.types ?? []).filter((t) => have.has(t)), presets: !!c.presets, open: !!c.open }));
  const other = available.filter((t) => !listed.has(t));
  if (other.length) out.splice(out.length - 1, 0, { id: "other", title: "Other", types: other, presets: false, open: false });
  return out.filter((s) => s.types.length || s.presets);
}
