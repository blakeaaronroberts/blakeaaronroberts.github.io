// SystemVerilog to `circuit`: maps slang's elaborated AST (structural modules)
// and Yosys netlists (behavioural modules) to circuit/0.3, or circuit/0.4 when
// the design has module instances. No file access; the engines are passed in.
//
// The supported subset and the mapping are in import/sv/README.md and
// DECISIONS.md (2026-11-23). Anything outside it is reported with its file,
// line and column, and nothing is guessed: any report means no circuit.

import { layoutBody } from "../layout.mjs";
import { analyze } from "../../analyze/combinational.mjs";

const ID = /^[A-Za-z][A-Za-z0-9_]*$/;
const PRIMITIVES = { and: "and_gate", or: "or_gate", nand: "nand_gate", nor: "nor_gate", xor: "xor_gate", xnor: "xnor", not: "not", buf: "buf" };
const NAMED_TYPES = { int: [32, true], integer: [32, true], byte: [8, true], shortint: [16, true], longint: [64, true] };

/** "logic[3:0]" -> { msb, lsb, width, signed }; null if not a plain bit vector. */
export function parseType(t) {
  if (t in NAMED_TYPES) return { msb: NAMED_TYPES[t][0] - 1, lsb: 0, width: NAMED_TYPES[t][0], signed: NAMED_TYPES[t][1] };
  const m = /^(logic|bit|reg|wire)?( signed| unsigned)?(?:\[(-?\d+):(-?\d+)\])?$/.exec(t ?? "");
  if (!m || (!m[1] && m[3] === undefined)) return null;
  const msb = m[3] === undefined ? 0 : Number(m[3]);
  const lsb = m[4] === undefined ? 0 : Number(m[4]);
  return { msb, lsb, width: Math.abs(msb - lsb) + 1, signed: m[2] === " signed", ascending: msb < lsb, ranged: m[3] !== undefined };
}

/** Bit ids of a declaration, least significant first: "a" for one bit, else "a3" ... "a0". */
export const bitIds = (name, t) => (t.ranged && t.width > 1 ? [...Array(t.width)].map((_, i) => `${name}${t.lsb + i}`) : [name]);

export const where = (n) => ({
  file: (n?.source_file ?? n?.source_file_start ?? null)?.replace(/^.*[\\/]/, "") ?? null,
  line: n?.source_line ?? n?.source_line_start ?? null,
  column: n?.source_column ?? n?.source_column_start ?? null,
});
export const symbolName = (s) => String(s).slice(String(s).indexOf(" ") + 1);
/**
 * How a Conversion node widens its operand: "sign", "zero", or null when it
 * cannot be told (the caller refuses). An operand of an expression that is
 * unsigned as a whole is widened with zeros, even a signed one (IEEE 1800-2023
 * 11.8.2); a cast to an unsigned type widens by the sign of what it casts.
 * slang's AST writes both as one node, so the source decides: a widening the
 * author did not write has the same source range as its operand. Inside a
 * macro every range is the macro's, so there it cannot be told.
 */
export function widening(e, files) {
  const [from, to] = [parseType(e.operand.type), parseType(e.type)];
  if (!from?.signed) return "zero";
  if (to?.signed) return "sign";
  const range = (n) => [n.source_file_start, n.source_line_start, n.source_column_start, n.source_file_end, n.source_line_end, n.source_column_end];
  const [a, b] = [range(e), range(e.operand)];
  if (a.includes(undefined) || a.some((x, i) => x !== b[i])) return null;
  const { file, line, column } = where(e);
  const start = files?.[file]?.split(/\r\n|\n|\r/)[line - 1]?.[column - 1];
  return start === undefined || start === "`" ? null : "zero";
}
export const WIDENING_UNKNOWN = "a signed value is widened by a cast to an unsigned type or inside a macro, where its extension cannot be told; write the widening out (for example with a signed variable of the full width)";
export const symbolAddr = (s) => Number(String(s).split(" ")[0]);

/** A literal's bits, least significant first; null if it holds x or z. */
function literalBits(text, width) {
  const negative = /^-\d*'/.test(text); // slang prints 2'sb10 as -2'sd2
  const s = String(text).replace(/_/g, "").slice(negative ? 1 : 0);
  let value;
  const sized = /^(\d*)'(s?)([bodh])(.+)$/i.exec(s);
  const unsized = /^'([01xz])$/i.exec(s);
  if (unsized) {
    if (/[xz]/i.test(unsized[1])) return null;
    return Array(width).fill(unsized[1]);
  } else if (sized) {
    if (/[xz?]/i.test(sized[4])) return null;
    value = BigInt({ b: "0b", o: "0o", d: "", h: "0x" }[sized[3].toLowerCase()] + sized[4]);
    if (negative) value = (1n << BigInt(width)) - value;
  } else if (/^-?\d+$/.test(s)) {
    value = BigInt(s);
    if (value < 0n) value = (1n << BigInt(width)) + value;
  } else return null;
  return [...Array(width)].map((_, i) => String((value >> BigInt(i)) & 1n));
}

