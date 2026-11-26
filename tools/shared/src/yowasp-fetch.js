// The synthesis engine's files, fetched pre-gzipped (F22.1c). The vendored @yowasp/yosys bundle.js fetches ./yosys.core.wasm ... and
// ./yosys-resources.0.tar by fixed names, and takes `globalThis.fetch` when it is imported. Pages gives a .gz back untouched, so
// this wrapper (installed in the import Worker before the bundle is imported) answers those five requests from `<name>.gz`,
// unpacks them as a stream and reports progress. Every other request goes to the real fetch. The vendored package is not changed.
//
//   const engine = installYowaspFetch({ onProgress, onReady, sizes, beforeDownload });
//   ... import the bundle ...
//   engine.restore();
//
// No DOM. Needs fetch, Response, ReadableStream and DecompressionStream (a Worker or Deno has them).

export const ENGINE_FILES = ["yosys.core.wasm", "yosys.core2.wasm", "yosys.core3.wasm", "yosys.core4.wasm", "yosys-resources.0.tar"];

/** An error to show as it is: the engine could not be fetched or unpacked. `engine` marks it for the page. */
export class EngineError extends Error {
  constructor(message) { super(message); this.name = "EngineError"; this.engine = true; }
}

const fileOf = (url) => {
  try {
    const u = new URL(url);
    const name = decodeURIComponent(u.pathname.split("/").pop());
    return ENGINE_FILES.includes(name) && /\/yowasp\//.test(u.pathname) ? name : null;
  } catch { return null; }
};

/**
 * Replace `target.fetch`. Options:
 *   sizes           { "<file>.gz": bytes }, or an async function giving it (called when the engine is first needed), so progress knows the whole; without it `totalAll` is 0
 *   onProgress(e)   { file, done, total, doneAll, totalAll } as compressed bytes arrive
 *   onReady()       once, when the last of the five files has been read
 *   beforeDownload  async (bytes) => boolean, asked once before the first byte is fetched (Data Saver); false cancels with an error
 *   cache           an engine cache (yowasp-cache.js), or an async function giving one or null (F22.1c-3). A file it holds is used with no
 *                   download, no progress and no Data Saver question; a file downloaded is kept after its SHA-256 matches
 *   onCache(e)      { state: "hit" } on the first file taken from the cache; { state: "stored" } once all five are kept (some downloaded)
 *   fetchImpl       the real fetch (default: the one being replaced)
 *   target          where to install (default: globalThis)
 */
export function installYowaspFetch({ onProgress = () => {}, onReady = () => {}, sizes = {}, beforeDownload = null, cache = null, onCache = () => {}, fetchImpl, target = globalThis } = {}) {
  const real = fetchImpl ?? target.fetch.bind(target);
  const original = target.fetch;
  let known = null, totalAll = 0;
  const loadSizes = async () => {
    if (known) return;
    try { known = (typeof sizes === "function" ? await sizes() : sizes) ?? {}; } catch { known = {}; }   // sizes only make progress whole; the download goes on without them
    totalAll = ENGINE_FILES.reduce((n, f) => n + (known[`${f}.gz`] ?? 0), 0);
  };
  const finished = new Set();
  let doneAll = 0, asked = null, cacheObj, hits = 0, kept = 0;
  const getCache = async () => {
    if (cacheObj === undefined) { try { cacheObj = (typeof cache === "function" ? await cache() : cache) ?? null; } catch { cacheObj = null; } }
    return cacheObj;
  };
  const settle = async (how) => {   // a file is in the cache, from before or just now
    if (how === "hit") { if (hits++ === 0) onCache({ state: "hit" }); } else kept++;
    if (hits + kept === ENGINE_FILES.length) {
      await cacheObj.finish?.();
      if (kept > 0) onCache({ state: "stored" });
    }
  };
  const answer = (stream, file, collected) => new Response(new ReadableStream({
    async pull(controller) {
      let chunk;
      try { chunk = await stream.read(); } catch (err) {
        controller.error(err instanceof EngineError ? err : new EngineError(`The synthesis engine file ${file} is incomplete or damaged.`));
        return;
      }
      if (chunk.done) {
        if (collected && cacheObj && (await cacheObj.put(file, collected()))) await settle("kept");
        controller.close();
        finished.add(file);
        if (finished.size === ENGINE_FILES.length) onReady();
      } else controller.enqueue(chunk.value);
    },
    cancel: () => stream.cancel(),
  }), { status: 200, headers: { "Content-Type": file.endsWith(".wasm") ? "application/wasm" : "application/octet-stream" } });

  async function engineFetch(url, file) {
    if (typeof DecompressionStream === "undefined") throw new EngineError("This browser cannot unpack the synthesis engine (no DecompressionStream).");
    if (await getCache()) {
      const bytes = await cacheObj.get(file);
      if (bytes) {
        await settle("hit");
        const packed = new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }).pipeThrough(new DecompressionStream("gzip"));
        return answer(packed.getReader(), file, null);
      }
    }
    await loadSizes();
    asked ??= Promise.resolve(beforeDownload ? beforeDownload(totalAll) : true);
    if (!(await asked)) throw new EngineError("The synthesis engine was not downloaded.");
    let response;
    try {
      response = await real(`${url}.gz`);
    } catch (err) {
      throw new EngineError(`The synthesis engine could not be downloaded: ${err.message}`);
    }
    if (!response.ok) throw new EngineError(`The synthesis engine could not be downloaded: the server answered ${response.status}.`);
    const total = Number(response.headers.get("content-length")) || known[`${file}.gz`] || 0;
    const reader = response.body.getReader();
    let done = 0;
    const chunks = [];   // the compressed bytes, to keep if the cache is there

    const read = async () => {
      let chunk;
      try { chunk = await reader.read(); } catch (err) { throw new EngineError(`The synthesis engine could not be downloaded: ${err.message}`); }
      if (!chunk.done) {
        done += chunk.value.length;
        if (cacheObj) chunks.push(chunk.value);
        doneAll += chunk.value.length;
        onProgress({ file, done, total, doneAll, totalAll });
      }
      return chunk;
    };

    // The host may serve the .gz untouched, or the browser may already have decoded it: the first two bytes tell (as for slang).
    let first = new Uint8Array(0);
    while (first.length < 2) {
      const chunk = await read();
      if (chunk.done) break;
      first = Uint8Array.from([...first, ...chunk.value]);
    }
    const packed = first[0] === 0x1f && first[1] === 0x8b;
    const source = new ReadableStream({
      start(controller) { if (first.length) controller.enqueue(first); },
      async pull(controller) {
        const chunk = await read();
        if (chunk.done) controller.close(); else controller.enqueue(chunk.value);
      },
      cancel: () => reader.cancel(),
    });
    const unpacked = (packed ? source.pipeThrough(new DecompressionStream("gzip")) : source).getReader();
    const joined = () => { const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let at = 0; for (const c of chunks) { all.set(c, at); at += c.length; } return all; };
    return answer(unpacked, file, packed ? joined : null);   // not kept if the browser had already decoded it: those are not the pinned bytes
  }

  target.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    const file = url ? fileOf(url) : null;
    return file ? engineFetch(new URL(url).href, file) : real(input, init);
  };
  return { restore() { target.fetch = original; } };
}
