// Testbench stimulus to `scenario` steps (C11.2): a small interpreter over
// slang's elaborated AST of a testbench module. It runs only what it can run
// exactly: initial and always blocks made of blocking assignments, whole-number
// # delays, begin/end, for, repeat and forever, and $finish or $stop.
// Everything else is reported with its file, line and column and nothing is
// produced; printing and checks, which cannot change the stimulus, are skipped
// and listed. No circuit behaviour is decided here: the simulator does that.
//
// Where SystemVerilog leaves the order of events open (two processes touching
// one variable at the same instant), the testbench is refused, not guessed.
// Data that changes with a clock edge is checked afterwards, in races.mjs.

import { bitIds, parseType, symbolAddr, symbolName, where, widening, WIDENING_UNKNOWN } from "./map.mjs";

const STATEMENT_BUDGET = 200000; // statements executed in one run
const MAX_STEPS = 10000;
const MAX_WIDTH = 1024;
const MAX_TIME = 1e9;

const PRINTS = new Set(["$display", "$displayb", "$displayh", "$displayo", "$write", "$writeb", "$writeh", "$writeo", "$strobe", "$monitor",
  "$monitoron", "$monitoroff", "$timeformat", "$dumpfile", "$dumpvars", "$dumpon", "$dumpoff", "$info", "$warning", "$error"]);
const PURE_CALLS = new Set(["$time", "$stime", "$realtime"]);
const INCREMENTS = new Set(["Preincrement", "Postincrement", "Predecrement", "Postdecrement"]);
const REDUCE = new Set(["BitwiseAnd", "BitwiseOr", "BitwiseXor", "BitwiseNand", "BitwiseNor", "BitwiseXnor"]);
const UNARY = new Set(["Plus", "Minus", "BitwiseNot", "LogicalNot", ...REDUCE, ...INCREMENTS]);
const BITWISE = new Set(["BinaryAnd", "BinaryOr", "BinaryXor", "BinaryXnor"]);
const ARITHMETIC = new Set(["Add", "Subtract", "Multiply", "Divide", "Mod"]);
const COMPARE = new Set(["GreaterThan", "GreaterThanEqual", "LessThan", "LessThanEqual"]);
const EQUALITY = new Set(["Equality", "Inequality", "CaseEquality", "CaseInequality"]);
const SHIFTS = new Set(["LogicalShiftLeft", "LogicalShiftRight", "ArithmeticShiftLeft", "ArithmeticShiftRight"]);
const BINARY = new Set([...BITWISE, ...ARITHMETIC, ...COMPARE, ...EQUALITY, ...SHIFTS, "LogicalAnd", "LogicalOr"]);

/** Constructs whose names say more than slang's node kinds. */
const CONSTRUCTS = {
  SignalEvent: ["event control", "waiting for an edge (@) is not supported; use # delays"],
  EventList: ["event control", "waiting for an event (@) is not supported; use # delays"],
  ImplicitEvent: ["event control", "waiting for a change (@*) is not supported; use # delays"],
  Wait: ["wait", "wait is not supported; use # delays"],
  WaitFork: ["wait", "wait fork is not supported"],
  WhileLoop: ["while", "while loops are not supported; use for or repeat"],
  DoWhileLoop: ["do while", "do while loops are not supported; use for or repeat"],
  ForeachLoop: ["foreach", "foreach loops are not supported; use for"],
  Conditional: ["if", "an if that changes the stimulus is not supported (one that only prints is skipped)"],
  Case: ["case", "case statements are not supported in stimulus"],
  ProceduralAssign: ["procedural force or assign", "force and procedural assign are not supported in stimulus"],
  ProceduralDeassign: ["procedural force or assign", "release and deassign are not supported in stimulus"],
  ImmediateAssertion: ["assertion", "an assertion that does more than print is not supported"],
  EventTrigger: ["event trigger", "named events are not supported"],
};

/** Literal text to levels, least significant first; null if not understood. */
export function literalLevels(text, width) {
  let s = String(text).replace(/_/g, "").toLowerCase();
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  let out;
  const fill = /^'([01xz])$/.exec(s);
  const sized = /^(\d*)'s?([bodh])([0-9a-fxz?]+)$/.exec(s);
  const fromBig = (v, w) => [...Array(w)].map((_, i) => String((v >> BigInt(i)) & 1n));
  if (fill) out = Array(width).fill(fill[1].toUpperCase());
  else if (sized) {
    const digits = sized[3].replace(/\?/g, "z");
    const own = sized[1] ? Number(sized[1]) : width;
    if (own > MAX_WIDTH) return null;
    if (sized[2] === "d") {
      if (/^[xz]$/.test(digits)) out = Array(own).fill(digits.toUpperCase());
      else if (/^\d+$/.test(digits)) out = fromBig(BigInt(digits), own);
      else return null;
    } else {
      const per = { b: 1, o: 3, h: 4 }[sized[2]];
      out = [];
      for (const c of [...digits].reverse()) {
        if (c === "x" || c === "z") out.push(...Array(per).fill(c.toUpperCase()));
        else out.push(...fromBig(BigInt(`0x${c}`), per));
      }
      const top = out[out.length - 1];
      const pad = top === "X" || top === "Z" ? top : "0";
      while (out.length < own) out.push(pad);
      out.length = own;
    }
  } else if (/^\d+$/.test(s)) out = fromBig(BigInt(s), width);
  else return null;
  if (negative) {
    if (out.some((b) => b === "X" || b === "Z")) return null;
    out = fromBig(-toBig(out, false), out.length);
  }
  return out;
}

