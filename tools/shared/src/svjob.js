// SystemVerilog import, the page's side (F22.1b). No DOM. The importer itself (the pinned copy of circuit-model's, slang only)
// runs in a Web Worker (sv-worker.js): slang is synchronous and the pasted text is not trusted, so a long run is stopped by
// terminating the Worker, never by waiting for it.
//
//   const { files, error } = prepareFiles([{ name, text }, ...]);       // 200 KB in all, safe names
//   const { circuit, problems } = await runImport(files, { top }, { onProgress, onAsk, signal });   // 20 seconds for the run; never throws
//   endWarmWorker()                                                    // the Worker kept after a run that loaded the synthesis engine (F22.1c)
//   formatProblem(p)  -> "file:line:column construct: message"
//   candidateTops(problems) -> the module names to choose from, when several could be the top

export const TIME_LIMIT_MS = 20000;         // the run (F22.1b)
export const STALL_MS = 20000;              // the engine download with no new bytes (F22.1c)
export const COLD_CAP_MS = 3 * 60 * 1000;   // the engine download in all
export const IDLE_MS = 5 * 60 * 1000;       // a kept Worker unused
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
let warm = null;   // a Worker that loaded the synthesis engine, kept for the next run: { worker, idle, clearTimer }

/** End the kept Worker (the panel closing, a test). */
export function endWarmWorker() {
  if (!warm) return;
  const { worker, idle, clearTimer } = warm;
  warm = null;
  try { clearTimer(idle); } catch { /* gone */ }
  try { worker.terminate(); } catch { /* gone */ }
}

/**
 * Run the importer in a Worker. Always answers { circuit, problems }: a Worker that cannot start, an engine that cannot be
 * downloaded, a Worker error, Cancel and the time limits are problems too. The Worker is stopped when the run ends, whatever way,
 * except after a successful run that loaded the synthesis engine: that Worker is kept, ended after IDLE_MS unused (loading the
 * engine again would mean unpacking and compiling 75 MB).
 *
 * The 20 second limit is for the run. While the engine downloads (first behavioural import) it is replaced by: stop after
 * STALL_MS without new bytes, and after COLD_CAP_MS in all; the 20 seconds start again when the engine is ready.
 *
 * Options (the third argument):
 *   synthesis      true allows the synthesis engine (behavioural code); false (the default, until the panel opts in, F22.1c-2) refuses it as before
 *   onProgress(e)  { kind: "download", file, done, total, doneAll, totalAll } and { kind: "ready" }
 *   onAsk(bytes)   async, answers whether to download the engine (Data Saver); without it the Worker never asks
 *   signal         an AbortSignal: Cancel
 *   createWorker, setTimer, clearTimer, limitMs, stallMs, capMs, idleMs   (tests)
 */
export function runImport(files, { top } = {}, {
  createWorker = () => new Worker(new URL("./sv-worker.js", import.meta.url), { type: "module" }),
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id),
  limitMs = TIME_LIMIT_MS, stallMs = STALL_MS, capMs = COLD_CAP_MS, idleMs = IDLE_MS,
  onProgress = null, onAsk = null, signal = null, synthesis = false,
} = {}) {
  return new Promise((resolve) => {
    let worker = null, done = false, downloading = false, lastDone = -1;
    let run = null, stall = null, cap = null;
    const stop = (id) => { if (id !== null) clearTimer(id); return null; };
    const finish = (result, keep = false) => {
      if (done) return;
      done = true;
      signal?.removeEventListener?.("abort", onAbort);
      run = stop(run); stall = stop(stall); cap = stop(cap);
      if (keep && worker && !warm) {
        const parked = worker;
        parked.onmessage = null;
        parked.onerror = () => endWarmWorker();
        warm = { worker: parked, clearTimer, idle: setTimer(() => endWarmWorker(), idleMs) };
      } else {
        try { worker?.terminate(); } catch { /* already gone */ }
      }
      resolve(result);
    };
    const onAbort = () => finish(failure("cancel", "The import was cancelled."));
    const armRun = () => { run = setTimer(() => finish(failure("time", `The import took too long (more than ${limitMs / 1000} seconds) and was stopped.`)), limitMs); };
    const armStall = () => {
      stall = stop(stall);
      stall = setTimer(() => finish(failure("engine", `The synthesis engine stopped downloading (no data for ${stallMs / 1000} seconds) and was stopped.`)), stallMs);
    };
    const enterDownload = () => {
      if (downloading) return;
      downloading = true;
      run = stop(run);   // the 20 seconds are for the run, not the download
      cap = setTimer(() => finish(failure("engine", `The synthesis engine took more than ${capMs / 60000} minutes to download and was stopped.`)), capMs);
    };
    const onEvent = async (event) => {
      if (event.kind === "ask") {
        enterDownload();
        stall = stop(stall);   // a person is deciding
        let yes = false;
        try { yes = onAsk ? (await onAsk(event.bytes)) === true : true; } catch { yes = false; }
        if (done) return;
        if (yes) armStall();
        worker.postMessage({ id, consent: yes });
      } else if (event.kind === "download") {
        enterDownload();
        if (event.doneAll !== lastDone) { lastDone = event.doneAll; armStall(); }
        onProgress?.(event);
      } else if (event.kind === "cache") {
        onProgress?.(event);   // shown by the panel; the engine came from this browser, so no download clock
      } else if (event.kind === "ready") {
        stall = stop(stall);
        downloading = false;
        armRun();
        onProgress?.(event);
      }
    };
    const id = nextId++;
    try {
      if (signal?.aborted) return onAbort();
      if (warm) {
        ({ worker } = warm);
        const idle = warm.idle, clear = warm.clearTimer;
        warm = null;
        clear(idle);
      } else worker = createWorker();
      worker.onmessage = (e) => {
        const m = e.data;
        if (!m || m.id !== id) return;   // an answer meant for another run
        if (m.event) { onEvent(m.event); return; }
        finish(m.ok ? { circuit: m.result.circuit ?? null, problems: m.result.problems ?? [] } : failure(m.engineProblem ? "engine" : "import", m.error), m.ok === true && m.engine === true);
      };
      worker.onerror = (e) => { e.preventDefault?.(); finish(failure("import", e.message || "the import could not start")); };
      signal?.addEventListener?.("abort", onAbort);
      armRun();
      worker.postMessage({ id, files, top: top || undefined, synthesis: synthesis === true, askFirst: synthesis === true && onAsk !== null });
    } catch (e) {
      finish(failure("import", e.message));
    }
  });
}
