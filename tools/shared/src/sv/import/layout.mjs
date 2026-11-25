// Default layouts for imported circuits: a starting point for the editor, not a
// finished drawing. Two styles:
//
// - "array" (fully combinational bodies): the logic-array drawing. Each input
//   runs down a vertical rail from the top, with its complement on a second
//   rail beside it when an inverter of that input exists; every other gate has
//   its own row to the right, and each gate input taken from a rail is a
//   straight horizontal tap with a junction on the rail. Deeper gates move one
//   column right per logic level; outputs leave on the right.
// - "flow" (anything else): simple left to right by logic level, inputs on the
//   left, outputs on the right, every wire left to the router.
//
// Coordinates are grid steps, y up. Pin tips come from the symbol pack.

/** Unrotated pin tips of the element types the importers produce (symbols-v0.3.0). */
const PINS = {
  and_gate: { A: [-4, 1], B: [-4, -1], Y: [5, 0] },
  nand_gate: { A: [-4, 1], B: [-4, -1], Y: [6, 0] },
  or_gate: { A: [-5, 1], B: [-5, -1], Y: [5, 0] },
  nor_gate: { A: [-5, 1], B: [-5, -1], Y: [5, 0] },
  xor_gate: { A: [-5, 1], B: [-5, -1], Y: [5, 0] },
  not_gate: { A: [-4, 0], Y: [5, 0] },
  mux2: { I0: [-4, 2], I1: [-4, -2], S: [0, -5], Y: [4, 0] },
  d_flipflop: { D: [-4, 2], CLK: [0, -5], Q: [4, 2], Qn: [4, 0] },
  d_latch: { D: [-4, 2], CLK: [0, -5], Q: [4, 2], Qn: [4, 0] },
  vdd: { 1: [0, -1] },
  ground: { 1: [0, 1] },
};
const HALF_HEIGHT = { mux2: 5, d_flipflop: 5, d_latch: 5, vdd: 2, ground: 2 };

/** Block pins: one module (2 steps) apart, centred on their side; w and h in modules. */
function blockGeometry(e) {
  const pins = e.params.pins ?? {};
  const tips = {};
  const side = (list, place) => list.forEach((p, k) => {
    const name = typeof p === "string" ? p : p.name;
    tips[name] = place(k, list.length);
  });
  const w = e.params.w, h = e.params.h; // modules; the box is 2w by 2h steps around the origin
  side(pins.left ?? [], (k, n) => [-w, n - 1 - 2 * k]);
  side(pins.right ?? [], (k, n) => [w, n - 1 - 2 * k]);
  side(pins.top ?? [], (k, n) => [-(n - 1) + 2 * k, h]);
  side(pins.bottom ?? [], (k, n) => [-(n - 1) + 2 * k, -h]);
  return { tips, half: h };
}

const rotate = ([x, y], deg) => ({ 0: [x, y], 90: [-y, x], 180: [-x, -y], 270: [y, -x] }[deg ?? 0]);

/** Where a pin of a placed element ends, in grid steps (null if unknown). */
export function pinTip(e, pin) {
  const t = e.type === "block" ? blockGeometry(e).tips[pin] : PINS[e.type]?.[pin];
  if (!t) return null;
  const [dx, dy] = rotate(t, e.rotation);
  return [e.at[0] + dx, e.at[1] + dy];
}
export const halfHeight = (e) => (e.type === "block" ? blockGeometry(e).half : HALF_HEIGHT[e.type] ?? 2);

/** Who drives each net, and which element pins read it. */
function connectivity(body) {
  const byId = new Map(body.elements.map((e) => [e.id, e]));
  const inPorts = new Set(body.ports.filter((p) => p.dir === "in").map((p) => p.id));
  const driverOf = new Map(); // net -> element id, or "port:<id>"
  const readers = new Map(); // net -> [ref]
  for (const [net, refs] of Object.entries(body.nets)) {
    readers.set(net, []);
    for (const r of refs) {
      const dot = r.indexOf(".");
      if (dot < 0) { if (inPorts.has(r)) driverOf.set(net, `port:${r}`); continue; }
      const e = byId.get(r.slice(0, dot));
      const pin = r.slice(dot + 1);
      if (e && isOutput(e, pin)) driverOf.set(net, e.id);
      else readers.get(net).push(r);
    }
  }
  return { byId, driverOf, readers };
}

