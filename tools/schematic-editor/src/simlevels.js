// Calculated logic levels from circuit-model's simulator (R1.4; pinned copy in tools/shared/src/sim/, tag in MODEL_PIN.json).
// No DOM. Copilot's evaluator (logic.js, sequential.js) was retired after the parity suite passed (commit 902f74e).
//
// The adapter:
// - Nets are the editor's nets (doc.deriveNets) joined by net labels: wires with the same label are one net.
// - Elements the simulator models are simulated; any other symbol is drawn only.
// - A net no simulated element drives, with a level set on one of its wires or ports, is driven by an input port made
//   for the run. Levels on nets an element drives are calculated, never inputs.
// - The static view (resolveLogic) is the end of a scenario: the inputs as they were set, one step per change, so a
//   latch or flip-flop holds what the earlier steps stored (the way hardware would). That history is editor data
//   (logic_history), kept only for circuits that can store a level (a sequential element or feedback).
// - Timing (calculateSteps): Frame 0 is the first step and sets state the way hardware would; each timing step is one
//   scenario step; a clock pulse is two steps (0, then 1).
// - A level set by hand on a driven net is not evaluated here (F24): scenario.js records it as scenario/0.2 `initial`
//   or `force`, and the simulator applies it; the trace's `forced` says which nets were held in which frames.

import { simulate } from "../../shared/src/sim/simulate.mjs";
import { MODELS } from "../../shared/src/sim/logic.mjs";
import { clone, deriveNets, wiresForRefs } from "./doc.js";
import { liveScenario } from "./scenario.js";

const GENERATED = "logic_generated_levels";
const MODE = "logic_mode";
const HISTORY = "logic_history";
/** Steps of input history kept for the static view. */
export const HISTORY_STEPS = 64;
const LEVELS = new Set(["0", "1", "X", "Z"]);
const isLevel = (v) => LEVELS.has(v);

const withGroups = (doc, groups) => {
  if (Object.keys(groups).length) doc.groups = groups; else delete doc.groups;
  return doc;
};

/** Nets joined by net labels: key per net, the refs (element pins and ports) on it, and the wires on it. */
export function networkOf(doc, pack) {
  const nets = deriveNets(doc, pack);
  const parent = new Map(Object.keys(nets).map((id) => [id, id]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(id) !== id) { const next = parent.get(id); parent.set(id, root); id = next; }
    return root;
  };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const netForRef = new Map(), wireNet = new Map();
  for (const [id, refs] of Object.entries(nets)) {
    for (const ref of refs) netForRef.set(ref, id);
    for (const wireId of wiresForRefs(doc, pack, refs)) wireNet.set(wireId, id);
  }
  for (const wire of doc.wires) if (!wireNet.has(wire.id)) { const key = `~${wire.id}`; parent.set(key, key); wireNet.set(wire.id, key); }
  const labelNet = new Map();
  for (const wire of doc.wires) {
    const label = doc.groups?.wire_labels?.[wire.id];
    if (typeof label !== "string" || !label.trim()) continue;
    const name = label.trim(), id = wireNet.get(wire.id);
    if (labelNet.has(name)) union(id, labelNet.get(name)); else labelNet.set(name, id);
  }
  const wiresByKey = new Map(), refsByKey = new Map();
  for (const wire of doc.wires) {
    const key = find(wireNet.get(wire.id));
    wireNet.set(wire.id, key);
    if (!wiresByKey.has(key)) wiresByKey.set(key, []);
    wiresByKey.get(key).push(wire.id);
  }
  for (const [id, refs] of Object.entries(nets)) {
    const key = find(id);
    if (!refsByKey.has(key)) refsByKey.set(key, []);
    refsByKey.get(key).push(...refs);
  }
  const keyForRef = (ref) => { const id = netForRef.get(ref); return id === undefined ? null : find(id); };
  /** The net of a wire id or a port id (or null). */
  const keyOf = (id) => wireNet.get(id) ?? keyForRef(id);
  return { keyForRef, keyOf, wireNet, wiresByKey, refsByKey };
}

/**
 * The circuit the simulator runs: one net per key, the simulated elements, and which nets they drive. `stateful` is
 * true when the circuit can store a level (a sequential element, or feedback between elements).
 */
/**
 * A module instance (circuit/0.4): a block whose params.module names an entry of doc.modules. Its inputs and outputs are the
 * module's ports; it is sequential when anything inside it (at any depth) is. The simulator flattens it (F22.1a).
 */
