import { editorDataOf } from "../../schematic-editor/src/index.js";
// DOM-free: the labelled nodes of a circuit file (ports and net names), starter WaveDrom lines, unknown-name check.
// The file is untrusted: it is parsed as data, only strings of a safe shape are kept, and the count is capped.

const NAME = /^[A-Za-z_][A-Za-z0-9_.\[\]:-]{0,40}$/;
const TEX_NAME = /^\$[^\r\n$]{1,118}\$$/;

export function nodesOf(text, { mergeConnected = false, allowTexNames = false } = {}) {
  let doc;
  try { doc = JSON.parse(String(text)); } catch { return { ok: false, error: "Not a circuit file (not JSON)." }; }
  if (!doc || typeof doc !== "object" || typeof doc.schema !== "string" || !doc.schema.startsWith("circuit/")) return { ok: false, error: "Not a circuit file (no circuit schema)." };
  const seen = new Set(), nodes = [];
  const clean = (t) => {
    if (typeof t !== "string") return null;
    const s = t.trim();
    return NAME.test(s) || allowTexNames && TEX_NAME.test(s) ? s : null;
  };
  const wireIdsForRefs = (refs, startIds = []) => {
    const refSet = new Set(refs), pointSet = new Set(), wires = new Set(startIds);
    const pointKey = (p) => `${p[0]},${p[1]}`;
    for (const p of Array.isArray(doc.ports) ? doc.ports : []) if (refSet.has(p?.id) && Array.isArray(p?.at)) pointSet.add(pointKey(p.at));
    for (const w of Array.isArray(doc.wires) ? doc.wires : []) if (wires.has(w?.id)) {
      for (const e of [w.from, w.to]) {
        if (Array.isArray(e)) pointSet.add(pointKey(e));
        if (typeof e === "string") refSet.add(e);
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const w of Array.isArray(doc.wires) ? doc.wires : []) {
        if (wires.has(w?.id)) continue;
        const ends = [w?.from, w?.to];
        if (!ends.some((e) => Array.isArray(e) ? pointSet.has(pointKey(e)) : typeof e === "string" && refSet.has(e))) continue;
        wires.add(w.id);
        for (const e of ends) {
          if (Array.isArray(e) && !pointSet.has(pointKey(e))) { pointSet.add(pointKey(e)); changed = true; }
          if (typeof e === "string" && !refSet.has(e)) { refSet.add(e); changed = true; }
        }
        changed = true;
      }
      for (const j of Array.isArray(doc.junctions) ? doc.junctions : []) {
        if (wires.has(j?.on) || refSet.has(j?.id)) {
          if (j?.on && !wires.has(j.on)) { wires.add(j.on); changed = true; }
          if (j?.id && !refSet.has(j.id)) { refSet.add(j.id); changed = true; }
        }
      }
    }
    return wires;
  };
  const labelFor = (key, refs, startWireIds = []) => {
    const members = new Set(refs);
    const connectedWires = mergeConnected ? wireIdsForRefs(members, startWireIds) : new Set();
    for (const w of Array.isArray(doc.wires) ? doc.wires : []) {   // a wire's net label, then its bus label, name the net
      if (mergeConnected ? !connectedWires.has(w?.id) : ![w?.from, w?.to].some((e) => typeof e === "string" && members.has(e))) continue;
      const n = clean(editorDataOf(doc).wire_labels?.[w.id]) ?? clean(w.bus);
      if (n) return n;
    }
    for (const p of doc.ports ?? []) if (members.has(p?.id) && clean(p.label)) return clean(p.label);   // a port's own label
    const pts = [];
    for (const w of Array.isArray(doc.wires) ? doc.wires : []) {
      if (mergeConnected ? !connectedWires.has(w?.id) : ![w?.from, w?.to].some((e) => typeof e === "string" && members.has(e))) continue;
      for (const e of [w.from, w.to, ...(Array.isArray(w.via) ? w.via : [])]) if (Array.isArray(e)) pts.push(e);
    }
    let best = null, bd = 3.01;   // a free label within 3 grid steps of the net's wire corners or ends
    for (const l of Array.isArray(doc.labels) ? doc.labels : []) {
      if (!clean(l?.text) || !Array.isArray(l.at)) continue;
      for (const p of pts) { const d = Math.max(Math.abs(p[0] - l.at[0]), Math.abs(p[1] - l.at[1])); if (d < bd) { bd = d; best = clean(l.text); } }
    }
    return best;
  };
  const add = (name, dir) => { const n = clean(name); if (n && !seen.has(n) && nodes.length < 200) { seen.add(n); nodes.push({ name: n, dir: dir === "in" || dir === "out" ? dir : null }); } };
  const netPorts = new Set(mergeConnected ? Object.values(doc.nets ?? {}).flatMap((refs) => Array.isArray(refs) ? refs : []) : []);
  if (Array.isArray(doc.ports)) for (const p of doc.ports) if (p && typeof p === "object" && !(mergeConnected && netPorts.has(p.id))) add(clean(p.label) ?? p.id, p.dir);
  if (doc.nets && typeof doc.nets === "object" && !Array.isArray(doc.nets)) for (const [k, refs] of Object.entries(doc.nets)) add(Array.isArray(refs) ? (labelFor(k, refs) ?? k) : k, null);
  if (mergeConnected) {
    const visited = new Set();
    for (const w of Array.isArray(doc.wires) ? doc.wires : []) {
      if (visited.has(w?.id)) continue;
      const connected = wireIdsForRefs([], [w.id]);
      connected.forEach((id) => visited.add(id));
      const label = labelFor(w.id, [], [...connected]);
      if (label) add(label, null);
    }
  }
  return { ok: true, title: typeof doc.title === "string" ? doc.title.slice(0, 120) : "", nodes };
}

const CLOCK = /^(clk|clock|ck|phi\d?)$/i;
/** One starter signal per node: a clock gets a clock wave, anything else a short 0-1-0 pattern. */
export function starterLines(nodes) {
  return nodes.map((n) => ({ name: n.name, wave: CLOCK.test(n.name) ? "p......." : "0.1.0..." }));
}

/** Signal names that are not nodes of the loaded circuit. */
export function unknownNames(names, nodes) {
  const known = new Set(nodes.map((n) => n.name));
  return names.filter((n) => !known.has(n));
}

/** The names of the level frames a circuit file carries (the beta editor keeps them in groups.frames). Data only; capped and trimmed. */
export function framesIn(text) {
  let doc;
  try { doc = JSON.parse(String(text)); } catch { return []; }
  const list = editorDataOf(doc).frames;
  if (!Array.isArray(list)) return [];
  return list.slice(0, 200).map((f, i) => (typeof f?.name === "string" && f.name.trim() ? f.name.trim().slice(0, 60) : `Frame ${i + 1}`));
}