const known = (bits) => bits.every((b) => b === "0" || b === "1");
function toBig(bits, signed) {
  let v = 0n;
  for (let i = bits.length - 1; i >= 0; i--) v = (v << 1n) | (bits[i] === "1" ? 1n : 0n);
  if (signed && bits[bits.length - 1] === "1") v -= 1n << BigInt(bits.length);
  return v;
}
const big = (v, w) => [...Array(w)].map((_, i) => String((v >> BigInt(i)) & 1n));
const unknown = (w) => Array(w).fill("X");
const twoState = (type) => /^(bit|int|byte|shortint|longint)\b/.test(type ?? "");
/** Truth of a value: "1", "0" or "X" (no 1 and some unknown bit). */
const truth = (bits) => (bits.includes("1") ? "1" : known(bits) ? "0" : "X");
const inv = (b) => (b === "1" ? "0" : b === "0" ? "1" : "X");
const and = (a, b) => (a === "0" || b === "0" ? "0" : a === "1" && b === "1" ? "1" : "X");
const or = (a, b) => (a === "1" || b === "1" ? "1" : a === "0" && b === "0" ? "0" : "X");
const xor = (a, b) => ("01".includes(a) && "01".includes(b) ? (a === b ? "0" : "1") : "X");

class Refusal extends Error {
  constructor(node, construct, message) { super(message); this.node = node; this.construct = construct; }
}

/** Every Variable declared in a body, nested begin/end and for scopes included. */
function variablesOf(body) {
  const out = [];
  const visit = (list) => {
    for (const m of list ?? []) {
      if (m.kind === "Variable") out.push(m);
      else if (m.kind === "StatementBlock") visit(m.members);
    }
  };
  visit(body.members);
  return out;
}

/** Call `fn` on every node under `n` that has a kind. */
function walk(n, fn) {
  const todo = [n];
  while (todo.length) {
    const x = todo.pop();
    if (Array.isArray(x)) { todo.push(...x); continue; }
    if (!x || typeof x !== "object") continue;
    if (x.kind) fn(x);
    for (const v of Object.values(x)) if (v && typeof v === "object") todo.push(v);
  }
}

/**
 * Run the stimulus in `body` (a testbench InstanceBody) around `dut` (its one
 * Instance); `files` is the source text by name. Returns { inputs, steps, sources, problems, notes }: `inputs` are
 * the DUT's input bits (port ids, as the importer names them), `steps` are
 * scenario steps, and `sources[k][input]` is the statement that set it.
 */