/**
 * Nodes joined by wires (union-find), with the refs on each: what becomes the
 * nets of one body. Shared by the structural and the Yosys paths.
 */
class Netlist {
  constructor(report) {
    this.parent = [];
    this.info = [];
    this.elements = [];
    this.ids = new Set();
    this.report = report;
    this.consts = {};
    this.counters = {};
  }
  node() { const n = this.parent.length; this.parent.push(n); this.info.push({ names: [], drivers: [], sinks: [] }); return n; }
  find(n) { let r = n; while (this.parent[r] !== r) r = this.parent[r]; while (this.parent[n] !== r) { const x = this.parent[n]; this.parent[n] = r; n = x; } return r; }
  union(a, b) { const [x, y] = [this.find(a), this.find(b)]; if (x !== y) this.parent[Math.max(x, y)] = Math.min(x, y); }
  name(n, name, rank, order) { this.info[n].names.push({ name, rank, order }); }
  drive(n, ref, at) { this.info[n].drivers.push({ ref, at }); }
  sink(n, ref) { this.info[n].sinks.push(ref); }
  reserve(id, at) {
    if (!ID.test(id)) { this.report(at, "name", `"${id}" is not a name a circuit can use (a letter, then letters, digits or _)`); return false; }
    if (this.ids.has(id)) { this.report(at, "name", `two things in this module would both be called "${id}"`); return false; }
    this.ids.add(id);
    return true;
  }
  fresh(base) {
    let k = this.counters[base] ?? 0;
    let id;
    do id = `${base}${++k}`; while (this.ids.has(id));
    this.counters[base] = k;
    this.ids.add(id);
    return id;
  }
  /** Place an element: inputs { pin: node }, outputs [pin] -> { pin: node }. */
  element(id, type, inputs, outputs, at, params) {
    const e = { id, type, at: [0, 0] };
    if (params) e.params = params;
    this.elements.push(e);
    for (const [pin, n] of Object.entries(inputs)) if (n !== null && n !== undefined) this.sink(n, `${id}.${pin}`);
    const out = {};
    for (const pin of outputs) { out[pin] = this.node(); this.drive(out[pin], `${id}.${pin}`, at); }
    return out;
  }
  gate(type, inputs, at, id) {
    const pins = type === "not_gate" ? ["A"] : ["A", "B"];
    const gid = id ?? this.fresh(type.replace(/_gate$/, ""));
    return this.element(gid, type, Object.fromEntries(pins.map((p, i) => [p, inputs[i]])), ["Y"], at).Y;
  }
  mux(i0, i1, s, at) { return this.element(this.fresh("mux"), "mux2", { I0: i0, I1: i1, S: s }, ["Y"], at).Y; }
  constant(v, at) {
    if (this.consts[v] === undefined) {
      const id = this.fresh(v === "1" ? "vdd" : "gnd");
      this.consts[v] = this.element(id, v === "1" ? "vdd" : "ground", {}, ["1"], at)[1];
    }
    return this.consts[v];
  }
  /** A balanced tree of 2-input gates of `type`; `last` replaces the type of the final gate. */
  tree(type, nodes, at, id, last = type) {
    if (nodes.length === 1) return last === type ? nodes[0] : this.gate("not_gate", [nodes[0]], at, id);
    const mid = Math.ceil(nodes.length / 2);
    const a = this.tree(type, nodes.slice(0, mid), at);
    const b = this.tree(type, nodes.slice(mid), at);
    return this.gate(last, [a, b], at, id);
  }
  /** Reduce bits with an operator: and, or, xor, nand, nor, xnor. */
  reduce(op, nodes, at, id) {
    const base = { and: "and_gate", or: "or_gate", xor: "xor_gate", nand: "and_gate", nor: "or_gate", xnor: "xor_gate" }[op];
    if (op === "xnor") {
      const x = this.tree("xor_gate", nodes, at);
      return this.gate("not_gate", [x], at, id);
    }
    const last = op === "nand" ? "nand_gate" : op === "nor" ? "nor_gate" : base;
    if (nodes.length === 1 && last !== base) return this.gate("not_gate", nodes, at, id);
    return this.tree(base, nodes, at, id, last);
  }
  /** The body's nets, plus a report for every net with two drivers. */
  nets() {
    const classes = new Map();
    this.info.forEach((inf, n) => {
      const r = this.find(n);
      if (!classes.has(r)) classes.set(r, { names: [], drivers: [], refs: [] });
      const c = classes.get(r);
      c.names.push(...inf.names);
      c.drivers.push(...inf.drivers);
      c.refs.push(...inf.drivers.map((d) => d.ref), ...inf.sinks);
    });
    const taken = new Set();
    const nets = {};
    const unnamed = [];
    for (const c of classes.values()) {
      if (c.refs.length === 0) continue;
      if (c.drivers.length > 1) {
        this.report(c.drivers[1].at, "multiple drivers", `${c.drivers.map((d) => d.ref).join(" and ")} drive the same net`);
      }
      c.names.sort((a, b) => a.rank - b.rank || a.order - b.order);
      const name = c.names.map((x) => x.name).find((x) => !taken.has(x));
      if (name === undefined) { unnamed.push(c); continue; }
      taken.add(name);
      nets[name] = [...new Set(c.refs)];
    }
    let k = 0;
    for (const c of unnamed) {
      let name;
      do name = `n${++k}`; while (taken.has(name));
      taken.add(name);
      nets[name] = [...new Set(c.refs)];
    }
    return nets;
  }
}

