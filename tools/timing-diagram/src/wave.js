// DOM-free helpers for the timing-diagram page: read WaveDrom source without eval, tidy it, list its signal names.

/** WaveDrom source is often a JS object literal (bare keys, single quotes). Read it as data, never as code. */
export function parseSource(text) {
  const t = String(text ?? "").trim();
  if (!t) return { ok: false, error: "Empty source." };
  const attempts = [t, relax(t)];
  let err = "";
  for (const a of attempts) {
    try {
      const v = JSON.parse(a);
      if (!v || typeof v !== "object" || Array.isArray(v) || !Array.isArray(v.signal)) return { ok: false, error: 'The source needs a "signal" list, as in {signal: [{name: "clk", wave: "p..."}]}.' };
      return { ok: true, value: v };
    } catch (e) { err = e.message; }
  }
  return { ok: false, error: `Could not read the source: ${err}` };
}

function relax(t) {
  // single-quoted strings -> double-quoted, bare keys -> quoted, trailing commas dropped
  let s = t.replace(/'([^']*)'/g, (_, x) => JSON.stringify(x));
  s = s.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
  return s.replace(/,\s*([}\]])/g, "$1");
}

/** Names of the signals, groups included. Spacers (no name) are skipped. */
export function signalNames(value) {
  const out = [];
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object" && typeof x.name === "string" && x.name) out.push(x.name);
  };
  walk(value?.signal ?? []);
  return out;
}

/** The source reformatted: one signal per line, other keys on their own line. */
export function tidy(value) {
  const sig = (x, pad) => Array.isArray(x)
    ? `${pad}[${x.map((y, i) => (i === 0 && typeof y === "string" ? JSON.stringify(y) : `\n${sig(y, pad + "  ")}`)).join(",")}\n${pad}]`
    : `${pad}${JSON.stringify(x)}`;
  const parts = [`  "signal": [\n${value.signal.map((x) => sig(x, "    ")).join(",\n")}\n  ]`];
  for (const [k, v] of Object.entries(value)) if (k !== "signal") parts.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{\n${parts.join(",\n")}\n}\n`;
}

export const SAMPLE = `{
  "signal": [
    { "name": "clk", "wave": "p......." },
    { "name": "D", "wave": "0.1..0.." },
    { "name": "Q", "wave": "x.1..0.." }
  ]
}
`;
