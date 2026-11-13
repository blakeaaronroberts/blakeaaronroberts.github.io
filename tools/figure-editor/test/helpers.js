// Test helpers: plain asserts (no dependency), the pinned symbol pack read from disk,
// and real MathJax output (fixtures/mathjax.json) for the label tests.

import { loadPack } from "../src/pack.js";
import { parseTypeset } from "../src/labels.js";

const show = (v) => JSON.stringify(v);

export function assertEquals(actual, expected, msg = "") {
  if (show(actual) !== show(expected)) throw new Error(`${msg}\n  expected ${show(expected)}\n  actual   ${show(actual)}`);
}

export function assert(cond, msg = "assertion failed") {
  if (!cond) throw new Error(msg);
}

export function assertClose(actual, expected, tol = 1e-6, msg = "") {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${msg}\n  expected ${expected} (±${tol})\n  actual   ${actual}`);
}

export function assertThrows(fn, pattern, msg = "") {
  try { fn(); } catch (e) {
    if (pattern && !pattern.test(e.message)) throw new Error(`${msg}: threw "${e.message}", expected ${pattern}`);
    return;
  }
  throw new Error(`${msg}: expected an error`);
}

const packDir = new URL("../symbol-pack/", import.meta.url);
const readPack = (p) => Deno.readTextFile(new URL(p, packDir));
export const pack = await loadPack(readPack);

/** The pack read with some of its files changed: `patch(name, parsedJson)` edits a parsed JSON file in place. */
export const packWith = (patch) => loadPack(async (p) => {
  const text = await readPack(p);
  if (!p.endsWith(".json")) return text;
  const json = JSON.parse(text);
  patch(p, json);
  return JSON.stringify(json);
});

/** The real pack, but with every element mirrorable: for testing the mirror transform on any element. */
export const mirrorablePack = { ...pack, mirrorable: () => true };

export const fixture = async (name) => Deno.readTextFile(new URL(`fixtures/${name}`, import.meta.url));

/** Real MathJax 4 output for the TeX strings the tests use, parsed as the editor parses it. */
const captured = JSON.parse(await fixture("mathjax.json"));
export const mathjaxVersion = captured.mathjax;
export const typeset = new Map(Object.entries(captured.svg).map(([tex, svg]) => [tex, parseTypeset(svg)]));