export function runStimulus(body, dut, files) {
  const problems = [];
  const notes = [];
  const add = (list, node, construct, message) => {
    const p = { ...where(node), construct, message };
    if (!list.some((q) => q.line === p.line && q.column === p.column && q.construct === construct)) list.push(p);
  };
  const report = (node, construct, message) => add(problems, node, construct, message);
  const note = (node, construct, message) => add(notes, node, construct, message);
  const failed = () => ({ inputs: [], steps: [], sources: [], problems, notes });

  // ---- declarations ---------------------------------------------------------------

  const vars = new Map(); // symbol address -> { name, type, bits, twoState, initializer, lifetime, node }
  for (const m of variablesOf(body)) {
    const type = parseType(m.type);
    if (!type || type.width > MAX_WIDTH) { report(m, "type", `"${m.name}" has type ${m.type}; stimulus variables must be bit vectors (at most ${MAX_WIDTH} bits) or integers`); continue; }
    const two = twoState(m.type);
    vars.set(m.addr, { name: m.name, type, twoState: two, bits: Array(type.width).fill(two ? "0" : "X"), initializer: m.initializer, lifetime: m.lifetime, node: m });
  }
  const params = new Map();
  const collectParams = (list) => {
    for (const m of list ?? []) {
      if (m.kind === "Parameter") params.set(m.addr, m);
      else if (m.kind === "StatementBlock") collectParams(m.members);
    }
  };
  collectParams(body.members);

  // ---- the circuit's connections ----------------------------------------------------

  const driven = new Set(); // variables the circuit drives
  const inputPins = []; // { ids, expr, vars, at }
  for (const c of dut.connections ?? []) {
    const type = parseType(c.port?.type);
    if (!type) continue; // the importer reports it
    if (c.port.direction === "Out") {
      const left = c.expr?.kind === "Assignment" ? c.expr.left : c.expr;
      walk(left, (n) => { if (n.kind === "NamedValue") driven.add(symbolAddr(n.symbol)); });
    } else if (c.port.direction === "In") inputPins.push({ ids: bitIds(c.port.name, type), expr: c.expr ?? null, vars: new Set(), at: c.expr ?? dut });
  }

  // ---- static check: everything unsupported, whether or not it would run ------------

  function checkExpr(e) {
    const kind = e?.kind;
    const bad = (construct, message) => report(e, construct, message);
    if (kind !== "Assignment" && kind !== "Call") {
      const t = parseType(e?.type);
      if (kind === "RealLiteral" || kind === "TimeLiteral") return bad("real number", "only whole numbers without a unit are supported");
      if (!t || t.width > MAX_WIDTH) return bad(kind === "Call" ? "call" : "type", `an expression of type ${e?.type} is not supported in stimulus`);
    }
    switch (kind) {
      case "NamedValue": {
        const addr = symbolAddr(e.symbol);
        if (driven.has(addr)) return bad("reads the circuit", `the stimulus depends on "${symbolName(e.symbol)}", which the circuit drives; only stimulus fixed in advance is supported`);
        if (!vars.has(addr) && !params.has(addr)) return bad("name", `"${symbolName(e.symbol)}" is not a variable or parameter of the testbench`);
        return;
      }
      case "IntegerLiteral": case "UnbasedUnsizedIntegerLiteral":
        if (!literalLevels(e.value, parseType(e.type).width)) bad("literal", `the literal ${e.value} is not supported`);
        return;
      case "LValueReference": return;
      case "Conversion": return checkExpr(e.operand);
      case "Concatenation": return e.operands.forEach(checkExpr);
      case "Replication": checkExpr(e.count); checkExpr(e.concat); return;
      case "ElementSelect": checkExpr(e.value); checkExpr(e.selector); return;
      case "RangeSelect":
        if (!["Simple", "IndexedUp", "IndexedDown"].includes(e.selectionKind)) return bad("part select", `part select ${e.selectionKind} is not supported`);
        checkExpr(e.value); checkExpr(e.left); checkExpr(e.right);
        return;
      case "UnaryOp":
        if (!UNARY.has(e.op)) return bad(`operator ${e.op}`, `the ${e.op} operator is not supported in stimulus`);
        if (INCREMENTS.has(e.op)) return bad("increment in an expression", "++ and -- are supported only as statements of their own");
        return checkExpr(e.operand);
      case "BinaryOp":
        if (!BINARY.has(e.op)) return bad(`operator ${e.op}`, `the ${e.op} operator is not supported in stimulus`);
        checkExpr(e.left); checkExpr(e.right);
        return;
      case "ConditionalOp":
        if ((e.conditions ?? []).length !== 1 || e.conditions[0].pattern) return bad("conditional", "a ?: condition must be one expression");
        checkExpr(e.conditions[0].expr); checkExpr(e.left); checkExpr(e.right);
        return;
      case "Assignment": return bad("assignment in an expression", "an assignment is supported only as a statement of its own");
      case "Call": return bad(`call ${callName(e)}`, `${callName(e)} is not supported in stimulus`);
      default: bad(kind ?? "expression", `${kind ?? "this expression"} is not supported in stimulus`);
    }
  }

  const callName = (e) => (typeof e.subroutine === "string" ? e.subroutine : e.subroutine?.name ?? "this call").replace(/^\d+ /, "");

  function checkTarget(e) {
    switch (e?.kind) {
      case "NamedValue": {
        const addr = symbolAddr(e.symbol);
        if (driven.has(addr)) report(e, "drives an output", `"${symbolName(e.symbol)}" is driven by the circuit; the stimulus cannot assign it`);
        else if (!vars.has(addr)) report(e, "name", `"${symbolName(e.symbol)}" is not a variable of the testbench`);
        return;
      }
      case "ElementSelect": checkTarget(e.value); checkExpr(e.selector); return;
      case "RangeSelect": checkTarget(e.value); checkExpr(e.left); checkExpr(e.right); return;
      case "Concatenation": e.operands.forEach(checkTarget); return;
      default: report(e, e?.kind ?? "assignment", `${e?.kind ?? "this"} cannot be assigned to here`);
    }
  }

  function checkAssignment(e) {
    if (e.kind === "UnaryOp" && INCREMENTS.has(e.op)) return checkTarget(e.operand);
    if (e.isNonBlocking) return report(e, "nonblocking assignment", "<= is not supported in stimulus; use = and keep changes away from clock edges with # delays");
    if (e.timingControl) return report(e, "intra-assignment delay", "a delay inside an assignment is not supported; put the # delay before the statement");
    checkTarget(e.left);
    checkExpr(e.right);
  }
  const isAssignment = (e) => e?.kind === "Assignment" || (e?.kind === "UnaryOp" && INCREMENTS.has(e.op));
  const isEnd = (e) => e?.kind === "Call" && ["$finish", "$stop"].includes(callName(e));

  /** No side effects anywhere under `n` (the output arguments of calls count as side effects). */
  function pure(n) {
    let ok = true;
    walk(n, (x) => {
      if (x.kind === "Assignment" || (x.kind === "UnaryOp" && INCREMENTS.has(x.op))) ok = false;
      if (x.kind === "Call" && !PURE_CALLS.has(callName(x))) ok = false;
    });
    return ok;
  }

  /** A statement that only prints or checks, so it cannot change the stimulus. */
  function printOnly(s) {
    if (!s) return true;
    switch (s.kind) {
      case "Empty": return true;
      case "List": return s.list.every(printOnly);
      case "Block": return s.blockKind === "Sequential" && printOnly(s.body);
      case "ExpressionStatement": return s.expr?.kind === "Call" && PRINTS.has(callName(s.expr)) && pure(s.expr.arguments ?? []);
      case "Conditional": return (s.conditions ?? []).every((c) => pure(c)) && printOnly(s.ifTrue) && printOnly(s.ifFalse);
      case "ImmediateAssertion": return pure(s.cond) && printOnly(s.ifTrue) && printOnly(s.ifFalse);
      default: return false;
    }
  }

  function checkDelay(timing) {
    if (timing?.kind !== "Delay") {
      const [construct, message] = CONSTRUCTS[timing?.kind] ?? [timing?.kind ?? "timing", `${timing?.kind ?? "this timing control"} is not supported; use # delays`];
      return report(timing, construct, message);
    }
    if (["RealLiteral", "TimeLiteral"].includes(timing.expr?.kind)) return report(timing, "delay", "a delay must be a whole number of time units, without a unit or a fraction");
    checkExpr(timing.expr);
  }

  function checkStatement(s) {
    if (!s) return;
    switch (s.kind) {
      case "Empty": return;
      case "List": s.list.forEach(checkStatement); return;
      case "Block":
        if (s.blockKind !== "Sequential") return report(s, "fork", "fork and join are not supported; use separate initial blocks");
        return checkStatement(s.body);
      case "Timed": checkDelay(s.timing); checkStatement(s.stmt); return;
      case "VariableDeclaration": {
        const v = vars.get(symbolAddr(s.symbol));
        if (v?.lifetime === "Automatic" && v.initializer) checkExpr(v.initializer);
        return;
      }
      case "ForLoop":
        if (s.loopVars?.length) return report(s, "for", "this form of for loop is not supported");
        for (const e of [...(s.initializers ?? []), ...(s.steps ?? [])]) {
          if (isAssignment(e)) checkAssignment(e); else report(e, "for", "a for loop's start and step must be assignments");
        }
        if (s.stopExpr) checkExpr(s.stopExpr);
        return checkStatement(s.body);
      case "RepeatLoop": checkExpr(s.count); return checkStatement(s.body);
      case "ForeverLoop": return checkStatement(s.body);
      case "ExpressionStatement": {
        const e = s.expr;
        if (isAssignment(e)) return checkAssignment(e);
        if (isEnd(e)) return;
        if (printOnly(s)) return note(s, callName(e), "prints only; it does not change the stimulus, so it is skipped");
        if (e?.kind === "Call") return report(e, `call ${callName(e)}`, PRINTS.has(callName(e)) ? `${callName(e)} has an argument with a side effect` : `${callName(e)} is not supported in stimulus`);
        return report(e, e?.kind ?? "statement", `${e?.kind ?? "this statement"} is not supported in stimulus`);
      }
      case "Conditional": case "ImmediateAssertion":
        if (printOnly(s)) return note(s, s.kind === "Conditional" ? "if" : "assertion", "checks and prints only; it does not change the stimulus, so it is skipped");
      // falls through
      default: {
        const [construct, message] = CONSTRUCTS[s.kind] ?? [s.kind, `${s.kind} is not supported in stimulus`];
        report(s, construct, message);
      }
    }
  }

  const processes = [];
  for (const m of body.members ?? []) {
    switch (m.kind) {
      case "Port": report(m, "testbench port", `the testbench has a port "${m.name}"; a testbench has none`); break;
      case "ProceduralBlock":
        if (m.procedureKind === "Initial" || m.procedureKind === "Always") {
          processes.push({ node: m, always: m.procedureKind === "Always" });
          checkStatement(m.body);
        } else if (m.procedureKind === "Final" && printOnly(m.body)) note(m, "final", "prints only; it does not change the stimulus, so it is skipped");
        else report(m, String(m.procedureKind).toLowerCase(), `${m.procedureKind} blocks are not supported in a testbench; use initial and always`);
        break;
      case "ContinuousAssign": report(m, "continuous assignment", "assign is not supported in a testbench; assign the variable in an initial block"); break;
      case "Net":
        if (m.initializer) report(m, "continuous assignment", `the net "${m.name}" has a driver; use a variable assigned in an initial block`);
        break;
      case "Instance": case "Variable": case "Parameter": case "StatementBlock": case "TypeAlias": case "Genvar":
      case "Subroutine": case "TimeUnits": break; // a task or function is refused where it is called
      default: report(m, m.kind, `${m.kind} is not supported in a testbench`);
    }
  }
  for (const v of vars.values()) {
    if (!v.initializer || v.lifetime === "Automatic") continue;
    let reads = null;
    walk(v.initializer, (n) => { if (n.kind === "NamedValue" && !params.has(symbolAddr(n.symbol))) reads = n; });
    if (reads) report(reads, "initial value", `the initial value of "${v.name}" depends on another variable`);
    else checkExpr(v.initializer);
  }
  for (const p of inputPins) {
    if (!p.expr) continue;
    checkExpr(p.expr);
    walk(p.expr, (n) => { if (n.kind === "NamedValue" && vars.has(symbolAddr(n.symbol))) p.vars.add(symbolAddr(n.symbol)); });
  }
  if (inputPins.length === 0) report(dut, "no inputs", `${dut.name} has no inputs to drive`);
  if (processes.length === 0) report(body, "no stimulus", "the testbench has no initial or always block");
  if (problems.length) return failed();

  // ---- evaluation ---------------------------------------------------------------------

  let current = null; // the running process; null outside one
  let now = 0;
  let touched = new Map(); // "addr:bit" -> { reads: Set, writes: [{ proc, value, node, changed }], first, changes }
  let lastWrite = new Map(); // addr -> the last statement that wrote it this instant
  const inputVars = new Set(inputPins.flatMap((p) => [...p.vars]));

  const race = (node, v, other) => new Refusal(node, "race", `two blocks use "${v.name}" at time ${now} (also line ${where(other).line}); SystemVerilog does not fix their order, so add a # delay to one`);
  const slotOf = (addr, i) => {
    const key = `${addr}:${i}`;
    if (!touched.has(key)) touched.set(key, { reads: [], writes: [], changes: 0 });
    return touched.get(key);
  };
  function readBit(addr, i, node) {
    const v = vars.get(addr);
    if (current) {
      const slot = slotOf(addr, i);
      const w = slot.writes.find((x) => x.proc !== current && x.changed);
      if (w) throw race(node, v, w.node);
      if (!slot.reads.some((r) => r.proc === current)) slot.reads.push({ proc: current, node });
    }
    return v.bits[i];
  }
  function writeBit(addr, i, value, node) {
    const v = vars.get(addr);
    const level = v.twoState && value !== "1" ? "0" : value;
    const changed = v.bits[i] !== level;
    if (current) {
      const slot = slotOf(addr, i);
      const w = slot.writes.find((x) => x.proc !== current && x.value !== level);
      if (w) throw race(node, v, w.node);
      const r = changed && slot.reads.find((x) => x.proc !== current);
      if (r) throw race(node, v, r.node);
      if (changed) slot.changes++;
      slot.writes.push({ proc: current, value: level, node, changed });
      if (now > 0 && slot.changes > 1 && inputVars.has(addr)) {
        throw new Refusal(node, "zero-width pulse", `"${v.name}" changes more than once at time ${now}; add a # delay between the changes`);
      }
      lastWrite.set(addr, node);
    }
    v.bits[i] = level;
  }

  const indexIn = (type, i) => {
    const k = type.ascending ? type.lsb - i : i - type.lsb;
    return k >= 0 && k < type.width ? k : null;
  };
  const intOf = (e) => {
    const bits = evaluate(e);
    return known(bits) ? Number(toBig(bits, parseType(e.type).signed)) : null;
  };
  /** The bit positions (in the selected value) a select names, least significant first; null where out of range or unknown. */
  function positions(e) {
    const type = parseType(e.value.type);
    if (e.kind === "ElementSelect") {
      const i = intOf(e.selector);
      return [i === null ? null : indexIn(type, i)];
    }
    const l = intOf(e.left), r = intOf(e.right);
    const w = parseType(e.type).width;
    if (l === null || r === null) return Array(w).fill(null);
    // Position of the least significant selected bit, then count upwards.
    let low;
    if (e.selectionKind === "Simple") low = type.ascending ? type.lsb - r : r - type.lsb;
    else {
      const other = e.selectionKind === "IndexedUp" ? l + r - 1 : l - r + 1;
      const [lo, hi] = [Math.min(l, other), Math.max(l, other)];
      low = type.ascending ? type.lsb - hi : lo - type.lsb;
    }
    return [...Array(w)].map((_, i) => (low + i >= 0 && low + i < type.width ? low + i : null));
  }

  function evaluate(e) {
    const type = parseType(e.type);
    const w = type.width;
    switch (e.kind) {
      case "NamedValue": {
        const addr = symbolAddr(e.symbol);
        if (vars.has(addr)) return vars.get(addr).bits.map((_, i) => readBit(addr, i, e));
        const bits = literalLevels(params.get(addr).value, w);
        if (!bits) throw new Refusal(e, "parameter", `parameter ${symbolName(e.symbol)} = ${params.get(addr).value} is not a whole number`);
        return convert(bits, e.type, type.signed);
      }
      case "IntegerLiteral": case "UnbasedUnsizedIntegerLiteral": return convert(literalLevels(e.value, w), e.type, type.signed);
      case "LValueReference": return compound.value;
      case "Conversion": {
        const bits = evaluate(e.operand);
        const how = bits.length < w ? widening(e, files) : "zero";
        if (how === null) throw new Refusal(e, "sign extension", WIDENING_UNKNOWN);
        return convert(bits, e.type, how === "sign");
      }
      case "Concatenation": return [...e.operands].reverse().flatMap(evaluate);
      case "Replication": {
        const part = evaluate(e.concat);
        return [...Array(Math.floor(w / Math.max(part.length, 1)))].flatMap(() => part);
      }
      case "ElementSelect": case "RangeSelect": {
        const at = positions(e);
        if (e.value.kind === "NamedValue" && vars.has(symbolAddr(e.value.symbol))) {
          const addr = symbolAddr(e.value.symbol);
          return at.map((i) => (i === null ? "X" : readBit(addr, i, e)));
        }
        const bits = evaluate(e.value);
        return at.map((i) => (i === null ? "X" : bits[i]));
      }
      case "UnaryOp": return unary(e, evaluate(e.operand), w);
      case "BinaryOp": return binary(e, w);
      case "ConditionalOp": {
        const c = truth(evaluate(e.conditions[0].expr));
        if (c === "1") return evaluate(e.left);
        if (c === "0") return evaluate(e.right);
        const [a, b] = [evaluate(e.left), evaluate(e.right)];
        return a.map((x, i) => (x === b[i] && "01".includes(x) ? x : "X"));
      }
      default: throw new Refusal(e, e.kind, `${e.kind} is not supported in stimulus`);
    }
  }

  /** Bits cut or widened to type `to` (by the sign or with zeros); 2-state types turn x and z into 0. */
  function convert(bits, to, signed) {
    const { width: w } = parseType(to);
    let out = bits.slice(0, w);
    if (out.length < w) out = [...out, ...Array(w - out.length).fill(signed ? bits[bits.length - 1] : "0")];
    return twoState(to) ? out.map((b) => (b === "1" ? "1" : "0")) : out;
  }

  function unary(e, a, w) {
    switch (e.op) {
      case "Plus": return known(a) ? a : unknown(w);
      case "Minus": return known(a) ? big(-toBig(a, false), w) : unknown(w);
      case "BitwiseNot": return a.map(inv);
      case "LogicalNot": return [inv(truth(a))];
      case "BitwiseAnd": return [a.reduce(and, "1")];
      case "BitwiseNand": return [inv(a.reduce(and, "1"))];
      case "BitwiseOr": return [a.reduce(or, "0")];
      case "BitwiseNor": return [inv(a.reduce(or, "0"))];
      case "BitwiseXor": return [a.reduce(xor, "0")];
      default: return [inv(a.reduce(xor, "0"))]; // BitwiseXnor
    }
  }

  function binary(e, w) {
    if (e.op === "LogicalAnd" || e.op === "LogicalOr") {
      // Short circuit, as the language does (nothing here has side effects, so only races notice).
      const a = truth(evaluate(e.left));
      if (e.op === "LogicalAnd") return [a === "0" ? "0" : and(a, truth(evaluate(e.right)))];
      return [a === "1" ? "1" : or(a, truth(evaluate(e.right)))];
    }
    const a = evaluate(e.left);
    const b = evaluate(e.right);
    const signed = parseType(e.left.type).signed && parseType(e.right.type).signed;
    if (BITWISE.has(e.op)) {
      const f = { BinaryAnd: and, BinaryOr: or, BinaryXor: xor, BinaryXnor: (x, y) => inv(xor(x, y)) }[e.op];
      return a.map((x, i) => f(x, b[i]));
    }
    if (e.op === "CaseEquality" || e.op === "CaseInequality") return [(a.join() === b.join()) === (e.op === "CaseEquality") ? "1" : "0"];
    if (e.op === "Equality" || e.op === "Inequality") {
      // Unknown only when no known pair of bits already differs.
      const differ = a.some((x, i) => "01".includes(x) && "01".includes(b[i]) && x !== b[i]);
      const same = differ ? "0" : known(a) && known(b) ? "1" : "X";
      return [e.op === "Equality" ? same : inv(same)];
    }
    if (SHIFTS.has(e.op)) {
      if (!known(b)) return unknown(w);
      const by = toBig(b, false);
      const n = by > BigInt(a.length) ? a.length : Number(by);
      if (/Left/.test(e.op)) return [...Array(n).fill("0"), ...a].slice(0, w);
      const fill = e.op === "ArithmeticShiftRight" && parseType(e.type).signed ? a[a.length - 1] : "0";
      return [...a.slice(n), ...Array(n).fill(fill)];
    }
    if (!known(a) || !known(b)) return COMPARE.has(e.op) ? ["X"] : unknown(w);
    const [x, y] = [toBig(a, signed), toBig(b, signed)];
    switch (e.op) {
      case "Add": return big(x + y, w);
      case "Subtract": return big(x - y, w);
      case "Multiply": return big(x * y, w);
      case "Divide": return y === 0n ? unknown(w) : big(x / y, w);
      case "Mod": return y === 0n ? unknown(w) : big(x % y, w);
      case "GreaterThan": return [x > y ? "1" : "0"];
      case "GreaterThanEqual": return [x >= y ? "1" : "0"];
      case "LessThan": return [x < y ? "1" : "0"];
      default: return [x <= y ? "1" : "0"]; // LessThanEqual
    }
  }

  /** The bits an assignment target names, least significant first: [address, bit], or null when out of range. */
  function target(e) {
    if (e.kind === "NamedValue") return vars.get(symbolAddr(e.symbol)).bits.map((_, i) => [symbolAddr(e.symbol), i]);
    if (e.kind === "Concatenation") return [...e.operands].reverse().flatMap(target);
    const inner = target(e.value);
    return positions(e).map((i) => (i === null ? null : inner[i]));
  }

  let compound = null; // the left-hand value inside a compound assignment (+=)
  function assign(e) {
    if (e.kind === "UnaryOp") {
      const bits = evaluate(e.operand);
      const step = /increment/.test(e.op) ? 1n : -1n;
      const value = known(bits) ? big(toBig(bits, false) + step, bits.length) : unknown(bits.length);
      target(e.operand).forEach((t, i) => { if (t) writeBit(t[0], t[1], value[i], e); });
      return;
    }
    const outer = compound;
    if (e.op) compound = { value: evaluate(e.left) };
    const value = evaluate(e.right);
    compound = outer;
    target(e.left).forEach((t, i) => { if (t) writeBit(t[0], t[1], value[i], e); });
  }

  // ---- execution -------------------------------------------------------------------------

  const FINISH = Symbol("finish");
  let budget = STATEMENT_BUDGET;
  const spend = (node) => {
    if (--budget < 0) throw new Refusal(node, "too long", `the stimulus did not end within ${STATEMENT_BUDGET} statements (a loop without a # delay?)`);
  };

  /** Run a statement: yields delays, returns FINISH after $finish or $stop. */
  function* execute(s, proc) {
    if (!s) return undefined;
    spend(s);
    switch (s.kind) {
      case "List":
        for (const x of s.list) if ((yield* execute(x, proc)) === FINISH) return FINISH;
        return undefined;
      case "Block": return yield* execute(s.body, proc);
      case "Timed": {
        const n = intOf(s.timing.expr);
        if (n === null) throw new Refusal(s.timing, "delay", "this delay is x or z when it is reached");
        if (n === 0) throw new Refusal(s.timing, "delay", "a zero delay is not supported; it only reorders events at one instant");
        if (n < 0 || now + n > MAX_TIME) throw new Refusal(s.timing, "delay", `the delay ${n} is ${n < 0 ? "negative" : "too long"}`);
        yield n;
        return yield* execute(s.stmt, proc);
      }
      case "VariableDeclaration": {
        const addr = symbolAddr(s.symbol);
        const v = vars.get(addr);
        if (v?.lifetime === "Automatic") {
          const value = v.initializer ? evaluate(v.initializer) : v.bits.map(() => (v.twoState ? "0" : "X"));
          value.forEach((b, i) => writeBit(addr, i, b, s));
        }
        return undefined;
      }
      case "ForLoop":
        (s.initializers ?? []).forEach(assign);
        while (!s.stopExpr || truth(evaluate(s.stopExpr)) === "1") {
          spend(s);
          if ((yield* execute(s.body, proc)) === FINISH) return FINISH;
          (s.steps ?? []).forEach(assign);
        }
        return undefined;
      case "RepeatLoop": {
        const n = intOf(s.count) ?? 0; // an unknown or negative count repeats zero times
        for (let i = 0; i < n; i++) {
          spend(s);
          if ((yield* execute(s.body, proc)) === FINISH) return FINISH;
        }
        return undefined;
      }
      case "ForeverLoop":
        for (;;) {
          spend(s);
          if ((yield* execute(s.body, proc)) === FINISH) return FINISH;
          proc.endless = s;
        }
      case "ExpressionStatement":
        if (isEnd(s.expr)) return FINISH;
        if (isAssignment(s.expr)) assign(s.expr);
        return undefined;
      default: return undefined; // Empty, and what checkStatement listed as skipped
    }
  }
  function* alwaysRun(node, proc) {
    for (;;) {
      spend(node);
      if ((yield* execute(node.body, proc)) === FINISH) return FINISH;
      proc.endless = node;
    }
  }

  const inputs = [];
  for (const p of inputPins) inputs.push(...[...p.ids].reverse());
  /** Every DUT input's level now; an unconnected input floats. */
  const sample = () => {
    const out = {};
    for (const p of inputPins) {
      const bits = p.expr ? evaluate(p.expr) : Array(p.ids.length).fill("Z");
      p.ids.forEach((id, i) => { out[id] = bits[i] ?? "0"; });
    }
    return out;
  };
  const sourceOf = (id) => {
    const p = inputPins.find((x) => x.ids.includes(id));
    let best = null;
    for (const v of p.vars) if (lastWrite.has(v)) best = lastWrite.get(v);
    return best ?? p.at;
  };

  const instants = []; // { t, values, sources } at every change
  let end = null;
  let finished = null;
  try {
    for (const v of vars.values()) {
      if (v.initializer && v.lifetime !== "Automatic") {
        v.bits = evaluate(v.initializer);
        if (v.twoState) v.bits = v.bits.map((b) => (b === "1" ? "1" : "0"));
      }
    }
    for (const p of processes) {
      p.at = 0;
      p.run = p.always ? alwaysRun(p.node, p) : execute(p.node.body, p);
    }
    let live = [...processes];
    let before = null;
    while (live.length) {
      now = Math.min(...live.map((p) => p.at));
      touched = new Map();
      lastWrite = new Map();
      for (const p of live.filter((x) => x.at === now)) {
        current = p;
        const r = p.run.next();
        current = null;
        if (r.done) { p.done = true; if (r.value === FINISH) { finished = p; break; } } else p.at = now + r.value;
      }
      if (finished) { end = now; break; }
      const values = sample();
      const changed = inputs.filter((id) => before === null || values[id] !== before[id]);
      if (changed.length) {
        if (instants.length >= MAX_STEPS) throw new Refusal(body, "too long", `the stimulus has more than ${MAX_STEPS} changes`);
        instants.push({ t: now, values: Object.fromEntries(changed.map((id) => [id, values[id]])), sources: Object.fromEntries(changed.map((id) => [id, sourceOf(id)])) });
        before = values;
      }
      live = live.filter((p) => !p.done);
      const endless = live.find((p) => p.endless);
      if (live.length && live.every((p) => p.endless)) {
        throw new Refusal(endless.endless, "never ends", "this block repeats forever and nothing calls $finish; add $finish to an initial block");
      }
    }
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    report(err.node, err.construct, err.message);
    return failed();
  }

  if (finished) {
    const unseen = [...touched.values()].flatMap((s) => s.writes).filter((w) => w.changed && w.proc === finished && end > 0);
    const shown = unseen.find((w) => inputPins.some((p) => [...p.vars].some((v) => lastWrite.get(v) === w.node)));
    if (shown) note(shown.node, "change at the end", `this changes an input at time ${end}, when the run ends, so it lasts no time and is not in the scenario`);
  } else {
    end = now;
    const last = instants[instants.length - 1];
    if (last && last.t === end) {
      end += 1;
      note(Object.values(last.sources)[0], "held for one unit", `nothing follows the last change at time ${last.t}; its values are held for 1 time unit (add a # delay to choose how long)`);
    }
  }
  if (end === 0 || instants.length === 0 || processes.every((p) => printOnly(p.node.body))) {
    report(body, "no stimulus", "the testbench changes no input over time");
    return failed();
  }

  const steps = instants.map((x, k) => ({ duration: (instants[k + 1]?.t ?? end) - x.t, values: x.values }));
  return { inputs, steps, sources: instants.map((x) => x.sources), problems, notes };
}