function instanceModel(doc, el) {
  const name = el.type === "block" ? el.params?.module : undefined;
  const mod = name !== undefined ? doc.modules?.[name] : undefined;
  if (!mod) return null;
  const sequential = (m, seen) => (m.elements ?? []).some((e) => MODELS[e.type]?.sequential || MODELS[e.type]?.init
    || (e.type === "block" && e.params?.module && !seen.has(e.params.module) && doc.modules[e.params.module] && sequential(doc.modules[e.params.module], new Set([...seen, e.params.module]))));
  const ports = mod.ports ?? [];
  return { inputs: ports.filter((p) => p.dir === "in").map((p) => p.id), outputs: ports.filter((p) => p.dir === "out").map((p) => p.id), sequential: sequential(mod, new Set([name])), instance: true };
}
const modelOf = (doc, el) => MODELS[el.type] ?? instanceModel(doc, el);

export function circuitOf(doc, pack, net = networkOf(doc, pack)) {
  const keys = [...new Set([...net.refsByKey.keys(), ...net.wiresByKey.keys()])];
  const netId = new Map(keys.map((key, i) => [key, `n${i}`]));
  const keyOfNet = new Map(keys.map((key, i) => [`n${i}`, key]));
  const elements = doc.elements.filter((el) => modelOf(doc, el));
  const driven = new Set(), reads = new Map(), drives = new Map();
  for (const el of elements) {
    const model = modelOf(doc, el);
    const pins = model.instance ? [...model.inputs, ...model.outputs] : Object.keys(pack.defFor(el)?.pins ?? {});
    const inputs = typeof model.inputs === "function" ? model.inputs(el) : model.inputs;
    drives.set(el.id, model.outputs.map((pin) => net.keyForRef(`${el.id}.${pin}`)).filter((k) => k !== null));
    reads.set(el.id, inputs.filter((pin) => pins.includes(pin)).map((pin) => net.keyForRef(`${el.id}.${pin}`)).filter((k) => k !== null));
    for (const key of drives.get(el.id)) driven.add(key);
  }
  // Feedback: an element whose outputs reach its own inputs through other elements.
  const readers = new Map();
  for (const el of elements) for (const key of reads.get(el.id)) { if (!readers.has(key)) readers.set(key, []); readers.get(key).push(el.id); }
  const state = new Map();
  const cyclic = (id) => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const key of drives.get(id)) for (const next of readers.get(key) ?? []) if (cyclic(next)) return true;
    state.set(id, 2);
    return false;
  };
  const stateful = elements.some((el) => modelOf(doc, el).sequential || modelOf(doc, el).init) || elements.some((el) => cyclic(el.id));
  const hasInstances = elements.some((el) => modelOf(doc, el).instance);
  const circuit = {
    schema: hasInstances ? "circuit/0.4" : "circuit/0.3", id: doc.id ?? "figure",
    ports: [],
    elements: elements.map((el) => ({ id: el.id, type: el.type, ...(el.params ? { params: el.params } : {}) })),
    nets: Object.fromEntries(keys.map((key) => [netId.get(key), [...(net.refsByKey.get(key) ?? [])]])),
    ...(hasInstances ? { modules: doc.modules } : {}),
  };
  return { circuit, net, netId, keyOfNet, driven, reads, drives, stateful };
}

/** Levels by id (wire or port) to levels by net; ids that share a net with different levels give X. Driven nets are skipped. */
function byKey(net, driven, levels) {
  const out = new Map();
  for (const [id, level] of Object.entries(levels ?? {})) {
    if (!isLevel(level)) continue;
    const key = net.keyOf(id);
    if (key === null || key === undefined || driven.has(key)) continue;
    out.set(key, out.has(key) && out.get(key) !== level ? "X" : level);
  }
  return out;
}

/**
 * Run the simulator. `steps` is a list of { key: level } maps for undriven nets (an input missing from a step floats, Z);
 * `pulses[i]` (a Set of keys) makes those inputs a pulse in step i: 0, then 1. `hand` is the scenario record from
 * liveScenario(): `initial` by element id, and `force` entries { id, level, from, to } in these steps' indices.
 * Returns, per step, a Map of every net's level, and `forced[i]`, the Set of net keys held in step i.
 */