function isOutput(e, pin) {
  if (e.type === "block") return (e.params.pins?.right ?? []).some((p) => (typeof p === "string" ? p : p.name) === pin);
  return pin === "Y" || pin === "Q" || pin === "Qn" || (pin === "1" && (e.type === "vdd" || e.type === "ground"));
}

/** Logic level of every element: 0 for sources, else 1 + the deepest element driving it. */
function levels(body, k) {
  const netsOf = new Map(body.elements.map((e) => [e.id, []]));
  for (const [net, refs] of Object.entries(body.nets)) for (const r of refs) {
    const dot = r.indexOf(".");
    if (dot > 0 && netsOf.has(r.slice(0, dot)) && !isOutput(k.byId.get(r.slice(0, dot)), r.slice(dot + 1))) netsOf.get(r.slice(0, dot)).push(net);
  }
  const preds = new Map(body.elements.map((e) => [e.id, [...new Set(netsOf.get(e.id).map((n) => k.driverOf.get(n)).filter((d) => d && !d.startsWith("port:") && d !== e.id))]]));
  const level = new Map();
  const pending = new Set(body.elements.map((e) => e.id));
  while (pending.size) {
    let progressed = false;
    for (const id of [...pending]) {
      const ps = preds.get(id);
      if (ps.every((p) => level.has(p))) {
        level.set(id, ps.length ? 1 + Math.max(...ps.map((p) => level.get(p))) : 1);
        pending.delete(id);
        progressed = true;
      }
    }
    if (!progressed) {
      // A loop (through a flip-flop or a latch): place the element with the fewest unplaced inputs next.
      const id = [...pending].sort((a, b) => preds.get(a).filter((p) => !level.has(p)).length - preds.get(b).filter((p) => !level.has(p)).length)[0];
      const known = preds.get(id).filter((p) => level.has(p));
      level.set(id, known.length ? 1 + Math.max(...known.map((p) => level.get(p))) : 1);
      pending.delete(id);
    }
  }
  for (const e of body.elements) if (e.type === "vdd" || e.type === "ground") level.set(e.id, 0);
  return level;
}

/** Wires for every connection not already drawn: driver to each reader, routed automatically. */
function autoWires(body, k, drawn, wires) {
  for (const [net, refs] of Object.entries(body.nets)) {
    const d = k.driverOf.get(net);
    const source = d === undefined ? refs[0] : d.startsWith("port:") ? d.slice(5) : refs.find((r) => r.startsWith(`${d}.`) && isOutput(k.byId.get(d), r.slice(d.length + 1)));
    for (const r of refs) {
      if (r === source || drawn.has(r)) continue;
      wires.push({ id: `w${wires.length + 1}`, from: source, to: r });
    }
  }
}

function flow(body) {
  const k = connectivity(body);
  const level = levels(body, k);
  const COLUMN = 20;
  const columnY = new Map();
  for (const e of body.elements) {
    const L = level.get(e.id);
    const h = halfHeight(e);
    const top = columnY.get(L) ?? 0;
    e.at = [L * COLUMN, top - h];
    columnY.set(L, top - 2 * h - 4);
  }
  const last = Math.max(0, ...level.values());
  body.ports.filter((p) => p.dir === "in").forEach((p, i) => { p.at = [-COLUMN / 2, -6 * i]; p.side = "left"; });
  body.ports.filter((p) => p.dir === "out").forEach((p, i) => { p.at = [(last + 1) * COLUMN, -6 * i]; p.side = "right"; });
  const wires = [];
  autoWires(body, k, new Set(), wires);
  body.wires = wires;
  delete body.junctions;
}