/** Every InstanceBody in the AST, by address (later instances refer to earlier bodies by address). */
function bodies(ast) {
  const byAddr = new Map();
  const todo = [ast];
  while (todo.length) {
    const n = todo.pop();
    if (Array.isArray(n)) { todo.push(...n); continue; }
    if (!n || typeof n !== "object") continue;
    if (n.kind === "InstanceBody" && n.addr !== undefined) byAddr.set(n.addr, n);
    for (const v of Object.values(n)) if (v && typeof v === "object") todo.push(v);
  }
  return byAddr;
}

/** The body of an instance, written out or given by address. */
export const bodyOfInstance = (ast, inst) => (typeof inst.body === "string" ? bodies(ast).get(symbolAddr(inst.body)) : inst.body);

/** Members of a body, with generate blocks opened: [member, prefix]. */
function* members(list, prefix = "") {
  for (const m of list ?? []) {
    if (m.kind === "GenerateBlockArray") {
      const base = m.name.replace(/_+$/, "") || "gen";
      for (const b of m.members ?? []) if (b.kind === "GenerateBlock" && !b.isUninstantiated) {
        yield* members(b.members, `${prefix}${base}_${b.constructIndex}_`);
      }
    } else if (m.kind === "GenerateBlock") {
      if (!m.isUninstantiated) yield* members(m.members, m.name ? `${prefix}${m.name}_` : prefix);
    } else yield [m, prefix];
  }
}

/**
 * Map an elaborated design. `synthesize(definition, params)` runs Yosys on one
 * behavioural module and resolves to { ok, module, log }; null when there is no
 * synthesis engine (then such a module is a problem). `instance` maps that
 * instance (a testbench's circuit) instead of the top module.
 * `files` is the source text by file name.
 * Returns { circuit, problems }; circuit is null when there are problems.
 */
