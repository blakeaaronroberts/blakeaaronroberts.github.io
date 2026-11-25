// SystemVerilog import, the page's side (F22.1b). No DOM. The importer itself (the pinned copy of circuit-model's, slang only)
// runs in a Web Worker (sv-worker.js): slang is synchronous and the pasted text is not trusted, so a long run is stopped by
// terminating the Worker, never by waiting for it.
//
//   const { files, error } = prepareFiles([{ name, text }, ...]);       // 200 KB in all, safe names
//   const { circuit, problems } = await runImport(files, { top });      // 20 seconds; never throws
//   formatProblem(p)  -> "file:line:column construct: message"
//   candidateTops(problems) -> the module names to choose from, when several could be the top

export const TIME_LIMIT_MS = 20000;
export const MAX_INPUT_BYTES = 200 * 1024;

const SAFE = /[^A-Za-z0-9_.-]/g;   // the importer accepts file names of letters, digits, _ . - only

/** Files as { name: text } for the importer, or { error }. Names are made safe and made different; the cap counts UTF-8 bytes in all files. */
export function prepareFiles(list) {
  const files = {};
  let bytes = 0;
  for (const item of list ?? []) {
    const text = String(item?.text ?? "");
    if (!text.trim()) continue;
    let name = String(item?.name ?? "").trim().replace(SAFE, "_") || "pasted.sv";
    for (let n = 2; name in files; n++) name = name.replace(/(\.[^.]*)?$/, (ext) => `_${n}${ext ?? ""}`);
    files[name] = text;
    bytes += new TextEncoder().encode(text).length;
  }
  if (!Object.keys(files).length) return { error: "There is nothing to import: paste some SystemVerilog or open a .sv file." };
  if (bytes > MAX_INPUT_BYTES) return { error: `The input is too large: ${Math.ceil(bytes / 1024)} KB, and the limit is ${MAX_INPUT_BYTES / 1024} KB in all.` };
  return { files };
}

/** "file:line:column construct: message", leaving out what the importer did not give. */
export function formatProblem(p) {
  const where = [p.file, p.line, p.column].filter((v) => v !== null && v !== undefined && v !== "").join(":");
  return `${where ? `${where} ` : ""}${p.construct}: ${p.message}`;
}

/** The modules the importer lists when more than one could be the top ("name one of: a, b"). */
export function candidateTops(problems) {
  const p = (problems ?? []).find((x) => x.construct === "top");
  const m = p && /name one of: (.+)$/.exec(p.message);
  return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}

const failure = (construct, message) => ({ circuit: null, problems: [{ file: null, line: null, column: null, construct, message }] });

let nextId = 1;

/**
 * Run the importer in a Worker. Always answers { circuit, problems }: a Worker that cannot start, an engine that cannot be
 * downloaded, a Worker error and the time limit are problems too. The Worker is stopped when the run ends, whatever way.
 * Options (for tests): createWorker, setTimer, clearTimer, limitMs.
 */
export function runImport(files, { top } = {}, {
  createWorker = () => new Worker(new URL("./sv-worker.js", import.meta.url), { type: "module" }),
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id), limitMs = TIME_LIMIT_MS,
} = {}) {
  return new Promise((resolve) => {
    let worker = null, timer = null, done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      if (timer !== null) clearTimer(timer);
      try { worker?.terminate(); } catch { /* already gone */ }
      resolve(result);
    };
    const id = nextId++;
    try {
      worker = createWorker();
      worker.onmessage = (e) => {
        const m = e.data;
        if (!m || m.id !== id) return;   // an answer meant for another run
        finish(m.ok ? { circuit: m.result.circuit ?? null, problems: m.result.problems ?? [] } : failure("import", m.error));
      };
      worker.onerror = (e) => { e.preventDefault?.(); finish(failure("import", e.message || "the import could not start")); };
      timer = setTimer(() => finish(failure("time", `The import took too long (more than ${limitMs / 1000} seconds) and was stopped.`)), limitMs);
      worker.postMessage({ id, files, top: top || undefined });
    } catch (e) {
      finish(failure("import", e.message));
    }
  });
}
