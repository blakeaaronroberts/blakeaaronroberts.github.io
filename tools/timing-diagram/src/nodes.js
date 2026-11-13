// DOM-free: the labelled nodes of a circuit file (ports and net names), starter WaveDrom lines, unknown-name check.
// The file is untrusted: it is parsed as data, only strings of a safe shape are kept, and the count is capped.

const NAME = /^[A-Za-z_][A-Za-z0-9_.\[\]:-]{0,40}$/;

export function nodesOf(text) {
  let doc;
  try { doc = JSON.parse(String(text)); } catch { return { ok: false, error: "Not a circuit file (not JSON)." }; }
  if (!doc || typeof doc !== "object" || typeof doc.schema !== "string" || !doc.schema.startsWith("circuit/")) return { ok: false, error: "Not a circuit file (no circuit schema)." };
  const seen = new Set(), nodes = [];
  const clean = (t) => (typeof t === "string" && NAME.test(t.trim()) ? t.trim() : null);
  const labelFor = (key, refs) => {
    const members = new Set(refs);
    for (const w of Array.isArray(doc.wires) ? doc.wires : []) {   // a wire's net label, then its bus label, name the net
      if (![w?.from, w?.to].some((e) => typeof e === "string" && members.has(e))) continue;
      const n = clean(doc.groups?.wire_labels?.[w.id]) ?? clean(w.bus);
      if (n) return n;
    }
    for (const p of doc.ports ?? []) if (members.has(p?.id) && clean(p.label)) return clean(p.label);   // a port's own label
    const pts = [];
    for (const w of Array.isArray(doc.wires) ? doc.wires : []) {
      if (![w?.from, w?.to].some((e) => typeof e === "string" && members.has(e))) continue;
      for (const e of [w.from, w.to, ...(Array.isArray(w.via) ? w.via : [])]) if (Array.isArray(e)) pts.push(e);
    }
    let best = null, bd = 3.01;   // a free label within 3 grid steps of the net's wire corners or ends
    for (const l of Array.isArray(doc.labels) ? doc.labels : []) {
      if (!clean(l?.text) || !Array.isArray(l.at)) continue;
      for (const p of pts) { const d = Math.max(Math.abs(p[0] - l.at[0]), Math.abs(p[1] - l.at[1])); if (d < bd) { bd = d; best = clean(l.text); } }
    }
    return best;
  };
  const add = (name, dir) => { if (typeof name === "string" && NAME.test(name) && !seen.has(name) && nodes.length < 200) { seen.add(name); nodes.push({ name, dir: dir === "in" || dir === "out" ? dir : null }); } };
  if (Array.isArray(doc.ports)) for (const p of doc.ports) if (p && typeof p === "object") add(clean(p.label) ?? p.id, p.dir);
  if (doc.nets && typeof doc.nets === "object" && !Array.isArray(doc.nets)) for (const [k, refs] of Object.entries(doc.nets)) add(Array.isArray(refs) ? (labelFor(k, refs) ?? k) : k, null);
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
  const list = doc?.groups?.frames;
  if (!Array.isArray(list)) return [];
  return list.slice(0, 200).map((f, i) => (typeof f?.name === "string" && f.name.trim() ? f.name.trim().slice(0, 60) : `Frame ${i + 1}`));
}
