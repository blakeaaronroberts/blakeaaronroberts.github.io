// The four-valued logic simulator: simulate(circuit, scenario, options) -> trace.
//
// Plain JavaScript, no dependencies, no file access: runs in the browser, under
// Node and under Deno. Reads circuit/0.2 or 0.3 and scenario/0.1 or 0.2 objects
// and returns a trace/0.1 object (see schema/).
//
// How it works, in brief:
// - Nets come from circuit.nets. A closed switch joins its two nets into one
//   group; every net in a group has the same level.
// - A group's level is resolved from its drivers (input ports and element
//   outputs): no driver, or only Z, gives Z; drivers that agree give their
//   level; drivers that disagree give X.
// - Event driven. With zero delay (the default) a change and everything it
//   causes happen at the same time, in rounds ("delta cycles"). With delays,
//   an output changes `delay` time units after the input change that caused it.
// - Feedback (cross-coupled gates, rings) is simulated gate by gate: each
//   instant iterates until the nets settle. A loop still changing after a
//   bounded number of rounds is forced to X for the rest of the step, with a
//   `loop` warning: never a hang and never an error. A loop that settles is
//   not reported; it is ordinary feedback.
// - scenario/0.2 `initial` sets the stored state of named flip-flops and
//   latches before step 0; the start of step 0 is never a clock edge (signals
//   leave the all-X start without an edge). `force` holds a net's group at a
//   level over a range of steps, beating every driver; the trace lists the
//   forced stretches in `forced`.

import { MODELS, CONNECTORS } from "./logic.mjs";

const LEVELS = new Set(["0", "1", "X", "Z"]);
/** Rounds at one instant before a loop is declared unsettled (scaled by circuit size). */
const ROUNDS_PER_ELEMENT = 4;
/** Total output events in one run before a still-running loop is forced to X. */
const EVENT_BUDGET = 200000;

/** Which elements are simulated, and which are drawn only. */
export function describe(circuit) {
  const simulated = [];
  const notSimulated = [];
  for (const e of circuit.elements ?? []) {
    if (MODELS[e.type]) simulated.push({ id: e.id, type: e.type });
    else if (!CONNECTORS.has(e.type)) notSimulated.push({ id: e.id, type: e.type });
  }
  return { simulated, notSimulated };
}

function delayFor(element, pin, options) {
  if (!options.delays) return 0;
  const fallback = options.delays === true ? 1 : options.delays.default ?? 1;
  const p = element.params?.delay;
  const d = typeof p === "number" ? p : p && typeof p === "object" && pin in p ? p[pin] : fallback;
  if (!Number.isInteger(d) || d < 0) {
    throw new Error(`${element.id}.${pin}: delay must be a whole number of at least 0, not ${JSON.stringify(d)}`);
  }
  return d;
}

/**
 * Simulate `circuit` driven by `scenario`.
 * options.delays: false or absent for zero delay; true for one time unit per
 * element output; or { default: n }. An element's own params.delay (a number,
 * or { pin: number }) overrides the default when delays are on.
 */