export async function mapDesign(ast, { synthesize, instance, files }) {
  const problems = [];
  const report = (node, construct, message) => problems.push({ ...where(node), construct, message });
  const design = ast.design ?? ast;
  const top = instance ?? (design.members ?? []).find((m) => m.kind === "Instance");
  if (!top) return { circuit: null, problems: [{ file: null, line: null, column: null, construct: "top", message: "no top module was elaborated" }] };
  const byAddr = bodies(ast);
  const bodyOf = (inst) => (typeof inst.body === "string" ? byAddr.get(symbolAddr(inst.body)) : inst.body);

  const mapped = new Map(); // key -> { definition, sig, body }
  const keyOf = (body) => {
    const params = (body.members ?? []).filter((m) => m.kind === "Parameter" && !m.isLocal);
    return { key: `${body.name}|${params.map((p) => `${p.name}=${p.value}`).join(",")}`, params };
  };

  async function mapModule(body) {
    const { key, params } = keyOf(body);
    if (!mapped.has(key)) {
      const entry = { definition: body.name, params, body: null };
      mapped.set(key, entry);
      entry.body = await mapBody(body);
    }
    return key;
  }

  async function mapBody(body) {
    const flat = [...members(body.members)];
    const procedural = flat.filter(([m]) => m.kind === "ProceduralBlock");
    return procedural.length ? behavioural(body, flat, procedural) : structural(body, flat);
  }

  /** Ports of a body, in declaration order, with their bit ids. */
  function portsOf(body, net) {
    const ports = [];
    const groups = {};
    let order = 0;
    for (const m of body.members ?? []) {
      if (m.kind !== "Port") continue;
      const dir = { In: "in", Out: "out" }[m.direction];
      if (!dir) { report(m, "port direction", `port "${m.name}" is ${String(m.direction).toLowerCase()}; only input and output are supported`); continue; }
      const t = parseType(m.type);
      if (!t) { report(m, "port type", `port "${m.name}" has type ${m.type}; only logic, wire and bit vectors are supported`); continue; }
      if (t.ascending && t.width > 1) { report(m, "ascending range", `port "${m.name}" is declared [${t.msb}:${t.lsb}]; write [high:low]`); continue; }
      const ids = bitIds(m.name, t);
      for (const id of ids) net.reserve(id, m);
      ports.push({ name: m.name, dir, type: t, ids, symbol: symbolAddr(m.internalSymbol), at: m });
      if (ids.length > 1) groups[m.name] = [...ids].reverse();
      order++;
    }
    return { ports, groups };
  }

  function finish(net, ports, groups) {
    const portList = ports.flatMap((p) => [...p.ids].reverse().map((id) => ({ id, dir: p.dir, at: [0, 0] })));
    const nets = net.nets();
    const out = { elements: net.elements, ports: portList, nets };
    if (Object.keys(groups).length) out.groups = groups;
    return out;
  }

  // ---- structural modules: mapped from the AST ---------------------------------

  async function structural(body, flat) {
    const net = new Netlist(report);
    const { ports, groups } = portsOf(body, net);
    const decls = new Map(); // symbol addr -> { ids, type, nodes }
    let order = 0;
    const declare = (m, prefix) => {
      const t = parseType(m.type);
      if (!t) { report(m, "type", `"${m.name}" has type ${m.type}; only logic, wire and bit vectors are supported here`); return; }
      if (t.ascending && t.width > 1) { report(m, "ascending range", `"${m.name}" is declared [${t.msb}:${t.lsb}]; write [high:low]`); return; }
      const ids = bitIds(prefix + m.name, t);
      const nodes = ids.map((id) => { const n = net.node(); net.name(n, id, 1, order++); return n; });
      decls.set(m.addr, { ids, type: t, nodes });
    };
    // Reserve user names first, so generated names never take them.
    for (const [m, prefix] of flat) {
      if (m.kind === "PrimitiveInstance" || m.kind === "Instance") net.reserve(prefix + m.name, m);
    }
    for (const [m, prefix] of flat) if (m.kind === "Net" || m.kind === "Variable") declare(m, prefix);
    ports.forEach((p, k) => {
      const d = decls.get(p.symbol);
      if (!d) return;
      d.nodes.forEach((n, i) => {
        net.name(n, p.ids[i], 0, k * 1000 + i);
        if (p.dir === "in") net.drive(n, p.ids[i], p.at); else net.sink(n, p.ids[i]);
      });
    });

    const width = (e) => parseType(e.type)?.width;
    const resize = (bits, w, signed) => {
      if (bits.length >= w) return bits.slice(0, w);
      const fill = signed ? bits[bits.length - 1] : net.constant("0");
      return [...bits, ...Array(w - bits.length).fill(fill)];
    };
    const constIndex = (e) => {
      const v = e?.constant ?? e?.value;
      const bits = v === undefined ? null : literalBits(v, 64);
      return bits === null ? null : parseInt([...bits].reverse().join(""), 2) - (/^-/.test(String(v)) ? 2 ** 64 : 0);
    };
    const declOf = (e) => {
      if (e.kind !== "NamedValue") return null;
      const d = decls.get(symbolAddr(e.symbol));
      if (!d) report(e, "name", `"${symbolName(e.symbol)}" is not a net or variable of this module`);
      return d ?? null;
    };
    const select = (e) => {
      const d = declOf(e.value);
      if (!d) return null;
      const bit = (i) => {
        const k = d.type.msb >= d.type.lsb ? i - d.type.lsb : d.type.lsb - i;
        if (k < 0 || k >= d.nodes.length) { report(e, "select", `index ${i} is outside the declared range`); return null; }
        return d.nodes[k];
      };
      if (e.kind === "ElementSelect") {
        const i = constIndex(e.selector);
        if (i === null) { report(e, "variable index", "a bit select must have a constant index"); return null; }
        const b = bit(i);
        return b === null ? null : [b];
      }
      const l = constIndex(e.left), r = constIndex(e.right);
      if (l === null || r === null) { report(e, "variable index", "a part select must have constant bounds"); return null; }
      let hi, lo;
      if (e.selectionKind === "Simple") [hi, lo] = [Math.max(l, r), Math.min(l, r)];
      else if (e.selectionKind === "IndexedUp") [hi, lo] = [l + r - 1, l];
      else if (e.selectionKind === "IndexedDown") [hi, lo] = [l, l - r + 1];
      else { report(e, "part select", `part select ${e.selectionKind} is not supported`); return null; }
      const out = [];
      for (let i = lo; i <= hi; i++) { const b = bit(i); if (b === null) return null; out.push(b); }
      return out;
    };

    function lvalue(e) {
      if (!e) return null;
      if (e.kind === "NamedValue") return declOf(e)?.nodes ?? null;
      if (e.kind === "ElementSelect" || e.kind === "RangeSelect") return select(e);
      if (e.kind === "Concatenation") {
        const parts = e.operands.map(lvalue);
        return parts.includes(null) ? null : parts.reverse().flat();
      }
      report(e, e.kind, `${e.kind} cannot be assigned to here`);
      return null;
    }

    const BITWISE = { BinaryAnd: "and", BinaryOr: "or", BinaryXor: "xor", BinaryXnor: "xnor" };
    const REDUCE = { BitwiseAnd: "and", BitwiseOr: "or", BitwiseXor: "xor", BitwiseNand: "nand", BitwiseNor: "nor", BitwiseXnor: "xnor" };
    const anyBit = (bits, at) => (bits.length === 1 ? bits[0] : net.reduce("or", bits, at));

    function evaluate(e) {
      switch (e?.kind) {
        case "NamedValue": return declOf(e)?.nodes ?? null;
        case "ElementSelect": case "RangeSelect": return select(e);
        case "IntegerLiteral": case "UnbasedUnsizedIntegerLiteral": {
          const bits = literalBits(e.constant ?? e.value, width(e) ?? 32);
          if (bits === null) { report(e, "x or z literal", `${e.value} has x or z bits; only 0 and 1 can be drawn`); return null; }
          return bits.map((b) => net.constant(b, e));
        }
        case "Conversion": {
          const inner = evaluate(e.operand);
          const w = width(e);
          if (inner === null || w === undefined) { if (w === undefined) report(e, "type", `type ${e.type} is not a bit vector`); return null; }
          if (inner.length >= w) return inner.slice(0, w);
          const how = widening(e, files);
          if (how === null) { report(e, "sign extension", WIDENING_UNKNOWN); return null; }
          return resize(inner, w, how === "sign");
        }
        case "Concatenation": {
          const parts = e.operands.map(evaluate);
          return parts.includes(null) ? null : parts.reverse().flat();
        }
        case "Replication": {
          const n = constIndex(e.count);
          const part = evaluate(e.concat);
          if (n === null || part === null) return null;
          return Array(n).fill(part).flat();
        }
        case "UnaryOp": {
          const a = evaluate(e.operand);
          if (a === null) return null;
          if (e.op === "BitwiseNot") return a.map((b) => net.gate("not_gate", [b], e));
          if (e.op in REDUCE) return [net.reduce(REDUCE[e.op], a, e)];
          if (e.op === "LogicalNot") return [net.gate("not_gate", [anyBit(a, e)], e)];
          report(e, `operator ${e.op}`, `the ${e.op} operator is not supported; use bitwise, reduction or ?: operators`);
          return null;
        }
        case "BinaryOp": {
          if (e.op in BITWISE) {
            const w = width(e);
            const a = evaluate(e.left), b = evaluate(e.right);
            if (a === null || b === null) return null;
            const [x, y] = [resize(a, w, false), resize(b, w, false)];
            return x.map((bit, i) => net.reduce(BITWISE[e.op], [bit, y[i]], e));
          }
          if (e.op === "LogicalAnd" || e.op === "LogicalOr") {
            const a = evaluate(e.left), b = evaluate(e.right);
            if (a === null || b === null) return null;
            return [net.gate(e.op === "LogicalAnd" ? "and_gate" : "or_gate", [anyBit(a, e), anyBit(b, e)], e)];
          }
          report(e, `operator ${e.op}`, `the ${e.op} operator is not supported in assign; describe it with always_comb or with gates`);
          return null;
        }
        case "ConditionalOp": {
          if ((e.conditions ?? []).length !== 1) { report(e, "conditional", "a ?: condition must be one expression"); return null; }
          const s = evaluate(e.conditions[0].expr);
          const w = width(e);
          const t = evaluate(e.left), f = evaluate(e.right);
          if (s === null || t === null || f === null) return null;
          const sel = anyBit(s, e);
          const [tt, ff] = [resize(t, w, false), resize(f, w, false)];
          return tt.map((bit, i) => net.mux(ff[i], bit, sel, e));
        }
        default:
          report(e, e?.kind ?? "expression", `${e?.kind ?? "this expression"} is not supported`);
          return null;
      }
    }

    const connect = (lhs, rhs, at) => {
      if (lhs === null || rhs === null) return;
      const r = resize(rhs, lhs.length, false);
      lhs.forEach((n, i) => net.union(n, r[i]));
    };

    for (const [m, prefix] of flat) {
      switch (m.kind) {
        case "Port": case "Parameter": case "Genvar": case "TypeAlias": case "Variable": break;
        case "Net":
          if (m.initializer) connect(decls.get(m.addr)?.nodes ?? null, evaluate(m.initializer), m);
          break;
        case "ContinuousAssign": {
          if (m.delay || m.timing) { report(m, "delay", "delays (#) in a design are not supported; timing comes from the simulator"); break; }
          const a = m.assignment;
          connect(lvalue(a.left), evaluate(a.right), m);
          break;
        }
        case "PrimitiveInstance": {
          const kind = symbolName(m.primitiveType);
          const type = PRIMITIVES[kind];
          if (!type) { report(m, `primitive ${kind}`, `the ${kind} primitive is not supported (tri-state and switch primitives cannot be drawn with the approved symbols)`); break; }
          const terms = m.ports.map((p) => (p.kind === "Assignment" ? { out: lvalue(p.left) } : { in: evaluate(p) }));
          if (terms.some((t) => (t.out ?? t.in) === null)) break;
          if (terms.some((t) => (t.out ?? t.in).length !== 1)) { report(m, "primitive width", "primitive terminals must be single bits"); break; }
          const id = prefix + m.name;
          if (kind === "not" || kind === "buf") {
            const input = terms[terms.length - 1].in?.[0];
            const outs = terms.slice(0, -1).map((t) => t.out?.[0]);
            outs.forEach((o, i) => {
              if (kind === "buf") net.union(o, input); // a buffer is a wire in zero-delay logic
              else net.union(o, net.gate("not_gate", [input], m, i === 0 ? id : undefined));
            });
          } else {
            const out = terms[0].out?.[0];
            const ins = terms.slice(1).map((t) => t.in?.[0]);
            if (out === undefined || ins.length < 2 || ins.includes(undefined)) { report(m, `primitive ${kind}`, "a gate primitive needs one output, then two or more inputs"); break; }
            const op = kind === "xnor" ? "xnor" : kind;
            net.union(out, net.reduce(op, ins, m, id));
          }
          break;
        }
        case "Instance": {
          const child = bodyOf(m);
          if (!child) { report(m, "instance", `instance "${m.name}" has no body`); break; }
          const key = await mapModule(child);
          const childPorts = (child.members ?? []).filter((x) => x.kind === "Port");
          const pins = { left: [], right: [] };
          const conn = {};
          for (const p of childPorts) {
            const t = parseType(p.type);
            if (!t) continue;
            const ids = [...bitIds(p.name, t)].reverse();
            (p.direction === "In" ? pins.left : pins.right).push(...ids);
          }
          const id = prefix + m.name;
          for (const c of m.connections ?? []) {
            const p = c.port;
            const t = parseType(p?.type);
            if (!p || !t || !c.expr) continue;
            const ids = bitIds(p.name, t);
            if (p.direction === "In") {
              const bits = evaluate(c.expr);
              if (bits === null) continue;
              resize(bits, ids.length, false).forEach((n, i) => net.sink(n, `${id}.${ids[i]}`));
            } else if (p.direction === "Out") {
              const bits = c.expr.kind === "Assignment" ? lvalue(c.expr.left) : lvalue(c.expr);
              if (bits === null) continue;
              bits.slice(0, ids.length).forEach((n, i) => net.drive(n, `${id}.${ids[i]}`, m));
              // A connection wider than the port: the port's value is widened by the port's sign.
              for (const n of bits.slice(ids.length)) net.union(n, t.signed ? bits[ids.length - 1] : net.constant("0", m));
            } else report(m, "port direction", `port "${p.name}" of ${child.name} is not input or output`);
            conn[p.name] = true;
          }
          const h = Math.max(pins.left.length, pins.right.length) + 1;
          net.elements.push({ id, type: "block", at: [0, 0], label: `$\\texttt{${id.replace(/_/g, "\\_")}}$`,
            params: { shape: "rect", w: 4, h, label: `$\\texttt{${child.name.replace(/_/g, "\\_")}}$`, module: key, pins } });
          break;
        }
        case "InstanceArray": report(m, "instance array", "arrays of instances are not supported; use a generate for loop"); break;
        case "ProceduralBlock": break; // not reached: such modules go through Yosys
        default: report(m, m.kind, `${m.kind} is not supported in a module`);
      }
    }
    return finish(net, ports, groups);
  }

  // ---- behavioural modules: Yosys -------------------------------------------------

  async function behavioural(body, flat, procedural) {
    let ok = true;
    for (const [m] of procedural) {
      const kind = m.procedureKind;
      if (kind === "AlwaysComb" || kind === "AlwaysLatch") continue;
      if (kind === "AlwaysFF") {
        const timing = m.body?.timing;
        if (timing?.kind === "EventList") { report(m, "asynchronous control", "an always_ff with more than one event (an asynchronous reset or set) is not supported: no approved flip-flop symbol has one; use a synchronous reset"); ok = false; }
        else if (timing?.kind !== "SignalEvent") { report(m, "always_ff timing", "always_ff must start with @(posedge clock)"); ok = false; }
        else if (timing.edge !== "PosEdge") { report(m, "negedge", "only rising-edge flip-flops are supported: the approved D flip-flop symbol has no falling-edge clock"); ok = false; }
        continue;
      }
      ok = false;
      if (kind === "Always") report(m, "always", "plain always is not supported; write always_ff, always_comb or always_latch");
      else report(m, String(kind).toLowerCase(), `${kind} blocks are not supported in a design (testbench stimulus is read separately)`);
    }
    // An x or z the author wrote is never turned into a 0 or 1 (Yosys would treat it as a don't care).
    const todo = procedural.map(([m]) => m.body);
    while (todo.length) {
      const n = todo.pop();
      if (Array.isArray(n)) { todo.push(...n); continue; }
      if (!n || typeof n !== "object") continue;
      if ((n.kind === "IntegerLiteral" || n.kind === "UnbasedUnsizedIntegerLiteral") && literalBits(n.constant ?? n.value, 64) === null) {
        report(n, "x or z literal", `${n.value} has x or z bits; only 0 and 1 can be drawn`);
        ok = false;
      }
      for (const v of Object.values(n)) if (v && typeof v === "object") todo.push(v);
    }
    for (const [m] of flat) {
      if (m.kind === "Instance") { report(m, "instance in behavioural module", `module ${body.name} has always blocks and also instances; put the always blocks in a module of their own`); ok = false; }
    }
    const net = new Netlist(report);
    const { ports, groups } = portsOf(body, net);
    if (!ok || problems.length) return finish(net, ports, groups);
    const { params } = keyOf(body);
    const values = {};
    for (const p of params) {
      if (!/^-?\d+$/.test(String(p.value))) { report(p, "parameter", `parameter ${p.name} = ${p.value} is not a whole number`); return finish(net, ports, groups); }
      values[p.name] = p.value;
    }
    if (!synthesize) {
      report(procedural[0][0], "synthesis", `module ${body.name} has always blocks; behavioural code needs the synthesis engine, which is not loaded here`);
      return finish(net, ports, groups);
    }
    const result = await synthesize(body.name, values);
    if (!result.ok) {
      const line = result.log.split("\n").find((l) => /error/i.test(l)) ?? result.log.trim().split("\n").pop();
      report(procedural[0][0], "synthesis", `Yosys could not turn ${body.name} into gates: ${line}`);
      return finish(net, ports, groups);
    }
    mapYosys(result.module, net, ports, procedural[0][0]);
    return finish(net, ports, groups);
  }

  function mapYosys(mod, net, ports, fallbackAt) {
    const nodes = new Map();
    const nodeOf = (bit, at) => {
      if (bit === "0" || bit === "1") return net.constant(bit, at);
      if (typeof bit !== "number") { report(at, "x or z", "the synthesised logic has an x or z value (an output not assigned on every path?)"); return null; }
      if (!nodes.has(bit)) nodes.set(bit, net.node());
      return nodes.get(bit);
    };
    const srcAt = (cell) => {
      const m = /(?:^|\/)([^/:|]+):(\d+)\.(\d+)/.exec(cell?.attributes?.src ?? "");
      return m ? { source_file: m[1], source_line: Number(m[2]), source_column: Number(m[3]) } : fallbackAt;
    };
    ports.forEach((p, k) => {
      const y = mod.ports?.[p.name];
      if (!y) { report(p.at, "port", `Yosys lost port ${p.name}`); return; }
      y.bits.forEach((bit, i) => {
        const n = nodeOf(bit, p.at);
        if (n === null) return;
        const id = p.ids[i];
        net.name(n, id, 0, k * 1000 + i);
        if (p.dir === "in") net.drive(n, id, p.at); else net.sink(n, id);
      });
    });
    let order = 0;
    for (const [name, info] of Object.entries(mod.netnames ?? {})) {
      if (info.hide_name) continue;
      const clean = name.replace(/^\\/, "").replace(/[.[\]]/g, "_");
      if (!ID.test(clean)) continue;
      const offset = info.offset ?? 0;
      info.bits.forEach((bit, i) => {
        if (typeof bit !== "number") return;
        net.name(nodeOf(bit), info.bits.length > 1 ? `${clean}${offset + i}` : clean, 1, order++);
      });
    }
    const one = (cell, pin) => nodeOf(cell.connections[pin][0], srcAt(cell));
    for (const [cname, cell] of Object.entries(mod.cells ?? {})) {
      const at = srcAt(cell);
      const t = cell.type;
      const two = { $_AND_: "and_gate", $_OR_: "or_gate", $_XOR_: "xor_gate", $_NAND_: "nand_gate", $_NOR_: "nor_gate" }[t];
      let y;
      if (two) y = net.gate(two, [one(cell, "A"), one(cell, "B")], at);
      else if (t === "$_NOT_") y = net.gate("not_gate", [one(cell, "A")], at);
      else if (t === "$_XNOR_") y = net.gate("not_gate", [net.gate("xor_gate", [one(cell, "A"), one(cell, "B")], at)], at);
      else if (t === "$_ANDNOT_") y = net.gate("and_gate", [one(cell, "A"), net.gate("not_gate", [one(cell, "B")], at)], at);
      else if (t === "$_ORNOT_") y = net.gate("or_gate", [one(cell, "A"), net.gate("not_gate", [one(cell, "B")], at)], at);
      else if (t === "$_MUX_") y = net.mux(one(cell, "A"), one(cell, "B"), one(cell, "S"), at);
      else if (t === "$_DFF_P_" || t === "$_DLATCH_P_") {
        const q = cell.connections.Q[0];
        const qName = Object.entries(mod.netnames ?? {}).find(([n, i]) => !i.hide_name && i.bits.includes(q));
        const base = t === "$_DFF_P_" ? "ff" : "latch";
        const hint = qName ? `${base}_${qName[0].replace(/[.[\]]/g, "_")}${qName[1].bits.length > 1 ? qName[1].bits.indexOf(q) + (qName[1].offset ?? 0) : ""}` : null;
        const id = hint && ID.test(hint) && !net.ids.has(hint) ? (net.ids.add(hint), hint) : net.fresh(base);
        const out = net.element(id, t === "$_DFF_P_" ? "d_flipflop" : "d_latch",
          { D: one(cell, "D"), CLK: one(cell, t === "$_DFF_P_" ? "C" : "E") }, ["Q"], at);
        y = out.Q;
        const qn = nodeOf(q, at);
        if (qn !== null) net.union(qn, y);
        continue;
      } else {
        report(at, `cell ${t}`, `the synthesised cell ${t} (${cname}) has no approved symbol`);
        continue;
      }
      const yn = nodeOf(cell.connections.Y[0], at);
      if (yn !== null) net.union(yn, y);
    }
  }

  // ---- the whole design ------------------------------------------------------------

  const topBody = bodyOf(top);
  const topEntry = { body: await mapBody(topBody) };
  if (problems.length) return { circuit: null, problems: sortProblems(problems) };

  // Module names: the definition, or definition_<param><value> when it has several specialisations.
  const perDef = new Map();
  for (const [key, e] of mapped) (perDef.get(e.definition) ?? perDef.set(e.definition, []).get(e.definition)).push(key);
  const nameOf = new Map();
  for (const [def, keys] of perDef) {
    for (const key of keys) {
      const e = mapped.get(key);
      const name = keys.length === 1 ? def : `${def}_${e.params.map((p) => `${p.name}${p.value}`).join("_")}`;
      if (!ID.test(name)) report(topBody, "module name", `module name ${name} cannot be used`);
      nameOf.set(key, name);
    }
  }
  const allBodies = [topEntry.body, ...[...mapped.values()].map((e) => e.body)];
  for (const b of allBodies) for (const e of b.elements) if (e.params?.module) e.params.module = nameOf.get(e.params.module);
  for (const b of allBodies) {
    const flatBody = { schema: "circuit/0.3", id: "body", grid_cm: 0.25, elements: b.elements, ports: b.ports, nets: b.nets };
    const combinational = !b.elements.some((e) => e.type === "block") && analyze(flatBody).combinational;
    layoutBody(b, combinational ? "array" : "flow");
  }
  if (problems.length) return { circuit: null, problems: sortProblems(problems) };

  const circuit = { schema: mapped.size ? "circuit/0.4" : "circuit/0.3", id: ID.test(topBody.name) ? topBody.name : "top",
    title: `${topBody.name} (imported from SystemVerilog)`, grid_cm: 0.25 };
  Object.assign(circuit, ordered(topEntry.body));
  if (mapped.size) {
    circuit.modules = {};
    for (const [key, e] of mapped) circuit.modules[nameOf.get(key)] = { title: `module ${e.definition}${e.params.length ? ` #(${e.params.map((p) => `${p.name}=${p.value}`).join(", ")})` : ""}`, ...ordered(e.body) };
  }
  return { circuit, problems: [] };
}

const ordered = (b) => {
  const out = { elements: b.elements, ports: b.ports };
  if (b.wires?.length) out.wires = b.wires;
  if (b.junctions?.length) out.junctions = b.junctions;
  out.nets = b.nets;
  if (b.groups) out.groups = b.groups;
  return out;
};

const sortProblems = (ps) => ps.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0));
