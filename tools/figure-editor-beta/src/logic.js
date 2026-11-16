// Combinational logic for the basic gates in the symbol pack.

import { clone, deriveNets, wiresForRefs } from "./doc.js";

const GENERATED = "logic_generated_levels";
const BINARY = new Set(["0", "1"]);
const OPERATIONS = {
  and_gate: (values) => values.includes("0") ? "0" : values.every((v) => v === "1") ? "1" : "X",
  nand_gate: (values) => invert(and(values)),
  or_gate: (values) => values.includes("1") ? "1" : values.every((v) => v === "0") ? "0" : "X",
  nor_gate: (values) => invert(or(values)),
  xor_gate: (values) => parity(values),
  xnor_gate: (values) => invert(parity(values)),
  not_gate: (values) => invert(values[0] ?? "X"),
};

function and(values) {
  return values.includes("0") ? "0" : values.every((v) => v === "1") ? "1" : "X";
}

function or(values) {
  return values.includes("1") ? "1" : values.every((v) => v === "0") ? "0" : "X";
}

function parity(values) {
  if (!values.every((v) => BINARY.has(v))) return "X";
  return values.reduce((n, v) => n ^ Number(v), 0) ? "1" : "0";
}

function invert(value) {
  return value === "0" ? "1" : value === "1" ? "0" : "X";
}

function clearGenerated(doc) {
  const generated = doc.groups?.[GENERATED];
  if (!generated || typeof generated !== "object" || Array.isArray(generated)) return doc;
  const next = clone(doc);
  for (const [id, level] of Object.entries(generated)) {
    const wire = next.wires.find((item) => item.id === id);
    if (wire?.level === level) delete wire.level;
  }
  const groups = { ...next.groups };
  delete groups[GENERATED];
  if (Object.keys(groups).length) next.groups = groups; else delete next.groups;
  return next;
}

function networkOf(doc, pack) {
  const nets = deriveNets(doc, pack);
  const parent = new Map(Object.keys(nets).map((id) => [id, id]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(id) !== id) {
      const next = parent.get(id);
      parent.set(id, root);
      id = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const netForRef = new Map();
  const wireNet = new Map();

  for (const [id, refs] of Object.entries(nets)) {
    for (const ref of refs) netForRef.set(ref, id);
    const ids = wiresForRefs(doc, pack, refs);
    for (const wireId of ids) wireNet.set(wireId, id);
  }

  const wiresByKey = new Map();
  for (const wire of doc.wires) {
    if (!wireNet.has(wire.id)) {
      const key = `~${wire.id}`;
      parent.set(key, key);
      wireNet.set(wire.id, key);
    }
  }
  const labelNet = new Map();
  for (const wire of doc.wires) {
    const id = wireNet.get(wire.id);
    const label = doc.groups?.wire_labels?.[wire.id];
    if (typeof label === "string" && label.trim()) {
      const name = label.trim();
      if (labelNet.has(name)) union(id, labelNet.get(name));
      else labelNet.set(name, id);
    }
  }
  for (const wire of doc.wires) {
    const key = find(wireNet.get(wire.id));
    if (!wiresByKey.has(key)) wiresByKey.set(key, []);
    wiresByKey.get(key).push(wire.id);
  }
  const keyForRef = (ref) => {
    const id = netForRef.get(ref);
    return id === undefined ? null : find(id);
  };
  return { keyForRef, wireNet, wiresByKey };
}

/** Recalculate gate-driven nets; undriven inputs stay visually unset until a value is known. */
export function resolveLogic(doc, pack) {
  const base = clearGenerated(doc);
  const { keyForRef, wiresByKey } = networkOf(base, pack);
  const drivers = new Map();

  for (const el of base.elements) {
    const operation = OPERATIONS[el.type];
    if (!operation) continue;
    const pins = Object.keys(pack.defFor(el)?.pins ?? {});
    if (!pins.includes("Y")) continue;
    const key = keyForRef(`${el.id}.Y`);
    if (key === null) continue;
    if (!drivers.has(key)) drivers.set(key, []);
    drivers.get(key).push({
      el,
      operation,
      inputs: pins.filter((name) => name !== "Y").sort(),
    });
  }
  if (!drivers.size) return base;

  const values = new Map();
  for (const [key, wireIds] of wiresByKey) {
    if (drivers.has(key)) continue;
    const levels = [...new Set(wireIds
      .map((id) => base.wires.find((wire) => wire.id === id)?.level)
      .filter((level) => ["0", "1", "X", "Z"].includes(level)))];
    if (levels.length) values.set(key, levels.length === 1 ? levels[0] : "X");
  }
  for (const key of drivers.keys()) values.set(key, null);

  const state = () => JSON.stringify([...drivers.keys()].map((key) => values.get(key) ?? null));
  const seen = new Set();
  let settled = false;
  for (let pass = 0; pass <= drivers.size; pass++) {
    const before = state();
    seen.add(before);
    const outputs = new Map();
    for (const [key, gates] of drivers) {
      const results = gates.map(({ el, operation, inputs }) => {
        const levels = inputs.map((name) => {
          const inputKey = keyForRef(`${el.id}.${name}`);
          const value = inputKey === null ? null : values.get(inputKey) ?? null;
          return value === "Z" ? "X" : value;
        });
        if (levels.every((level) => level === null)) return null;
        return operation(levels.map((level) => level ?? "X"));
      });
      outputs.set(key, results.every((level) => level === results[0]) ? results[0] : "X");
    }
    for (const [key, level] of outputs) values.set(key, level);
    const after = state();
    if (after === before) { settled = true; break; }
    if (seen.has(after)) {
      for (const key of drivers.keys()) values.set(key, "X");
      settled = true;
      break;
    }
  }
  if (!settled) for (const key of drivers.keys()) values.set(key, "X");

  const next = clone(base), generated = {};
  for (const [key, wireIds] of wiresByKey) {
    if (!drivers.has(key)) continue;
    const level = values.get(key);
    for (const id of wireIds) {
      const wire = next.wires.find((item) => item.id === id);
      if (!wire) continue;
      if (level === null) delete wire.level;
      else { wire.level = level; generated[id] = level; }
    }
  }
  if (Object.keys(generated).length) next.groups = { ...(next.groups ?? {}), [GENERATED]: generated };
  return next;
}
