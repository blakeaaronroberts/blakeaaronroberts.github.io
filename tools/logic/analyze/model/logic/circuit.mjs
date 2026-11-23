// Expression to `circuit/0.2` JSON, built from the pack's gates (not_gate,
// and_gate, or_gate, xor_gate; each 2-input). A wider AND or OR becomes a
// balanced tree of 2-input gates. Each variable gets one input port and, if it
// is used complemented, one shared inverter. The layout is a plain left-to-right
// arrangement by logic level: a starting point for the figure editor, not a
// finished drawing.

import { parse, variablesOf } from "./expr.mjs";

const COLUMN = 16; // grid steps between logic levels
const ROW = 8; // grid steps between gates in one level

/**
 * Build a circuit for `input` (a string or a tree).
 * options: { id = "f", title, output = "F", variables }
 */
export function toCircuit(input, { id = "f", title, output = "F", variables } = {}) {
  const tree = typeof input === "string" ? parse(input) : input;
  const vars = variables ?? variablesOf(tree);
  if (vars.includes(output)) throw new Error(`the output name ${output} is also a variable; choose another`);
  const elements = [];
  const readers = new Map(); // source ref -> [reader refs]
  const levelOf = new Map(); // source ref -> logic level
  vars.forEach((name) => levelOf.set(name, 0));
  const inverters = new Map();
  let count = 0;

  const connect = (source, reader) => {
    if (!readers.has(source)) readers.set(source, []);
    readers.get(source).push(reader);
  };
  function gate(type, inputs, idHint) {
    const gid = idHint ?? `g${++count}`;
    const level = 1 + Math.max(...inputs.map((s) => levelOf.get(s)));
    const pins = inputs.length === 1 ? ["A"] : ["A", "B"];
    inputs.forEach((s, i) => connect(s, `${gid}.${pins[i]}`));
    elements.push({ id: gid, type, level });
    levelOf.set(`${gid}.Y`, level);
    return `${gid}.Y`;
  }
  function tree2(type, sources) {
    if (sources.length === 1) return sources[0];
    const mid = Math.ceil(sources.length / 2);
    return gate(type, [tree2(type, sources.slice(0, mid)), tree2(type, sources.slice(mid))]);
  }
  function build(n) {
    switch (n.t) {
      case "var": return n.name;
      case "const": throw new Error("the expression has a constant 0 or 1; simplify it first");
      case "not":
        if (n.a.t === "var") {
          if (!inverters.has(n.a.name)) inverters.set(n.a.name, gate("not_gate", [n.a.name], `not_${n.a.name}`));
          return inverters.get(n.a.name);
        }
        return gate("not_gate", [build(n.a)]);
      case "and": return tree2("and_gate", n.args.map(build));
      case "or": return tree2("or_gate", n.args.map(build));
      case "xor": return gate("xor_gate", n.args.map(build));
    }
    throw new Error(`unknown node ${JSON.stringify(n)}`);
  }
  const result = build(tree);
  connect(result, output);

  // Positions: one column per level, gates stacked within a column.
  const perLevel = new Map();
  const placed = elements.map((e) => {
    const k = perLevel.get(e.level) ?? 0;
    perLevel.set(e.level, k + 1);
    return { id: e.id, type: e.type, at: [e.level * COLUMN, -k * ROW] };
  });
  const lastLevel = Math.max(0, ...elements.map((e) => e.level));
  const ports = [
    ...vars.map((name, i) => ({ id: name, dir: "in", at: [-COLUMN / 2, -i * ROW], label: `$${latexName(name)}$`, side: "left" })),
    { id: output, dir: "out", at: [(lastLevel + 1) * COLUMN, 0], label: `$${latexName(output)}$`, side: "right" },
  ];

  const nets = {};
  const wires = [];
  for (const [source, rs] of readers) {
    const netId = source.includes(".") ? `n_${source.split(".")[0]}` : source;
    nets[netId] = [source, ...rs];
    rs.forEach((r) => wires.push({ id: `w${wires.length + 1}`, from: source, to: r }));
  }
  // Inputs that the expression does not use still get a port and a net of their own.
  for (const name of vars) if (!(name in nets)) nets[name] = [name];

  const circuit = { schema: "circuit/0.2", id };
  if (title) circuit.title = title;
  Object.assign(circuit, { grid_cm: 0.25, elements: placed, ports, wires, nets });
  return circuit;
}

const latexName = (name) => name.replace(/^([A-Za-z])([0-9]+)$/, "$1_{$2}");
