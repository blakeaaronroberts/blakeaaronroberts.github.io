// Flatten circuit/0.4 hierarchy: every `block` with params.module is replaced by
// that module's elements and nets, recursively. Used by the simulator and the
// analysis, which only ever see flat circuits.
//
// Names: an instance's element or net `g1` becomes `<instance>_g1` (nested:
// `u1_h1_g1`). A module net joined to one of its ports takes the outer net's
// name. A flattened id that collides with another is an error, never renamed.
// The result keeps the top-level ports and groups and drops the drawing (wires,
// junctions, labels); it is for simulation and analysis, not for display.

/** Is this element an instance of a module? */
export const isInstance = (e) => e.type === "block" && typeof e.params?.module === "string";

const MAX_DEPTH = 64;

export function flatten(circuit) {
  if (!(circuit.elements ?? []).some(isInstance)) return circuit;
  const modules = circuit.modules ?? {};

  // Union-find over flattened net names; the first name created wins (outer before inner).
  const parent = new Map();
  const order = new Map();
  const refs = new Map(); // net name -> refs
  const find = (n) => {
    let root = n;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(n) !== root) { const next = parent.get(n); parent.set(n, root); n = next; }
    return root;
  };
  const union = (a, b) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra === rb) return;
    if (order.get(ra) < order.get(rb)) parent.set(rb, ra);
    else parent.set(ra, rb);
  };
  const newNet = (name) => {
    if (parent.has(name)) throw new Error(`flattening: net "${name}" collides with another net`);
    parent.set(name, name);
    order.set(name, order.size);
    refs.set(name, []);
  };

  const elements = [];
  const ids = new Set((circuit.ports ?? []).map((p) => p.id));
  const claim = (id) => {
    if (ids.has(id)) throw new Error(`flattening: element "${id}" collides with another id`);
    ids.add(id);
  };

  /** Expand one body. `binding` maps the body's port ids to outer net names (modules only). */
  function expand(body, prefix, binding, depth, path) {
    if (depth > MAX_DEPTH) throw new Error(`flattening: instances nested more than ${MAX_DEPTH} deep at ${path}`);
    const byId = new Map((body.elements ?? []).map((e) => [e.id, e]));
    const instancePin = new Map(); // "inst.pin" -> flattened net name
    for (const [n, list] of Object.entries(body.nets ?? {})) {
      const name = prefix + n;
      newNet(name);
      for (const r of list) {
        const dot = r.indexOf(".");
        if (dot < 0) {
          if (!prefix) refs.get(name).push(r); // a top-level port or junction
          else if (binding.has(r)) union(name, binding.get(r)); // a module port: join the outer net
          continue; // a module's own junctions, and ports not connected outside, carry no connection
        }
        const e = byId.get(r.slice(0, dot));
        if (e && isInstance(e)) instancePin.set(r, name);
        else refs.get(name).push(prefix + r);
      }
    }
    for (const e of body.elements ?? []) {
      if (!isInstance(e)) {
        claim(prefix + e.id);
        elements.push({ ...e, id: prefix + e.id });
        continue;
      }
      const m = modules[e.params.module];
      if (!m) throw new Error(`flattening: ${path}${e.id} is an instance of module "${e.params.module}", which is not in modules`);
      claim(prefix + e.id); // reserves the instance name, so "h1" and an element "h1" cannot both exist
      const inner = new Map();
      for (const p of m.ports ?? []) {
        const net = instancePin.get(`${e.id}.${p.id}`);
        if (net !== undefined) inner.set(p.id, net);
      }
      expand(m, `${prefix}${e.id}_`, inner, depth + 1, `${path}${e.id}.`);
    }
  }
  expand(circuit, "", new Map(), 0, "");

  const nets = {};
  for (const name of order.keys()) {
    const root = find(name);
    if (refs.get(name).length === 0 && root !== name) continue;
    (nets[root] ??= []).push(...refs.get(name));
  }
  for (const [n, list] of Object.entries(nets)) if (list.length === 0) delete nets[n];

  const flat = { schema: "circuit/0.3", id: circuit.id };
  if (circuit.title !== undefined) flat.title = circuit.title;
  Object.assign(flat, { grid_cm: circuit.grid_cm, elements, ports: circuit.ports ?? [], nets });
  if (circuit.groups) flat.groups = circuit.groups;
  return flat;
}
