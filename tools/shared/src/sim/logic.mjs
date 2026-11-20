// Four-valued logic and the logic model of each element type.
//
// Levels are the strings "0", "1", "X" (unknown) and "Z" (floating), as in the
// circuit, scenario and trace formats. Gates read Z on an input as X, and never
// drive Z themselves. X spreads only where the output really is unknown:
// AND with a 0 is 0 whatever the other input is; AND with an X and a 1 is X.

/** Z on an input reads as X. */
export const read = (v) => (v === "Z" ? "X" : v);

export function not(a) {
  a = read(a);
  return a === "0" ? "1" : a === "1" ? "0" : "X";
}

export function and(...inputs) {
  const v = inputs.map(read);
  if (v.includes("0")) return "0";
  return v.every((x) => x === "1") ? "1" : "X";
}

export function or(...inputs) {
  const v = inputs.map(read);
  if (v.includes("1")) return "1";
  return v.every((x) => x === "0") ? "0" : "X";
}

export function xor(...inputs) {
  const v = inputs.map(read);
  if (v.includes("X")) return "X";
  return v.filter((x) => x === "1").length % 2 === 1 ? "1" : "0";
}

/** Majority of three: the carry of a full adder. Known as soon as two inputs agree. */
export function majority(a, b, c) {
  const v = [a, b, c].map(read);
  const ones = v.filter((x) => x === "1").length;
  const zeros = v.filter((x) => x === "0").length;
  return ones >= 2 ? "1" : zeros >= 2 ? "0" : "X";
}

/** Two-way choice by `s`. With s unknown, the output is known only if both inputs agree. */
export function choose(s, i0, i1) {
  s = read(s);
  i0 = read(i0);
  i1 = read(i1);
  if (s === "0") return i0;
  if (s === "1") return i1;
  return i0 === i1 && i0 !== "X" ? i0 : "X";
}

// An element model says which pins are inputs and outputs and how outputs
// follow from inputs. `evaluate(inputs, state, params)` gets { pin: level },
// the element's own state object and its params, and returns { pin: level }
// for every output. Sequential models keep what they remember in `state`.
//
// Optional fields: `inputs` may be a function of the element (n-input gates);
// `optional` gives the inactive level of a control pin, used when that pin is
// not connected; `check(element)` rejects bad params before a run.

const LETTERS = "ABCDEFGH";

/** A gate with n inputs A, B, C, ... (params.n, 2 to 8, default 2), as in the symbol pack. */
const gateN = (fn) => ({
  inputs: (e) => LETTERS.slice(0, e.params?.n ?? 2).split(""),
  outputs: ["Y"],
  check: (e) => {
    const n = e.params?.n ?? 2;
    if (!Number.isInteger(n) || n < 2 || n > 8) {
      throw new Error(`${e.id}: params.n must be a whole number from 2 to 8, not ${JSON.stringify(n)}`);
    }
  },
  evaluate: (inputs) => ({ Y: fn(...Object.values(inputs)) }),
});

// ---- sequential models ----------------------------------------------------
//
// Each sequential model is written for known levels only: a rule that takes
// binary inputs and a binary stored state q, and returns the new state q and
// the outputs Q and Qn. `lift` makes the rule four-valued: every input (and the
// state) that is X or Z is tried as both 0 and 1, and a result is known only if
// every try agrees. So an uncertain clock edge, enable or control gives X
// exactly when the result depends on it, and never otherwise.

const BIT = ["0", "1"];

export function lift(rule, levels) {
  const names = Object.keys(levels);
  let merged = null;
  const tryAll = (i, bits) => {
    if (i === names.length) {
      const out = rule(bits);
      if (merged === null) merged = { ...out };
      else for (const k of Object.keys(out)) if (merged[k] !== out[k]) merged[k] = "X";
      return;
    }
    const v = read(levels[names[i]]);
    for (const b of v === "X" ? BIT : [v]) tryAll(i + 1, { ...bits, [names[i]]: b });
  };
  tryAll(0, {});
  return merged;
}