function array(body) {
  const k = connectivity(body);
  const level = levels(body, k);
  const RAIL = 10, TOP = 0;
  const wires = [];
  const junctions = [];
  const drawn = new Set(); // refs already reached by a drawn wire
  const rails = []; // { net, x, start: [x, y], from: ref, taps: [] }

  // Rails: each input, its complement when an inverter of it exists, then constants.
  let x = 0;
  const railOf = new Map(); // net -> rail
  const inverters = new Set();
  for (const p of body.ports.filter((q) => q.dir === "in")) {
    const net = Object.keys(body.nets).find((n) => body.nets[n].includes(p.id));
    p.at = [x, TOP + 4];
    p.side = "up";
    if (net === undefined) { x += RAIL; continue; }
    const rail = { net, x, start: [x, TOP + 4], from: p.id, taps: [] };
    rails.push(rail);
    railOf.set(net, rail);
    const inv = body.elements.find((e) => e.type === "not_gate" && !inverters.has(e.id) && body.nets[net].includes(`${e.id}.A`));
    if (inv) {
      inverters.add(inv.id);
      inv.at = [x + RAIL / 2, TOP - 4];
      inv.rotation = 270;
      rail.taps.push({ y: TOP, to: `${inv.id}.A`, straight: true });
      const out = Object.keys(body.nets).find((n) => body.nets[n].includes(`${inv.id}.Y`));
      if (out !== undefined && !railOf.has(out)) {
        const tip = pinTip(inv, "Y");
        const r = { net: out, x: tip[0], start: tip, from: `${inv.id}.Y`, taps: [] };
        rails.push(r);
        railOf.set(out, r);
      }
    }
    x += RAIL;
  }
  for (const e of body.elements.filter((q) => q.type === "vdd" || q.type === "ground")) {
    e.at = [x, TOP + 1];
    if (e.type === "ground") e.rotation = 180;
    const net = Object.keys(body.nets).find((n) => body.nets[n].includes(`${e.id}.1`));
    if (net !== undefined) {
      const r = { net, x, start: pinTip(e, "1"), from: `${e.id}.1`, taps: [] };
      rails.push(r);
      railOf.set(net, r);
    }
    x += RAIL;
  }

  // Gates: one row each, one column per logic level.
  const right = x;
  const gates = body.elements.filter((e) => !inverters.has(e.id) && e.type !== "vdd" && e.type !== "ground")
    .map((e, i) => [e, i]).sort((a, b) => level.get(a[0].id) - level.get(b[0].id) || a[1] - b[1]).map(([e]) => e);
  const firstLevel = Math.min(Infinity, ...gates.map((e) => level.get(e.id)));
  let y = TOP - 16;
  for (const e of gates) {
    const h = halfHeight(e);
    e.at = [right + 8 + 18 * (level.get(e.id) - firstLevel), y - h + 2];
    y -= 2 * h + 3;
  }
  // Taps: a gate input on a rail net is a horizontal line from the rail.
  for (const e of gates) {
    for (const [net, refs] of Object.entries(body.nets)) {
      const rail = railOf.get(net);
      if (!rail) continue;
      for (const r of refs) {
        if (!r.startsWith(`${e.id}.`)) continue;
        const pin = r.slice(e.id.length + 1);
        if (isOutput(e, pin)) continue;
        const tip = pinTip(e, pin);
        const facesLeft = e.type !== "block" && (PINS[e.type]?.[pin]?.[0] ?? 0) < 0 && !e.rotation;
        rail.taps.push({ y: tip[1], to: r, straight: facesLeft });
      }
    }
  }
  for (const rail of rails) {
    if (rail.taps.length === 0) continue;
    const id = `w${wires.length + 1}`;
    const bottom = Math.min(...rail.taps.map((t) => t.y));
    wires.push({ id, from: rail.from, to: [rail.x, bottom], route: ["straight"] });
    drawn.add(rail.from);
    rail.taps.forEach((t, i) => {
      const jid = `j_${rail.net}_${i + 1}`;
      junctions.push({ id: jid, on: id, at: [rail.x, t.y] });
      const w = { id: `w${wires.length + 1}`, from: jid, to: t.to };
      if (t.straight) w.route = ["straight"];
      wires.push(w);
      drawn.add(t.to);
    });
  }
  // Outputs on the right, level with the pin that drives them.
  const xmax = Math.max(right, ...gates.map((e) => e.at[0] + 6));
  body.ports.filter((p) => p.dir === "out").forEach((p, i) => {
    const net = Object.keys(body.nets).find((n) => body.nets[n].includes(p.id));
    const d = net === undefined ? undefined : k.driverOf.get(net);
    const e = d && !d.startsWith("port:") ? k.byId.get(d) : null;
    const pin = e ? body.nets[net].find((r) => r.startsWith(`${e.id}.`) && isOutput(e, r.slice(e.id.length + 1))) : null;
    const tip = pin ? pinTip(e, pin.slice(e.id.length + 1)) : null;
    p.at = [xmax + 10, tip ? tip[1] : TOP - 16 - 6 * i];
    p.side = "right";
  });
  autoWires(body, k, drawn, wires);
  body.wires = wires;
  if (junctions.length) body.junctions = junctions;
  else delete body.junctions;
}

/** Lay out one body (top level or module) in place. style: "array" or "flow". */
export function layoutBody(body, style) {
  for (const e of body.elements) { e.at = [0, 0]; delete e.rotation; }
  if (style === "array" && !body.elements.some((e) => e.type === "block")) array(body);
  else flow(body);
  return body;
}