function run(sim, steps, pulses = [], hand = { initial: {}, force: [] }) {
  const inputKeys = [...new Set(steps.flatMap((s) => [...s.keys()]))];
  const portOf = new Map(inputKeys.map((key, i) => [key, `in${i}`]));
  const circuit = clone(sim.circuit);
  for (const [key, port] of portOf) {
    circuit.ports.push({ id: port, dir: "in" });
    circuit.nets[sim.netId.get(key)].push(port);
  }
  const scenarioSteps = [], report = [], first = [];
  steps.forEach((step, i) => {
    first.push(scenarioSteps.length);
    const values = Object.fromEntries(inputKeys.map((key) => [portOf.get(key), step.get(key) ?? "Z"]));
    const pulse = pulses[i] ?? new Set();
    if ([...pulse].some((key) => portOf.has(key))) {
      scenarioSteps.push({ duration: 1, values: { ...values, ...Object.fromEntries([...pulse].filter((k) => portOf.has(k)).map((k) => [portOf.get(k), "0"])) } });
      for (const key of pulse) if (portOf.has(key)) values[portOf.get(key)] = "1";
    }
    scenarioSteps.push({ duration: 1, values });
    report.push(scenarioSteps.length - 1);
  });
  const force = hand.force.filter((f) => f.from < steps.length).map((f) => ({
    net: sim.netId.get(hand.net.keyOf(f.id)), level: f.level, from: first[f.from], to: report[Math.min(f.to, steps.length - 1)],
  })).filter((f) => f.net);
  const initial = Object.fromEntries(Object.entries(hand.initial).filter(([id]) => sim.circuit.elements.some((e) => e.id === id)));
  const scenario = { schema: "scenario/0.2", id: "editor", circuit: circuit.id, inputs: [...portOf.values()], steps: scenarioSteps };
  if (Object.keys(initial).length) scenario.initial = initial;
  if (force.length) scenario.force = force;
  const trace = simulate(circuit, scenario);
  const levels = report.map((j) => new Map([...sim.keyOfNet].map(([id, key]) => [key, trace.steps[j].values[id]])));
  const forced = report.map((j) => new Set((trace.forced ?? []).filter((f) => f.from <= j && j <= f.to).map((f) => sim.keyOfNet.get(f.net))));
  return { levels, forced, warnings: trace.warnings ?? [] };
}

/** The driven nets that depend on at least one input with a level: the rest stay uncoloured until a value is known. */
function knownDriven(sim, inputs) {
  const known = new Set();
  const driversOf = new Map();
  for (const [id, keys] of sim.drives) for (const key of keys) { if (!driversOf.has(key)) driversOf.set(key, []); driversOf.get(key).push(id); }
  const memo = new Map();
  const reaches = (key, seen = new Set()) => {
    if (memo.has(key)) return memo.get(key);
    if (inputs.has(key)) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    const hit = (driversOf.get(key) ?? []).some((id) => sim.reads.get(id).some((k) => reaches(k, seen)));
    memo.set(key, hit);
    return hit;
  };
  for (const key of sim.driven) if (reaches(key)) known.add(key);
  return known;
}

/** Levels by net to levels by wire and port id, for the driven nets only. */
function idsOf(doc, sim, levels, only = sim.driven) {
  const out = {};
  for (const key of only) {
    const level = levels.get(key);
    if (!isLevel(level)) continue;
    for (const id of sim.net.wiresByKey.get(key) ?? []) out[id] = level;
  }
  for (const port of doc.ports) {
    const key = sim.net.keyForRef(port.id);
    if (key !== null && only.has(key) && isLevel(levels.get(key))) out[port.id] = levels.get(key);
  }
  return out;
}

function clearGenerated(doc) {
  const generated = doc.groups?.[GENERATED];
  if (!generated && !doc.groups?.[HISTORY]) return doc;
  const next = clone(doc);
  if (generated && typeof generated === "object" && !Array.isArray(generated)) {
    for (const [id, level] of Object.entries(generated)) {
      const wire = next.wires.find((item) => item.id === id);
      if (wire?.level === level) delete wire.level;
    }
  }
  const groups = { ...next.groups };
  delete groups[GENERATED];
  return withGroups(next, groups);
}

/** The input levels the document sets: wire levels and port levels, by id. */
function inputIds(doc) {
  const out = {};
  for (const wire of doc.wires) if (isLevel(wire.level)) out[wire.id] = wire.level;
  for (const [id, level] of Object.entries(doc.groups?.port_levels ?? {})) if (isLevel(level)) out[id] = level;
  return out;
}

const sameStep = (a, b) => a && b && a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

