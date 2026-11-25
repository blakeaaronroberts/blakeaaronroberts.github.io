// F22.1c: the fetch wrapper that answers the vendored YoWASP bundle's five fixed file requests from pre-gzipped files
// (tools/shared/src/yowasp-fetch.js). A fake `fetch` stands in for the host; no engine runs here (see svengine.test.js).

import { ENGINE_FILES, EngineError, installYowaspFetch } from "../../shared/src/yowasp-fetch.js";
import { assert, assertEquals } from "./helpers.js";

const BASE = "https://example.test/tools/shared/src/sv/third_party/yowasp/";
const enc = (s) => new TextEncoder().encode(s);
const gzip = async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
const text = async (response) => new TextDecoder().decode(await response.arrayBuffer());

/** A target with a fake fetch serving `files` ({ "<name>.gz": bytes }); records every URL asked for. */
function host(files, { status = 200, chunk = 5 } = {}) {
  const asked = [];
  const target = {
    fetch: async (input) => {
      const url = typeof input === "string" ? input : input.href ?? input.url;
      asked.push(url);
      const name = url.split("/").pop();
      if (status !== 200) return new Response("no", { status });
      if (!(name in files)) return new Response("not here", { status: 404 });
      const bytes = files[name];
      const pieces = [];
      for (let i = 0; i < bytes.length; i += chunk) pieces.push(bytes.subarray(i, i + chunk));
      return new Response(new ReadableStream({ start(c) { pieces.forEach((p) => c.enqueue(p)); c.close(); } }), { status: 200, headers: { "content-length": String(bytes.length) } });
    },
  };
  return { target, asked };
}

async function allFiles(contents) {
  const files = {};
  for (const name of ENGINE_FILES) files[`${name}.gz`] = await gzip(enc(contents(name)));
  return files;
}

Deno.test("the five engine files are fetched as .gz and come back unpacked, with the right content type", async () => {
  const { target, asked } = host(await allFiles((n) => `contents of ${n}`));
  installYowaspFetch({ target });
  for (const name of ENGINE_FILES) {
    const r = await target.fetch(new URL(name, BASE));
    assertEquals(await text(r), `contents of ${name}`);
    assertEquals(r.headers.get("content-type"), name.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
  }
  assertEquals(asked, ENGINE_FILES.map((n) => `${BASE}${n}.gz`));
});

Deno.test("any other address goes to the real fetch untouched", async () => {
  const { target, asked } = host({});
  installYowaspFetch({ target });
  await target.fetch("https://example.test/tools/shared/src/sv/third_party/slang/slang.wasm.gz");
  await target.fetch(`${BASE}bundle.js`);
  await target.fetch("https://example.test/yosys.core.wasm");   // not in the yowasp folder
  assertEquals(asked, ["https://example.test/tools/shared/src/sv/third_party/slang/slang.wasm.gz", `${BASE}bundle.js`, "https://example.test/yosys.core.wasm"]);
});

Deno.test("bytes the browser has already decoded are passed through, as for slang", async () => {
  const { target } = host({ "yosys.core2.wasm.gz": enc("plain, not gzipped") });
  installYowaspFetch({ target });
  assertEquals(await text(await target.fetch(new URL("yosys.core2.wasm", BASE))), "plain, not gzipped");
});

Deno.test("progress counts the compressed bytes read; ready comes once, after the fifth file", async () => {
  const files = await allFiles((n) => n.repeat(40));
  const sizes = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length]));
  const { target } = host(files, { chunk: 7 });
  const events = [];
  let ready = 0;
  installYowaspFetch({ target, sizes, onProgress: (e) => events.push(e), onReady: () => ready++ });
  const totalAll = Object.values(sizes).reduce((a, b) => a + b, 0);
  for (const name of ENGINE_FILES) {
    assertEquals(ready, 0, "not ready before the last file");
    await (await target.fetch(new URL(name, BASE))).arrayBuffer();
  }
  assertEquals(ready, 1);
  const last = events.at(-1);
  assertEquals([last.doneAll, last.totalAll], [totalAll, totalAll]);
  const one = events.filter((e) => e.file === "yosys.core3.wasm");
  assertEquals(one.at(-1).done, sizes["yosys.core3.wasm.gz"]);
  assertEquals(one.at(-1).total, sizes["yosys.core3.wasm.gz"]);
  assert(one.every((e, i) => i === 0 || e.done >= one[i - 1].done), "progress goes forward");
});

Deno.test("a truncated .gz gives a readable error, not a silent short file", async () => {
  const whole = await gzip(enc("x".repeat(5000) + Math.random()));
  const { target } = host({ "yosys.core4.wasm.gz": whole.subarray(0, whole.length >> 1) });
  installYowaspFetch({ target });
  const r = await target.fetch(new URL("yosys.core4.wasm", BASE));
  let error;
  try { await r.arrayBuffer(); } catch (e) { error = e; }
  assert(error, "reading the truncated file did not fail");
  assert(/incomplete or damaged/.test(error.message), error.message);
  assert(/yosys\.core4\.wasm/.test(error.message), error.message);
});

Deno.test("a missing file, a busy host and a network failure each say what happened", async () => {
  const missing = host({});
  installYowaspFetch({ target: missing.target });
  const a = await missing.target.fetch(new URL("yosys.core.wasm", BASE)).catch((e) => e);
  assert(a instanceof EngineError && a.engine === true && /synthesis engine could not be downloaded.*404/.test(a.message), String(a.message));

  const busy = host({}, { status: 503 });
  installYowaspFetch({ target: busy.target });
  const b = await busy.target.fetch(new URL("yosys.core.wasm", BASE)).catch((e) => e);
  assert(/503/.test(b.message), b.message);

  const down = { fetch: async () => { throw new TypeError("Failed to fetch"); } };
  installYowaspFetch({ target: down });
  const c = await down.fetch(new URL("yosys.core.wasm", BASE)).catch((e) => e);
  assert(c.engine && /could not be downloaded: Failed to fetch/.test(c.message), c.message);
});

Deno.test("beforeDownload is asked once, with the whole size, before any byte is fetched; a no ends the download", async () => {
  const files = await allFiles(() => "x");
  const sizes = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length]));
  const { target, asked } = host(files);
  const questions = [];
  installYowaspFetch({ target, sizes, beforeDownload: async (bytes) => { questions.push(bytes); return false; } });
  const e1 = await target.fetch(new URL("yosys.core.wasm", BASE)).catch((e) => e);
  const e2 = await target.fetch(new URL("yosys.core2.wasm", BASE)).catch((e) => e);
  assert(e1.engine && e2.engine && /was not downloaded/.test(e1.message));
  assertEquals(questions, [Object.values(sizes).reduce((a, b) => a + b, 0)]);
  assertEquals(asked, [], "nothing was fetched");

  const yes = host(files);
  installYowaspFetch({ target: yes.target, sizes, beforeDownload: async () => true });
  assertEquals(await text(await yes.target.fetch(new URL("yosys.core3.wasm", BASE))), "x");
});

Deno.test("restore puts the real fetch back", async () => {
  const { target } = host({});
  const before = target.fetch;
  const engine = installYowaspFetch({ target });
  assert(target.fetch !== before);
  engine.restore();
  assert(target.fetch === before);
});
