// The Worker that runs circuit-model's SystemVerilog importer (F22.1b, F22.1c). A module Worker, loaded from the pinned copy in ./sv/.
// Slang is always there; the Yosys synthesis engine (./sv/third_party/yowasp/, pre-gzipped) is fetched, on demand, only when a
// module has always_comb / always_ff / always_latch (the importer asks for it then). The page may keep this Worker warm after a
// run that loaded the engine (svjob.js), so the engines are made once and kept.
//
// Page to Worker:   { id, files, top, synthesis, askFirst }   run an import; `synthesis: true` allows the engine, `askFirst` asks before downloading
//                   { id, consent: true | false }     the answer to an `ask` event
// Worker to page:   { id, event: { kind: "ask", bytes } }                          waiting for consent before downloading `bytes`
//                   { id, event: { kind: "download", file, done, total, doneAll, totalAll } }
//                   { id, event: { kind: "cache", state: "hit" | "stored" } }     the engine came from, or was kept in, this browser's Cache Storage (F22.1c-3)
//                   { id, event: { kind: "ready" } }                               the engine's five files are read
//                   { id, ok: true, result, engine }  or  { id, ok: false, error, engine: loaded, engineProblem: bool }

import { importSystemVerilog } from "./sv/import/sv/index.mjs";
import { createBrowserEngines } from "./sv/import/sv/engines-browser.mjs";
import { installYowaspFetch } from "./yowasp-fetch.js";
import { createEngineCache } from "./yowasp-cache.js";

const ENGINE_DIR = new URL("./sv/third_party/yowasp/", import.meta.url);

let current = null;        // { id, askFirst } of the run in progress
let engineReady = false;   // the engine's files were all read (so Yosys is loaded in this Worker)
let waiting = null;        // resolves the consent question

const post = (message) => self.postMessage(message);

/** The MANIFEST (1 KB), fetched no-cache and only when the engine is first needed; null if it cannot be had. It gives the cache its key and progress its sizes. */
let manifestOnce = null;
const getManifest = () => manifestOnce ??= (async () => {
  try {
    const response = await fetch(new URL("MANIFEST.json", ENGINE_DIR), { cache: "no-cache" });
    return response.ok ? await response.json() : null;
  } catch { return null; }
})();

/** { "<file>.gz": bytes } from the MANIFEST, so progress knows the whole. */
async function engineSizes() {
  const manifest = await getManifest();
  return Object.fromEntries((manifest?.files ?? []).map((f) => [f.name, f.bytes]));
}

installYowaspFetch({
  sizes: engineSizes,
  cache: async () => createEngineCache({ manifest: await getManifest(), base: ENGINE_DIR }),   // null: no Cache Storage, or no MANIFEST: the plain download
  onCache: (e) => current && post({ id: current.id, event: { kind: "cache", ...e } }),
  onProgress: (e) => current && post({ id: current.id, event: { kind: "download", ...e } }),
  onReady: () => { engineReady = true; if (current) post({ id: current.id, event: { kind: "ready" } }); },
  beforeDownload: (bytes) => {
    if (!current?.askFirst) return true;
    return new Promise((resolve) => {
      waiting = resolve;
      post({ id: current.id, event: { kind: "ask", bytes } });
    });
  },
});

let engines = null, slangOnly = null;
/** The page opts in to synthesis (F22.1c-2): until then behavioural code is refused with its line, as in F22.1b. Both share one slang. */
const getEngines = (synthesis) => {
  engines ??= createBrowserEngines({ yosysModule: new URL("bundle.js", ENGINE_DIR).href });
  return synthesis ? engines : (slangOnly ??= { runSlang: engines.runSlang });
};

self.onmessage = async (e) => {
  const m = e.data ?? {};
  if (m.consent !== undefined) {
    const resolve = waiting;
    waiting = null;
    resolve?.(m.consent === true);
    return;
  }
  const { id, files, top, askFirst, synthesis } = m;
  current = { id, askFirst: askFirst === true };
  try {
    const result = await importSystemVerilog(files, { top, engines: getEngines(synthesis === true) });
    post({ id, ok: true, result, engine: engineReady });
  } catch (err) {
    post({ id, ok: false, error: String(err?.message ?? err), engine: engineReady, engineProblem: err?.engine === true });
  } finally {
    current = null;
  }
};