const inv = (b) => (b === "0" ? "1" : "0");
const qOut = (q) => ({ q, Q: q, Qn: inv(q) });
const UNKNOWN = { q: "X", Q: "X", Qn: "X" };

/**
 * The clock edge since the last evaluation: "1" for an edge, "0" for none,
 * "X" when the change might be an edge (for rising: 0 to X, or X to 1). A clock
 * that has not changed is never an edge, so re-evaluating at one instant is safe.
 */
function edgeOf(state, clk, falling) {
  const before = state.clk;
  const now = read(clk);
  state.clk = now;
  const [from, to] = falling ? ["1", "0"] : ["0", "1"];
  if (before === now) return "0";
  if (before === from && now === to) return "1";
  if ((before === from && now === "X") || (before === "X" && now === to)) return "X";
  return "0";
}

/** Asynchronous active-low PREn and CLRn first (both active gives X), else `otherwise()`. */
function asyncLow(b, otherwise) {
  if (b.PREn === "0" && b.CLRn === "0") return UNKNOWN;
  if (b.CLRn === "0") return qOut("0");
  if (b.PREn === "0") return qOut("1");
  return otherwise();
}

/** Asynchronous active-high SET and RST (d_flipflop_sr; both active gives X). */
function asyncHigh(b, otherwise) {
  if (b.SET === "1" && b.RST === "1") return UNKNOWN;
  if (b.RST === "1") return qOut("0");
  if (b.SET === "1") return qOut("1");
  return otherwise();
}

function oneOf(e, name, allowed) {
  const v = e.params?.[name] ?? allowed[0];
  if (!allowed.includes(v)) {
    throw new Error(`${e.id}: params.${name} must be ${allowed.map((a) => JSON.stringify(a)).join(" or ")}, not ${JSON.stringify(v)}`);
  }
}

/** Store the state a lifted rule gave (a merged "X" state stays X) and return the outputs. */
function keep(state, out) {
  state.q = out.q;
  return { Q: out.Q, Qn: out.Qn };
}

const LOW_CONTROLS = { pins: ["PREn", "CLRn"], idle: { PREn: "1", CLRn: "1" }, apply: asyncLow };
const HIGH_CONTROLS = { pins: ["SET", "RST"], idle: { SET: "0", RST: "0" }, apply: asyncHigh };

/**
 * An edge-triggered flip-flop. `next(b)` is the new state on an active edge
 * (b holds the binary inputs and b.q, the stored state). Options, all
 * backward compatible: params.edge "falling" (default "rising"); CE, a clock
 * enable (active-high); asynchronous controls over the clock (PREn and CLRn,
 * active-low, unless `controls` says otherwise). Unconnected option pins are
 * inactive.
 */
function flipflop(dataPins, next, controls = LOW_CONTROLS) {
  return {
    inputs: [...dataPins, "CLK", "CE", ...controls.pins],
    outputs: ["Q", "Qn"],
    optional: { CE: "1", ...controls.idle },
    sequential: true,
    check: (e) => oneOf(e, "edge", ["rising", "falling"]),
    init: () => ({ q: "X", clk: "X" }),
    evaluate: (inputs, state, params) => {
      const edge = edgeOf(state, inputs.CLK, params.edge === "falling");
      const levels = { q: state.q, edge, CE: inputs.CE };
      for (const p of [...dataPins, ...controls.pins]) levels[p] = inputs[p];
      const rule = (b) => controls.apply(b, () => qOut(b.edge === "1" && b.CE === "1" ? next(b) : b.q));
      return keep(state, lift(rule, levels));
    },
  };
}

