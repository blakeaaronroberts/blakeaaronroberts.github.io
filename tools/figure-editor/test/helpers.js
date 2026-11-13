// Test helpers: plain asserts (no dependency) and the pinned symbol pack read from disk.

import { loadPack } from "../src/pack.js";

const show = (v) => JSON.stringify(v);

export function assertEquals(actual, expected, msg = "") {
  if (show(actual) !== show(expected)) throw new Error(`${msg}\n  expected ${show(expected)}\n  actual   ${show(actual)}`);
}

export function assert(cond, msg = "assertion failed") {
  if (!cond) throw new Error(msg);
}

export function assertThrows(fn, pattern, msg = "") {
  try { fn(); } catch (e) {
    if (pattern && !pattern.test(e.message)) throw new Error(`${msg}: threw "${e.message}", expected ${pattern}`);
    return;
  }
  throw new Error(`${msg}: expected an error`);
}

const packDir = new URL("../symbol-pack/", import.meta.url);
export const pack = await loadPack((p) => Deno.readTextFile(new URL(p, packDir)));

/** The real pack, but with every element mirrorable: for testing the mirror transform before the toolbox adds the flag. */
export const mirrorablePack = { ...pack, mirrorable: () => true };

export const fixture = async (name) => Deno.readTextFile(new URL(`fixtures/${name}`, import.meta.url));
