// Four-valued gate logic and state retention for cross-coupled NAND latches.

import { clone, deriveNets, wiresForRefs } from "./doc.js";
import { sequentialStep } from "./sequential.js";

const GENERATED = "logic_generated_levels";
const MODE = "logic_mode";
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

export function logicModeOf(doc) {
  return doc.groups?.[MODE] === "manual" ? "manual" : "calculated";
}

export function setLogicMode(doc, pack, mode) {
  if (mode !== "calculated" && mode !== "manual") throw new Error('logic mode must be "calculated" or "manual"');
  const next = clone(doc), groups = { ...(next.groups ?? {}) };
  if (mode === "manual") groups[MODE] = "manual"; else delete groups[MODE];
  if (Object.keys(groups).length) next.groups = groups; else delete next.groups;
  return mode === "manual" ? clearGenerated(next) : resolveLogic(next, pack);
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
    wireNet.set(wire.id, key);
    if (!wiresByKey.has(key)) wiresByKey.set(key, []);
    wiresByKey.get(key).push(wire.id);
  }
  const keyForRef = (ref) => {
    const id = netForRef.get(ref);
    return id === undefined ? null : find(id);
  };
  return { keyForRef, wireNet, wiresByKey };
}

function latchPairs(drivers, keyForRef, type = "nand_gate") {
  const candidates = new Map();
  for (const [output, gates] of drivers) {
    if (gates.length !== 1 || gates[0].el.type !== type || gates[0].inputs.length !== 2) continue;
    candidates.set(output, gates[0].inputs.map((name) => keyForRef(`${gates[0].el.id}.${name}`)));
  }

  const pairs = [], used = new Set();
  for (const [a, inputsA] of candidates) {
    if (used.has(a)) continue;
    const b = inputsA.find((key) => key !== null && key !== a && candidates.has(key) && candidates.get(key).includes(a));
    if (b === undefined || used.has(b)) continue;
    const inputsB = candidates.get(b);
    const feedbackA = inputsA.indexOf(b), feedbackB = inputsB.indexOf(a);
    if (feedbackA < 0 || feedbackB < 0) continue;
    const inputA = inputsA[1 - feedbackA], inputB = inputsB[1 - feedbackB];
    if (inputA === a || inputA === b || inputB === a || inputB === b) continue;
    pairs.push({ a, b, inputA, inputB });
    used.add(a);
    used.add(b);
  }
  return pairs;
}

function priorLevelsByNet(doc, wireNet) {
  const levels = new Map();
  for (const wire of doc.wires) {
    if (!["0", "1", "X", "Z"].includes(wire.level)) continue;
    const key = wireNet.get(wire.id);
    if (key === undefined) continue;
    if (!levels.has(key)) levels.set(key, wire.level);
    else if (levels.get(key) !== wire.level) levels.set(key, "X");
  }
  return levels;
}

function latchOutputs(inputA, inputB, previousA, previousB) {
  if (inputA === null && inputB === null && previousA === null && previousB === null) return [null, null];
  const values = (level) => level === "0" ? [0] : level === "1" ? [1] : [0, 1];
  const prior = previousA === "0" && previousB === "1" ? [[0, 1]]
    : previousA === "1" && previousB === "0" ? [[1, 0]]
      : [[1, 0], [0, 1]];
  const outcomes = [];
  for (const a of values(inputA)) for (const b of values(inputB)) {
    if (a === 0 && b === 0) outcomes.push([1, 1]);
    else if (a === 0) outcomes.push([1, 0]);
    else if (b === 0) outcomes.push([0, 1]);
    else outcomes.push(...prior);
  }
  const resolveBit = (index) => outcomes.every((outcome) => outcome[index] === outcomes[0][index])
    ? String(outcomes[0][index]) : "X";
  return [resolveBit(0), resolveBit(1)];
}

