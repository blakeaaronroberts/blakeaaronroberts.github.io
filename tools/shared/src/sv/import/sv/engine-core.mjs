// What every runtime's engines share: the calls to slang and Yosys and the
// reading of their output. engines.mjs (Node and Deno) and engines-browser.mjs
// only say how the binaries are loaded, so the two cannot drift. No file or
// network access here.

const ANSI = /\x1b\[[0-9;]*m/g;
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;

function checkNames(files) {
  for (const name of Object.keys(files)) {
    if (!SAFE_NAME.test(name)) throw new Error(`file name "${name}" must be letters, digits, _, . or - only`);
  }
}

/** slang's text diagnostics, as { file, line, column, severity, message }. */
function parseDiagnostics(lines) {
  const out = [];
  for (const raw of lines.join("\n").replace(ANSI, "").split("\n")) {
    const m = raw.match(/^\/?(?:src\/)?([^:]+):(\d+):(\d+): (error|warning|note): (.*)$/);
    if (m) out.push({ file: m[1], line: Number(m[2]), column: Number(m[3]), severity: m[4], message: m[5] });
  }
  return out;
}

/** `load()` gives a promise; its value is kept, but a failure is tried again next time. */
function once(load) {
  let kept = null;
  return () => (kept ??= Promise.resolve().then(load).catch((err) => { kept = null; throw err; }));
}

/**
 * runSlang(files, top): elaborate `files` ({ name: text }) with `top` as the
 * top module (without it, slang takes the modules nothing instantiates).
 * Returns { ok, ast, diagnostics }. `load()` resolves to { factory, compiled }:
 * slang.mjs's default export and the WebAssembly.Module.
 */
export function slangRunner(load) {
  const loaded = once(load);
  return async function runSlang(files, top) {
    checkNames(files);
    const { factory, compiled } = await loaded();
    const errors = [];
    const m = await factory({
      // Already compiled; the module never fetches slang.wasm itself.
      instantiateWasm: (imports, receive) => {
        WebAssembly.instantiate(compiled, imports).then((instance) => receive(instance, compiled));
        return {};
      },
      print: (s) => errors.push(s),
      printErr: (s) => errors.push(s),
    });
    m.FS.mkdir("/src");
    for (const [name, text] of Object.entries(files)) m.FS.writeFile(`/src/${name}`, text);
    const args = ["-q", ...(top === undefined ? [] : ["--top", top]), "--ast-json", "/ast.json", "--ast-json-source-info",
      ...Object.keys(files).map((n) => `/src/${n}`)];
    let code;
    try {
      code = m.callMain(args);
    } catch (err) {
      code = typeof err?.status === "number" ? err.status : 1;
    }
    const diagnostics = parseDiagnostics(errors);
    if (code !== 0) return { ok: false, ast: null, diagnostics, output: errors.join("\n").replace(ANSI, "") };
    return { ok: true, ast: JSON.parse(m.FS.readFile("/ast.json", { encoding: "utf8" })), diagnostics };
  };
}

/** The script that turns one behavioural module into single-bit cells. */
export const YOSYS_SCRIPT = [
  "proc", "opt", "techmap",
  // A multiplexer input Yosys leaves as x is a don't care (it is never selected when it
  // matters, e.g. in front of a latch that holds); use the other input.
  "opt -mux_undef",
  // Enables and synchronous resets become logic in front of a plain rising-edge
  // D flip-flop; latches become positive-enable D latches.
  "dfflegalize -cell $_DFF_P_ 01 -cell $_DLATCH_P_ 01",
  "opt_clean",
];

/**
 * runYosys(files, top, params): synthesise module `top` with parameters
 * `params` ({ name: integer }). Returns { ok, module, log }: module is the
 * Yosys JSON for `top`. `load()` resolves to the @yowasp/yosys module.
 */
export function yosysRunner(load) {
  const loaded = once(load);
  return async function runYosys(files, top, params = {}) {
    checkNames(files);
    const { runYosys: yosys } = await loaded();
    const overrides = Object.entries(params).map(([k, v]) => `-G ${k}=${v}`).join(" ");
    const read = `read_slang --threads 1 ${overrides} --top ${top} ${Object.keys(files).join(" ")}`;
    const script = [read, "hierarchy -top " + top, ...YOSYS_SCRIPT, "write_json out.json"].join("; ");
    const log = [];
    const sink = (bytes) => { if (bytes) log.push(new TextDecoder().decode(bytes)); };
    try {
      const out = await yosys(["-q", "-p", script], files, { stdout: sink, stderr: sink, fetchProgress: () => {} });
      const text = out["out.json"];
      const json = JSON.parse(typeof text === "string" ? text : new TextDecoder().decode(text));
      return { ok: true, module: json.modules[top], log: log.join("") };
    } catch (err) {
      return { ok: false, module: null, log: log.join("") + String(err?.message ?? err) };
    }
  };
}
