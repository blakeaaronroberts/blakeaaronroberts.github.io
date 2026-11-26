// Keeps the synthesis engine's .gz files in Cache Storage (F22.1c-3), so a returning visitor does not download 17 MB again after
// every deploy (Pages gives every file a new ETag on each deploy, even when the bytes are the same).
//
//   const cache = createEngineCache({ manifest, base });   // null when there is nothing to key on or no Cache Storage
//   const bytes = await cache.get("yosys.core.wasm");      // the .gz bytes, checked against the MANIFEST SHA-256, or null
//   await cache.put("yosys.core.wasm", gzBytes);           // true if kept (hash checked first)
//   await cache.finish();                                  // after all five are kept: delete older yowasp-* caches
//
// The cache is named `yowasp-<version>-<sha256 prefix>`; the prefix comes from the .gz hashes in the MANIFEST (fetched no-cache by
// the Worker), so a new engine means a new name. Entries are keyed by their own URL under the engine folder; nothing is ever
// fetched from that address through here. Nothing in this file throws: any failure (private mode, quota, eviction) reads as a miss.
// No DOM. Needs crypto.subtle and, to keep anything, Cache Storage.

import { ENGINE_FILES } from "./yowasp-fetch.js";

export const KEY_PREFIX = "yowasp-";

const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256Hex = async (bytes) => hex(await crypto.subtle.digest("SHA-256", bytes));

/** The .gz entry for an engine file in the MANIFEST: { name, bytes, sha256 }, or undefined. */
const entryOf = (manifest, file) => (manifest?.files ?? []).find((f) => f.name === `${file}.gz`);

/** `yowasp-<version>-<12 hex>`: the version, and a prefix of the SHA-256 of the five .gz hashes. Null if the MANIFEST lacks any. */
export async function engineCacheKey(manifest) {
  if (!manifest?.version) return null;
  const lines = ENGINE_FILES.map((f) => { const e = entryOf(manifest, f); return e?.sha256 ? `${f}.gz:${e.sha256}` : null; });
  if (lines.includes(null)) return null;
  return `${KEY_PREFIX}${manifest.version}-${(await sha256Hex(new TextEncoder().encode(lines.join("\n")))).slice(0, 12)}`;
}

export async function createEngineCache({ manifest, base, caches = globalThis.caches } = {}) {
  if (!caches || typeof caches.open !== "function") return null;
  let key;
  try { key = await engineCacheKey(manifest); } catch { key = null; }
  if (!key) return null;
  const urlOf = (file) => new URL(`${file}.gz`, base).href;
  let store = null;
  const open = async () => (store ??= await caches.open(key));

  return {
    key,
    async get(file) {
      try {
        const entry = entryOf(manifest, file);
        const c = await open();
        const response = await c.match(urlOf(file));
        if (!response) return null;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (entry?.sha256 && (await sha256Hex(bytes)) === entry.sha256) return bytes;
        await c.delete(urlOf(file));   // damaged or not what the MANIFEST says: forget it and download again
        return null;
      } catch { return null; }
    },
    async put(file, bytes) {
      try {
        const entry = entryOf(manifest, file);
        if (!entry?.sha256 || (await sha256Hex(bytes)) !== entry.sha256) return false;   // never keep bytes that are not the pinned file
        const c = await open();
        await c.put(urlOf(file), new Response(bytes, { headers: { "Content-Type": "application/gzip", "Content-Length": String(bytes.length) } }));
        return true;
      } catch { return false; }
    },
    async finish() {
      try {
        for (const name of await caches.keys()) if (name.startsWith(KEY_PREFIX) && name !== key) await caches.delete(name);
      } catch { /* best effort */ }
    },
  };
}