/** Recalculate gate-driven nets; undriven inputs stay visually unset until a value is known. */
export function resolveLogic(doc, pack) {
  if (logicModeOf(doc) === "manual") return doc;
  const base = clearGenerated(doc);
  const { keyForRef, wireNet, wiresByKey } = networkOf(base, pack);
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

  const latches = latchPairs(drivers, keyForRef);
  const latchKeys = new Set(latches.flatMap(({ a, b }) => [a, b]));
  const previous = priorLevelsByNet(doc, wireNet);
  const values = new Map();
  for (const [key, wireIds] of wiresByKey) {
    if (drivers.has(key)) continue;
    const levels = [...new Set(wireIds
      .map((id) => base.wires.find((wire) => wire.id === id)?.level)
      .filter((level) => ["0", "1", "X", "Z"].includes(level)))];
    if (levels.length) values.set(key, levels.length === 1 ? levels[0] : "X");
  }
  for (const port of base.ports) {
    const level = base.groups?.port_levels?.[port.id], key = keyForRef(port.id);
    if (key === null || drivers.has(key) || !["0", "1", "X", "Z"].includes(level)) continue;
    const existing = values.get(key);
    values.set(key, existing && existing !== level ? "X" : level);
  }
  for (const key of drivers.keys()) values.set(key, latchKeys.has(key) ? previous.get(key) ?? null : null);

  const state = () => JSON.stringify([...drivers.keys()].map((key) => values.get(key) ?? null));
  const seen = new Set();
  let settled = false;
  for (let pass = 0; pass <= drivers.size; pass++) {
    const before = state();
    seen.add(before);
    const outputs = new Map();
    for (const [key, gates] of drivers) {
      if (latchKeys.has(key)) continue;
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
    for (const { a, b, inputA, inputB } of latches) {
      const read = (key) => key === null ? null : values.get(key) ?? null;
      const [levelA, levelB] = latchOutputs(read(inputA), read(inputB), previous.get(a) ?? null, previous.get(b) ?? null);
      outputs.set(a, levelA);
      outputs.set(b, levelB);
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

/** Create a stateful, frame-by-frame calculator. Inputs are explicit levels keyed by wire or port id. */
export function timingCalculator(doc, pack, initialLevels = {}) {
  const { keyForRef, wireNet, wiresByKey } = networkOf(doc, pack);
  const drivers = new Map(), devices = [];
  for (const el of doc.elements) {
    const pins = Object.keys(pack.defFor(el)?.pins ?? {});
    if (OPERATIONS[el.type] && pins.includes("Y")) {
      const key = keyForRef(`${el.id}.Y`);
      if (key !== null) {
        if (!drivers.has(key)) drivers.set(key, []);
        drivers.get(key).push({ el, operation: OPERATIONS[el.type], inputs: pins.filter((name) => name !== "Y").sort() });
      }
    } else if (["d_latch", "d_flipflop", "d_flipflop_sr", "jk_flipflop", "t_flipflop"].includes(el.type)) {
      const device = {
        id: el.id, type: el.type, a: keyForRef(`${el.id}.Q`), b: keyForRef(`${el.id}.Qn`),
        inputs: Object.fromEntries(pins.filter((name) => name !== "Q" && name !== "Qn")
          .map((name) => [name, keyForRef(`${el.id}.${name}`)])),
      };
      if (device.a !== null || device.b !== null) devices.push(device);
    }
  }
  for (const type of ["nand_gate", "nor_gate"]) {
    for (const latch of latchPairs(drivers, keyForRef, type)) {
      const gate = drivers.get(latch.a)[0];
      devices.push({ id: gate.el.id, type: type === "nand_gate" ? "nand_latch" : "nor_latch",
        a: latch.a, b: latch.b, inputs: { A: latch.inputA, B: latch.inputB } });
      drivers.delete(latch.a);
      drivers.delete(latch.b);
    }
  }
  const outputs = new Set();
  for (const device of devices) for (const key of [device.a, device.b]) {
    if (key === null) continue;
    if (outputs.has(key) || drivers.has(key)) throw new Error("A sequential output has multiple drivers.");
    outputs.add(key);
  }
  const byNet = (levels) => {
    const values = new Map();
    for (const [id, value] of Object.entries(levels)) {
      if (!["0", "1", "X", "Z"].includes(value)) continue;
      const key = wireNet.get(id) ?? keyForRef(id);
      if (key === null || key === undefined) continue;
      if (values.has(key) && values.get(key) !== value) throw new Error(`Conflicting manual levels on net ${id}.`);
      values.set(key, value);
    }
    return values;
  };
  const initial = byNet(initialLevels);
  const prior = new Map(), clocks = new Map();
  for (const d of devices) {
    const a = initial.get(d.a), b = initial.get(d.b);
    if (BINARY.has(a) && BINARY.has(b) && a === b) throw new Error(`Initial outputs for ${d.id} are not complementary.`);
    prior.set(d.id, a ?? (b === undefined ? null : invert(b)));
  }
  let step = 0;
  return {
    step(levels, choose, pulseIds = []) {
      const manual = byNet(levels), values = new Map(manual);
      const pulses = new Set(pulseIds.map((id) => wireNet.get(id) ?? keyForRef(id)).filter((key) => key !== null && key !== undefined));
      for (const gates of drivers.values()) for (const { el, inputs } of gates) {
        if (inputs.some((name) => pulses.has(keyForRef(`${el.id}.${name}`)))) {
          throw new Error("Clock pulses through combinational gates cannot be calculated; use 0/1 clock levels.");
        }
      }
      const write = (key, value) => { if (key !== null && !manual.has(key)) values.set(key, value); };
      for (const d of devices) {
        const q = prior.get(d.id) ?? "X";
        write(d.a, q); write(d.b, invert(q));
      }
      const settle = () => {
        const seen = new Set();
        for (let pass = 0; pass <= drivers.size + 1; pass++) {
          const before = JSON.stringify([...drivers.keys()].map((key) => values.get(key) ?? null));
          if (seen.has(before)) throw new Error("Combinational feedback did not settle.");
          seen.add(before);
          const next = new Map();
          for (const [key, gates] of drivers) {
            if (manual.has(key)) continue;
            const results = gates.map(({ el, operation, inputs }) => operation(inputs.map((name) => {
              const level = values.get(keyForRef(`${el.id}.${name}`));
              return BINARY.has(level) ? level : "X";
            })));
            next.set(key, results.every((v) => v === results[0]) ? results[0] : "X");
          }
          for (const [key, value] of next) values.set(key, value);
          if (before === JSON.stringify([...drivers.keys()].map((key) => values.get(key) ?? null))) return;
        }
        throw new Error("Combinational logic did not settle.");
      };
      const nextState = new Map(prior), nextClocks = new Map(clocks), decisions = new Map(), seen = new Set();
      let settled = false;
      for (let pass = 0; pass <= 2 * (drivers.size + devices.length + 1); pass++) {
        settle();
        const before = JSON.stringify([...[...nextState.entries()], ...[...nextClocks.entries()]]);
        if (seen.has(before)) throw new Error("Sequential feedback did not settle.");
        seen.add(before);
        const results = [];
        for (const d of devices) {
          const input = Object.fromEntries(Object.entries(d.inputs).map(([name, key]) => [name, values.get(key) ?? "X"]));
          const pulse = pulses.has(d.inputs.CLK);
          if (pulse) input.CLK = "1";
          const a = manual.get(d.a), b = manual.get(d.b);
          if (BINARY.has(a) && BINARY.has(b) && a === b) throw new Error(`Manual outputs for ${d.id} are not complementary.`);
          const forced = a ?? (b === undefined ? null : invert(b));
          const previousClock = step === 0 ? null : pulse && pass === 0 ? "0" : nextClocks.get(d.id);
          const result = forced !== null ? { q: forced, qn: invert(forced) }
            : sequentialStep(d.type, input, nextState.get(d.id), previousClock,
              (reason) => {
                const key = `${d.id}: ${reason}`;
                if (!decisions.has(key)) decisions.set(key, choose(`${d.id}, step ${step + 1}: ${reason}`));
                return decisions.get(key);
              });
          if (result === null) return null;
          results.push([d, result, input.CLK ?? "X"]);
        }
        for (const [d, result, clock] of results) {
          nextState.set(d.id, result.q);
          nextClocks.set(d.id, clock);
          write(d.a, result.q); write(d.b, result.qn);
        }
        const after = JSON.stringify([...[...nextState.entries()], ...[...nextClocks.entries()]]);
        if (before === after) { settled = true; break; }
      }
      if (!settled) throw new Error("Sequential logic did not settle.");
      settle();
      const generated = {};
      for (const [key, ids] of wiresByKey) {
        if (!drivers.has(key) && !outputs.has(key)) continue;
        if (!manual.has(key) && values.has(key)) for (const id of ids) generated[id] = values.get(key);
      }
      for (const port of doc.ports) {
        const key = keyForRef(port.id);
        if (key !== null && (drivers.has(key) || outputs.has(key)) && !manual.has(key) && values.has(key)) generated[port.id] = values.get(key);
      }
      for (const [id, value] of nextState) prior.set(id, value);
      for (const [id, value] of nextClocks) clocks.set(id, value);
      step++;
      return generated;
    },
  };
}

/**
 * Wires on a net that an element drives (a gate's Y, a latch's or flip-flop's Q and Qn). Setting one of them by hand is a
 * manual override of a calculated value, so the editor keeps it rather than recalculating it away; setting any other
 * wire (an input) recalculates what it drives.
 */
export function drivenWireIds(doc, pack) {
  const { keyForRef, wiresByKey } = networkOf(doc, pack), out = new Set();
  for (const el of doc.elements) {
    for (const pin of ["Y", "Q", "Qn"]) {
      if (!pack.defFor(el)?.pins?.[pin]) continue;
      const key = keyForRef(`${el.id}.${pin}`);
      for (const id of (key === null ? [] : wiresByKey.get(key) ?? [])) out.add(id);
    }
  }
  return out;
}