export const MODELS = {
  and_gate: gateN(and),
  or_gate: gateN(or),
  nand_gate: gateN((...v) => not(and(...v))),
  nor_gate: gateN((...v) => not(or(...v))),
  xor_gate: gateN(xor),
  not_gate: { inputs: ["A"], outputs: ["Y"], evaluate: ({ A }) => ({ Y: not(A) }) },

  mux2: {
    inputs: ["I0", "I1", "S"],
    outputs: ["Y"],
    evaluate: ({ I0, I1, S }) => ({ Y: choose(S, I0, I1) }),
  },

  // Output Yn is 1 when (A1 A0) is n. With an unknown address bit, an output
  // whose index the known bits rule out is still 0; the others are X.
  decoder2to4: {
    inputs: ["A1", "A0"],
    outputs: ["Y0", "Y1", "Y2", "Y3"],
    evaluate: ({ A1, A0 }) => {
      const out = {};
      for (let n = 0; n < 4; n++) {
        const bit1 = n >> 1 ? A1 : not(A1);
        const bit0 = n & 1 ? A0 : not(A0);
        out[`Y${n}`] = and(bit1, bit0);
      }
      return out;
    },
  },

  full_adder: {
    inputs: ["A", "B", "Cin"],
    outputs: ["S", "Cout"],
    evaluate: ({ A, B, Cin }) => ({ S: xor(A, B, Cin), Cout: majority(A, B, Cin) }),
  },

  // SR latch. params.active "high" (default, the NOR latch: S and R are
  // active-high) or "low" (the NAND latch: S and R are active-low). Optional EN
  // (active-high) makes it a gated SR latch. With S and R both active the
  // outputs are what the gates give (Q = Qn = 0 for NOR, 1 for NAND) and the
  // stored state is lost: releasing both together leaves Q at X.
  sr_latch: {
    inputs: ["S", "R", "EN"],
    outputs: ["Q", "Qn"],
    optional: { EN: "1" },
    sequential: true,
    check: (e) => oneOf(e, "active", ["high", "low"]),
    init: () => ({ q: "X" }),
    evaluate: ({ S, R, EN }, state, params) => {
      const low = params.active === "low";
      const on = low ? "0" : "1";
      const both = low ? "1" : "0";
      const rule = (b) => {
        const s = b.EN === "1" && b.S === on;
        const r = b.EN === "1" && b.R === on;
        if (s && r) return { q: "X", Q: both, Qn: both };
        return qOut(s ? "1" : r ? "0" : b.q);
      };
      return keep(state, lift(rule, { q: state.q, S, R, EN }));
    },
  },

  // Gated D latch: transparent while CLK (its enable) is 1, holds while it is
  // 0. Optional PREn and CLRn (asynchronous, active-low) override it.
  d_latch: {
    inputs: ["D", "CLK", "PREn", "CLRn"],
    outputs: ["Q", "Qn"],
    optional: { PREn: "1", CLRn: "1" },
    sequential: true,
    init: () => ({ q: "X" }),
    evaluate: ({ D, CLK, PREn, CLRn }, state) => {
      const rule = (b) => asyncLow(b, () => qOut(b.CLK === "1" ? b.D : b.q));
      return keep(state, lift(rule, { q: state.q, D, CLK, PREn, CLRn }));
    },
  },

  // Edge-triggered: Q takes D on a rising edge of CLK. A change that might be
  // an edge (0 to X, X to 1) gives X unless Q already equals D.
  d_flipflop: flipflop(["D"], (b) => b.D),

  // D flip-flop with asynchronous SET and RST, active-high, as the toolbox symbol.
  d_flipflop_sr: flipflop(["D"], (b) => b.D, HIGH_CONTROLS),

  // On an edge: J K = 1 0 sets, 0 1 resets, 0 0 holds, 1 1 toggles.
  jk_flipflop: flipflop(["J", "K"], (b) =>
    b.J === "1" && b.K === "1" ? inv(b.q) : b.J === "1" ? "1" : b.K === "1" ? "0" : b.q),

  // On an edge: T = 1 toggles, 0 holds.
  t_flipflop: flipflop(["T"], (b) => (b.T === "1" ? inv(b.q) : b.q)),
};

/**
 * Element types that are not logic: they are drawn but not simulated. A switch
 * is handled by the simulator itself (a closed switch joins its two nets).
 */
export const CONNECTORS = new Set(["switch"]);