export function simulate(circuit, scenario, options = {}) {
  // ---- nets and groups --------------------------------------------------
  const netIds = Object.keys(circuit.nets ?? {});
  const netOfRef = new Map();
  for (const net of netIds) for (const ref of circuit.nets[net]) netOfRef.set(ref, net);

  const parent = new Map(netIds.map((n) => [n, n]));
  const find = (n) => (parent.get(n) === n ? n : find(parent.get(n)));
  for (const e of circuit.elements ?? []) {
    if (e.type === "switch" && e.params?.closed === true) {
      const a = netOfRef.get(`${e.id}.1`);
      const b = netOfRef.get(`${e.id}.2`);
      if (a && b) parent.set(find(a), find(b));
    }
  }
  const groupOf = (net) => find(net);
  const netsInGroup = new Map();
  for (const n of netIds) {
    const g = groupOf(n);
    if (!netsInGroup.has(g)) netsInGroup.set(g, []);
    netsInGroup.get(g).push(n);
  }

  // ---- ports and elements -----------------------------------------------
  const ports = new Map((circuit.ports ?? []).map((p) => [p.id, p]));
  for (const name of scenario.inputs) {
    if (ports.get(name)?.dir !== "in") throw new Error(`scenario input "${name}" is not an input port of the circuit`);
  }
  const drivers = new Map(); // group -> [driver key]
  const addDriver = (group, key) => {
    if (!drivers.has(group)) drivers.set(group, []);
    drivers.get(group).push(key);
  };
  for (const name of scenario.inputs) {
    const net = netOfRef.get(name);
    if (net) addDriver(groupOf(net), `port:${name}`);
  }

  const elements = []; // simulated elements, in circuit order
  const readers = new Map(); // group -> Set of element indices
  for (const e of circuit.elements ?? []) {
    const model = MODELS[e.type];
    if (!model) continue;
    model.check?.(e);
    const index = elements.length;
    const inputPins = typeof model.inputs === "function" ? model.inputs(e) : model.inputs;
    const inputGroups = {};
    for (const pin of inputPins) {
      const net = netOfRef.get(`${e.id}.${pin}`);
      inputGroups[pin] = net ? groupOf(net) : null; // unconnected input floats
      if (net) {
        if (!readers.has(inputGroups[pin])) readers.set(inputGroups[pin], new Set());
        readers.get(inputGroups[pin]).add(index);
      }
    }
    const outputs = model.outputs.map((pin) => {
      const net = netOfRef.get(`${e.id}.${pin}`);
      const key = `${e.id}.${pin}`;
      if (net) addDriver(groupOf(net), key);
      return { pin, key, group: net ? groupOf(net) : null, delay: delayFor(e, pin, options) };
    });
    elements.push({ element: e, model, inputPins, inputGroups, outputs, state: model.init ? model.init() : {} });
  }

  // ---- scenario/0.2: initial state and forced nets ------------------------
  for (const [id, level] of Object.entries(scenario.initial ?? {})) {
    const el = elements.find((x) => x.element.id === id);
    if (!el) {
      const known = (circuit.elements ?? []).some((e) => e.id === id);
      throw new Error(`scenario initial names "${id}", which is ${known ? "not simulated" : "not an element of the circuit"}`);
    }
    if (!el.model.sequential) throw new Error(`scenario initial names "${id}", a ${el.element.type}, which has no stored state`);
    if (!["0", "1", "X"].includes(level)) throw new Error(`scenario initial "${id}" must be "0", "1" or "X", not ${JSON.stringify(level)}`);
    el.state.q = level;
  }
  const lastStep = scenario.steps.length - 1;
  const forces = (scenario.force ?? []).map((f) => {
    if (!netOfRef.has(f.net) && !(f.net in (circuit.nets ?? {}))) throw new Error(`scenario force names "${f.net}", which is not a net of the circuit`);
    if (!LEVELS.has(f.level)) throw new Error(`scenario force on "${f.net}" has level ${JSON.stringify(f.level)}`);
    return { net: f.net, group: groupOf(f.net), level: f.level, from: f.from, to: f.to ?? lastStep };
  });
  for (let i = 0; i < forces.length; i++) for (let j = i + 1; j < forces.length; j++) {
    const a = forces[i], b = forces[j];
    if (a.group === b.group && a.from <= b.to && b.from <= a.to) {
      throw new Error(`scenario forces "${a.net}" and "${b.net}" overlap on the same net between steps ${Math.max(a.from, b.from)} and ${Math.min(a.to, b.to)}`);
    }
  }
  let forcedGroups = new Map(); // group -> level, for the current step

  // ---- signals and state ------------------------------------------------
  const outputSignals = elements.flatMap((el) => el.outputs.map((o) => o.key));
  const signals = [...netIds, ...outputSignals];
  const driven = new Map(); // driver key -> level it drives now
  for (const name of scenario.inputs) driven.set(`port:${name}`, "X");
  for (const key of outputSignals) driven.set(key, "X");
  const projected = new Map(driven); // last level scheduled for each driver
  const groupLevel = new Map([...netsInGroup.keys()].map((g) => [g, "X"]));

  function resolve(group) {
    if (forcedGroups.has(group)) return forcedGroups.get(group);
    let level = null;
    for (const key of drivers.get(group) ?? []) {
      const v = driven.get(key);
      if (v === "Z") continue;
      if (level === null) level = v;
      else if (level !== v) return "X";
    }
    return level ?? "Z";
  }
  const levelOfGroup = (g) => (g === null ? "Z" : groupLevel.get(g));
  // Net ids never contain a dot; element outputs are "element.pin".
  const signalLevel = (s) => (s.includes(".") ? driven.get(s) : levelOfGroup(groupOf(s)));

  const warnings = [];

  // ---- event loop -------------------------------------------------------
  const queue = new Map(); // time -> [{ key, value }]
  const schedule = (t, key, value) => {
    if (!queue.has(t)) queue.set(t, []);
    queue.get(t).push({ key, value });
  };
  const maxRounds = ROUNDS_PER_ELEMENT * elements.length + 10;
  let events = 0;
  let frozen = new Set();
  let atStart = false; // the first instant of step 0: clocks leave X without an edge
  const changes = [];
  const lastRecorded = new Map(signals.map((s) => [s, "X"]));
  const steps = [];

  function evaluate(index, t, nextRound) {
    const el = elements[index];
    const inputs = {};
    const optional = el.model.optional ?? {};
    for (const pin of el.inputPins) {
      const g = el.inputGroups[pin];
      // An optional control pin left unconnected is inactive, not floating.
      inputs[pin] = g === null && pin in optional ? optional[pin] : levelOfGroup(g);
    }
    const out = el.model.evaluate(inputs, el.state, el.element.params ?? {}, { start: atStart });
    for (const o of el.outputs) {
      const v = out[o.pin];
      if (!LEVELS.has(v)) throw new Error(`model ${el.element.type} gave ${JSON.stringify(v)} for ${o.pin}`);
      if (frozen.has(o.key) || projected.get(o.key) === v) continue;
      projected.set(o.key, v);
      events++;
      if (o.delay === 0) nextRound.push({ key: o.key, value: v });
      else schedule(t + o.delay, o.key, v);
    }
  }

  /** Apply driver changes; return the elements that read a group whose level changed. */
  function apply(batch) {
    const touched = new Set();
    for (const { key, value } of batch) {
      if (frozen.has(key)) continue;
      driven.set(key, value);
      for (const g of driverGroups.get(key) ?? []) touched.add(g);
    }
    const dirty = new Set();
    for (const g of touched) {
      const v = resolve(g);
      if (v !== groupLevel.get(g)) {
        groupLevel.set(g, v);
        for (const i of readers.get(g) ?? []) dirty.add(i);
      }
    }
    return dirty;
  }
  const driverGroups = new Map();
  for (const [g, keys] of drivers) for (const k of keys) {
    if (!driverGroups.has(k)) driverGroups.set(k, []);
    driverGroups.get(k).push(g);
  }

  function freeze(keys, stepIndex, t, why) {
    const newly = [...keys].filter((k) => !frozen.has(k));
    if (newly.length === 0) return;
    for (const k of newly) {
      frozen.add(k);
      driven.set(k, "X");
      projected.set(k, "X");
    }
    // One warning per loop per instant: forcing one output to X can make the
    // rest of the loop keep changing for a few rounds, and those join it.
    const last = warnings[warnings.length - 1];
    const same = last && last.kind === "loop" && last.step === stepIndex && last.t === t && last.why === why;
    const forced = same ? [...last.forced, ...newly] : newly;
    const groups = new Set(forced.flatMap((k) => driverGroups.get(k) ?? []));
    const nets = netIds.filter((n) => groups.has(groupOf(n)));
    const warning = {
      kind: "loop",
      step: stepIndex,
      signals: [...forced, ...nets],
      message: `${why} at t=${t}; ${forced.join(", ")} forced to X for the rest of the step`,
    };
    // t, why and forced are bookkeeping only: non-enumerable, so never written to the trace.
    Object.defineProperties(warning, {
      t: { value: t }, why: { value: why }, forced: { value: forced },
    });
    if (same) warnings[warnings.length - 1] = warning;
    else warnings.push(warning);
  }

  /** Re-resolve every group (after freezing); return the elements whose inputs changed. */
  function reresolve() {
    const dirty = new Set();
    for (const g of groupLevel.keys()) {
      const v = resolve(g);
      if (v !== groupLevel.get(g)) {
        groupLevel.set(g, v);
        for (const i of readers.get(g) ?? []) dirty.add(i);
      }
    }
    return dirty;
  }

  /** Process everything that happens at time t. */
  function instant(t, stepIndex, evaluateAll) {
    let batch = queue.get(t) ?? [];
    queue.delete(t);
    let dirty = apply(batch);
    if (evaluateAll) {
      // First instant (or after a loop was thawed): nets with no driver become Z,
      // and every element computes its outputs once.
      reresolve();
      elements.forEach((_, i) => dirty.add(i));
    }
    let rounds = 0;
    while (dirty.size > 0) {
      const nextRound = [];
      for (const i of [...dirty].sort((a, b) => a - b)) evaluate(i, t, nextRound);
      rounds++;
      if (rounds > maxRounds && nextRound.length > 0) {
        // Still changing after this many rounds: a loop that never settles.
        freeze(nextRound.map((e) => e.key), stepIndex, t, "loop did not settle");
        dirty = reresolve();
      } else {
        dirty = apply(nextRound);
      }
    }
    if (events > EVENT_BUDGET) {
      const pending = [...queue.values()].flat().map((e) => e.key).filter((k) => !k.startsWith("port:"));
      if (pending.length) {
        freeze(pending, stepIndex, t, "event budget exceeded (a loop is still oscillating)");
        for (const i of reresolve()) evaluate(i, t, []);
      }
    }
    for (const s of signals) {
      const v = signalLevel(s);
      if (v !== lastRecorded.get(s)) {
        changes.push({ t, signal: s, value: v });
        lastRecorded.set(s, v);
      }
    }
  }

  let start = 0;
  scenario.steps.forEach((step, stepIndex) => {
    const end = start + step.duration;
    events = 0; // the event budget is per step
    // A loop forced to X gets a fresh chance at each new step.
    const thawed = [...frozen];
    frozen = new Set();
    for (const [name, value] of Object.entries(step.values)) {
      const key = `port:${name}`;
      if (projected.get(key) !== value) {
        projected.set(key, value);
        schedule(start, key, value);
      }
    }
    const nowForced = new Map(forces.filter((f) => f.from <= stepIndex && stepIndex <= f.to).map((f) => [f.group, f.level]));
    const forceChanged = [...nowForced].map(String).join() !== [...forcedGroups].map(String).join();
    forcedGroups = nowForced;
    let first = stepIndex === 0 || thawed.length > 0 || forceChanged;
    if (!queue.has(start)) queue.set(start, []);
    for (;;) {
      const times = [...queue.keys()].filter((t) => t < end).sort((a, b) => a - b);
      if (times.length === 0) break;
      atStart = stepIndex === 0 && times[0] === 0;
      instant(times[0], stepIndex, first);
      atStart = false;
      first = false;
    }
    const values = {};
    for (const s of signals) values[s] = signalLevel(s);
    const entry = { index: stepIndex };
    if (step.label !== undefined) entry.label = step.label;
    Object.assign(entry, { start, end, values });
    steps.push(entry);
    start = end;
  });

  const trace = {
    schema: "trace/0.1",
    circuit: scenario.circuit,
    scenario: scenario.id,
    signals,
    end: start,
    steps,
    changes,
  };
  if (forces.length) trace.forced = forces.map(({ net, from, to }) => ({ net, from, to }));
  if (warnings.length) trace.warnings = warnings;
  return trace;
}