export function logicModeOf(doc) {
  return doc.groups?.[MODE] === "manual" ? "manual" : "calculated";
}

export function setLogicMode(doc, pack, mode) {
  if (mode !== "calculated" && mode !== "manual") throw new Error('logic mode must be "calculated" or "manual"');
  const next = clone(doc), groups = { ...(next.groups ?? {}) };
  if (mode === "manual") groups[MODE] = "manual"; else delete groups[MODE];
  delete groups[HISTORY];
  withGroups(next, groups);
  return mode === "manual" ? clearGenerated(next) : resolveLogic(next, pack);
}

/** Recalculate every net a simulated element drives; nets that depend on no set level stay uncoloured. */
export function resolveLogic(doc, pack) {
  if (logicModeOf(doc) === "manual") return doc;
  const base = clearGenerated(doc);
  const sim = circuitOf(base, pack);
  const groups = { ...(base.groups ?? {}) };
  delete groups[HISTORY];
  if (!sim.driven.size) return withGroups(clone(base), groups);
  // Stored history is by wire and port id, so it survives edits that renumber nets.
  const current = inputIds(base);
  const history = sim.stateful && Array.isArray(base.groups?.[HISTORY]) ? base.groups[HISTORY] : [];
  const keyed = (ids) => byKey(sim.net, sim.driven, ids);
  const steps = history.map(keyed);
  let ids = history;
  if (!sameStep(steps.at(-1), keyed(current))) { ids = [...history, current].slice(-HISTORY_STEPS); }
  // Frame 0's hand-set levels start the history: initial state, and forces held for its first step.
  const live = liveScenario(base, pack, 1);
  const hand = { net: sim.net, initial: live.initial, force: live.force.map((f) => ({ ...f, from: 0, to: 0 })) };
  const { levels } = run(sim, ids.map(keyed), [], hand);
  const last = levels.at(-1);
  const generated = idsOf(base, sim, last, knownDriven(sim, new Map([...keyed(current), ...handKeys(sim, hand)])));
  const next = clone(base);
  for (const wire of next.wires) {
    if (!sim.driven.has(sim.net.wireNet.get(wire.id))) continue;
    if (wire.id in generated) wire.level = generated[wire.id]; else delete wire.level;
  }
  const wireGenerated = Object.fromEntries(Object.entries(generated).filter(([id]) => next.wires.some((w) => w.id === id)));
  if (Object.keys(wireGenerated).length) groups[GENERATED] = wireGenerated;
  if (sim.stateful && ids.length) groups[HISTORY] = ids;
  return withGroups(next, groups);
}

/** Nets the hand-set record makes known: forced nets, and the nets a latch or flip-flop with an initial state drives. */
function handKeys(sim, hand) {
  const out = new Map();
  for (const f of hand.force) { const key = hand.net.keyOf(f.id); if (key !== null && key !== undefined) out.set(key, f.level); }
  for (const id of Object.keys(hand.initial)) for (const key of sim.drives.get(id) ?? []) out.set(key, "X");
  return out;
}

/**
 * Calculate timing steps. `frames[0]` holds Frame 0's levels (by wire or port id) and is the first step; frames[1..]
 * are the timing steps. Only levels on nets no element drives are inputs; hand-set levels on driven nets come from the
 * document's scenario record (scenario.js) and the simulator applies them. `pulses[i]` lists the ids pulsed in
 * frames[i + 1]. Returns { results, forced, warnings }: results[i] is the level of every wire and port on a driven net
 * in frames[i + 1]; forced[i] lists the wire and port ids the trace reports as held in frames[i] (frame 0 included).
 */
export function calculateSteps(doc, pack, frames, pulses = []) {
  const sim = circuitOf(doc, pack);
  const steps = frames.map((levels) => byKey(sim.net, sim.driven, levels));
  const pulseKeys = [new Set(), ...pulses.map((ids) => new Set(ids.map((id) => sim.net.keyOf(id)).filter((k) => k !== null && k !== undefined)))];
  const live = liveScenario(doc, pack, frames.length);
  const { levels, forced, warnings } = run(sim, steps, pulseKeys, { net: sim.net, initial: live.initial, force: live.force });
  const results = levels.slice(1).map((map) => idsOf(doc, sim, map));
  const forcedIds = forced.map((keys) => Object.keys(idsOf(doc, sim, new Map([...keys].map((k) => [k, "0"])), keys)));
  return { results, forced: forcedIds, warnings };
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
