// DOM-free: the labelled nodes of a circuit file (ports and net names), starter WaveDrom lines, unknown-name check.
// The file is untrusted: it is parsed as data, only strings of a safe shape are kept, and the count is capped.

const NAME = /^[A-Za-z_][A-Za-z0-9_.\[\]:-]{0,40}$/;

export function nodesOf(text) {
  let doc;
  try { doc = JSON.parse(String(text)); } catch { return { ok: false, error: "Not a circuit file (not JSON)." }; }
  if (!doc || typeof doc !== "object" || typeof doc.schema !== "string" || !doc.schema.startsWith("circuit/")) return { ok: false, error: "Not a circuit file (no circuit schema)." };
  const seen = new Set(), nodes = [];
  const add = (name, dir) => { if (typeof name === "string" && NAME.test(name) && !seen.has(name) && nodes.length < 200) { seen.add(name); nodes.push({ name, dir: dir === "in" || dir === "out" ? dir : null }); } };
  if (Array.isArray(doc.ports)) for (const p of doc.ports) if (p && typeof p === "object") add(p.id, p.dir);
  if (doc.nets && typeof doc.nets === "object" && !Array.isArray(doc.nets)) for (const k of Object.keys(doc.nets)) add(k, null);
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
