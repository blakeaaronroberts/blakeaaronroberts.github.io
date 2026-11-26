// F22.1c-3: the engine kept in Cache Storage (tools/shared/src/yowasp-cache.js) and the wrapper that uses it. A fake CacheStorage
// and a fake host stand in; nothing here touches a network or a browser.

import { ENGINE_FILES, installYowaspFetch } from "../../shared/src/yowasp-fetch.js";
import { KEY_PREFIX, createEngineCache, engineCacheKey, sha256Hex } from "../../shared/src/yowasp-cache.js";
import { assert, assertEquals } from "./helpers.js";

const BASE = "https://example.test/tools/shared/src/sv/third_party/yowasp/";
const enc = (s) => new TextEncoder().encode(s);
const gzip = async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
const text = async (response) => new TextDecoder().decode(await response.arrayBuffer());

/** The five .gz files for `tag`, and a MANIFEST describing them (version and hashes as copy-yowasp.js writes them). */
async function engine(tag, version = "0.71.1284") {
  const files = {}, manifest = { version, files: [] };
  for (const name of ENGINE_FILES) {
    const gz = await gzip(enc(`${tag} ${name}`));
    files[`${name}.gz`] = gz;
    manifest.files.push({ name: `${name}.gz`, bytes: gz.length, sha256: await sha256Hex(gz) });
  }
  return { files, manifest };
}

/** A CacheStorage kept in a Map: name -> Map(url -> bytes). `fail` makes every call throw (private mode). */
function fakeCaches({ fail = false } = {}) {
  const all = new Map();
  const guard = () => { if (fail) throw new DOMException("denied", "SecurityError"); };
  return {
    all,
    async open(name) {
      guard();
      if (!all.has(name)) all.set(name, new Map());
      const m = all.get(name);
      return {
        async match(url) { const b = m.get(url); return b ? new Response(b.slice()) : undefined; },
        async put(url, response) { m.set(url, new Uint8Array(await response.arrayBuffer())); },
        async delete(url) { return m.delete(url); },
      };
    },
    async keys() { guard(); return [...all.keys()]; },
    async delete(name) { guard(); return all.delete(name); },
  };
}

function host(files) {
  const asked = [];
  const target = {
    fetch: async (input) => {
      const url = typeof input === "string" ? input : input.href ?? input.url;
      asked.push(url);
      const bytes = files[url.split("/").pop()];
      if (!bytes) return new Response("not here", { status: 404 });
      return new Response(new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }), { status: 200, headers: { "content-length": String(bytes.length) } });
    },
  };
  return { target, asked };
}

/** Fetch all five through a wrapper that has the cache; returns what came back, the URLs asked of the host, and the cache events. */
async function fetchAll({ files, manifest, caches }) {
  const { target, asked } = host(files);
  const events = [], progress = [];
  const wrapper = installYowaspFetch({ target, onProgress: (e) => progress.push(e), onCache: (e) => events.push(e.state), cache: async () => createEngineCache({ manifest, base: BASE, caches }) });
  const got = [];
  for (const name of ENGINE_FILES) got.push(await text(await target.fetch(new URL(name, BASE))));
  wrapper.restore();
  return { got, asked, events, progress };
}

Deno.test("the cache key is the version and a prefix of the hash of the five .gz hashes", async () => {
  const a = await engine("a"), b = await engine("b"), c = await engine("a", "0.72.0");
  const key = await engineCacheKey(a.manifest);
  assert(/^yowasp-0\.71\.1284-[0-9a-f]{12}$/.test(key), key);
  assertEquals(await engineCacheKey(a.manifest), key);                       // the same files, the same key
  assert((await engineCacheKey(b.manifest)) !== key, "other bytes, other key");
  assert((await engineCacheKey(c.manifest)) !== key, "other version, other key");
  assertEquals(await engineCacheKey({ version: "1", files: a.manifest.files.slice(1) }), null);   // a MANIFEST missing a file cannot key anything
  assertEquals(await engineCacheKey(null), null);
});

