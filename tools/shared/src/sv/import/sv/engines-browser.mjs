// The SystemVerilog engines in a browser (page or module Worker). Prefer a
// Worker: slang is synchronous and the source is untrusted, so the page can
// stop a long run by terminating the Worker.
//
//   const engines = createBrowserEngines();
//   const { circuit, problems } = await importSystemVerilog({ "m.sv": text }, { engines });
//
// slang's gzipped binary is fetched on first use (1.5 MB). Yosys is loaded only
// when `yosysModule` is given and a module has always blocks (17 MB more);
// without it, such modules are reported as problems.

import { slangRunner, yosysRunner } from "./engine-core.mjs";

async function fetchBytes(url, what) {
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`${what} could not be downloaded: ${err.message}`);
  }
  if (!response.ok) throw new Error(`${what} could not be downloaded: the server answered ${response.status}`);
  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch (err) {
    throw new Error(`${what} could not be downloaded: ${err.message}`);
  }
}

/** A host may serve the .gz untouched, or the browser may already have decoded it: the first two bytes tell. */
async function gunzipIfNeeded(bytes, what) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new Error(`${what} is incomplete or damaged`);
  }
}

async function compile(url, what) {
  const bytes = await gunzipIfNeeded(await fetchBytes(url, what), what);
  if (bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) throw new Error(`${what} is not WebAssembly`);
  try {
    return await WebAssembly.compile(bytes);
  } catch {
    throw new Error(`${what} is incomplete or damaged`);
  }
}

/**
 * Engines for importSystemVerilog. URLs may be absolute or relative to the page
 * or Worker; by default slang is beside this repository's files.
 *   slangModule  slang.mjs
 *   slangWasm    slang.wasm.gz (or the plain .wasm)
 *   yosysModule  @yowasp/yosys gen/bundle.js, with its .wasm and .tar files beside it
 */
export function createBrowserEngines({
  slangModule = new URL("../../third_party/slang/slang.mjs", import.meta.url).href,
  slangWasm = new URL("../../third_party/slang/slang.wasm.gz", import.meta.url).href,
  yosysModule,
} = {}) {
  const absolute = (url) => new URL(url, globalThis.location?.href ?? import.meta.url).href;
  const engines = {
    runSlang: slangRunner(async () => {
      const [{ default: factory }, compiled] = await Promise.all([import(absolute(slangModule)), compile(absolute(slangWasm), "slang")]);
      return { factory, compiled };
    }),
  };
  if (yosysModule) engines.runYosys = yosysRunner(() => import(absolute(yosysModule)));
  return engines;
}