Deno.test("first run downloads and keeps all five; the second run asks the host for none of them and shows no progress", async () => {
  const e = await engine("one"), caches = fakeCaches();
  const first = await fetchAll({ ...e, caches });
  assertEquals(first.asked.length, 5);
  assertEquals(first.events, ["stored"]);
  assert(first.progress.length > 0);
  const kept = caches.all.get(await engineCacheKey(e.manifest));
  assertEquals(kept.size, 5);
  assert([...kept.keys()].every((u) => u.startsWith(BASE) && u.endsWith(".gz")));
  const second = await fetchAll({ ...e, caches });
  assertEquals(second.asked, []);
  assertEquals(second.progress, []);
  assertEquals(second.events, ["hit"]);
  assertEquals(second.got, ENGINE_FILES.map((n) => `one ${n}`));
});

Deno.test("a stored run deletes the older yowasp-* caches and leaves other caches alone", async () => {
  const old = await engine("old"), now = await engine("new"), caches = fakeCaches();
  await fetchAll({ ...old, caches });
  caches.all.set("something-else", new Map());
  const oldKey = await engineCacheKey(old.manifest), newKey = await engineCacheKey(now.manifest);
  assert(oldKey !== newKey);
  const r = await fetchAll({ ...now, caches });
  assertEquals(r.asked.length, 5);                      // a changed key is one fresh download
  assertEquals([...caches.all.keys()].sort(), [newKey, "something-else"].sort());
  assert(newKey.startsWith(KEY_PREFIX));
});

Deno.test("an evicted cache falls back to the download, and keeps the files again", async () => {
  const e = await engine("evict"), caches = fakeCaches();
  await fetchAll({ ...e, caches });
  caches.all.clear();                                    // the browser evicted it
  const r = await fetchAll({ ...e, caches });
  assertEquals(r.asked.length, 5);
  assertEquals(r.got, ENGINE_FILES.map((n) => `evict ${n}`));
  assertEquals(caches.all.get(await engineCacheKey(e.manifest)).size, 5);
});

Deno.test("Cache Storage that throws, or is missing, is the plain download with no error", async () => {
  const e = await engine("plain");
  for (const caches of [fakeCaches({ fail: true }), null]) {
    const r = await fetchAll({ ...e, caches });
    assertEquals(r.asked.length, 5);
    assertEquals(r.got, ENGINE_FILES.map((n) => `plain ${n}`));
    assertEquals(r.events, []);
    assert(r.progress.length > 0);
  }
});

Deno.test("a corrupted entry is deleted and downloaded again; the hash is checked, not just the presence", async () => {
  const e = await engine("good"), caches = fakeCaches();
  await fetchAll({ ...e, caches });
  const kept = caches.all.get(await engineCacheKey(e.manifest));
  const victim = `${BASE}yosys.core3.wasm.gz`;
  kept.set(victim, enc("garbage that is not the pinned file"));
  const r = await fetchAll({ ...e, caches });
  assertEquals(r.asked, [victim]);                       // only the damaged one
  assertEquals(r.got, ENGINE_FILES.map((n) => `good ${n}`));
  assertEquals(await sha256Hex(kept.get(victim)), e.manifest.files.find((f) => f.name === "yosys.core3.wasm.gz").sha256);
});

Deno.test("bytes that do not match the MANIFEST are never kept", async () => {
  const e = await engine("real"), other = await engine("fake");
  const cache = await createEngineCache({ manifest: e.manifest, base: BASE, caches: fakeCaches() });
  assertEquals(await cache.put("yosys.core.wasm", other.files["yosys.core.wasm.gz"]), false);
  assertEquals(await cache.get("yosys.core.wasm"), null);
  assertEquals(await cache.put("yosys.core.wasm", e.files["yosys.core.wasm.gz"]), true);
  assertEquals(await sha256Hex(await cache.get("yosys.core.wasm")), e.manifest.files[0].sha256);
});

Deno.test("no Cache Storage, or no usable MANIFEST, gives no cache at all", async () => {
  const e = await engine("x");
  assertEquals(await createEngineCache({ manifest: e.manifest, base: BASE, caches: null }), null);
  assertEquals(await createEngineCache({ manifest: null, base: BASE, caches: fakeCaches() }), null);
});
