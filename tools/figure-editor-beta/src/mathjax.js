// Loads MathJax 4 (SVG output, STIX2 font) on first use and typesets TeX to SVG text. Browser only.
//
// The bundle is the one the site already pins for its own maths: @mathjax/mathjax-stix2-font 4.1.3, here
// its tex-mml-svg-mathjax-stix2.js build (proposal section 6). fontCache "none" makes every glyph an inline
// path, so a typeset label needs no font and no shared definitions. labels.js turns the text into nodes.
//
// Two MathJax 4 behaviours matter here, both found by checking the glyphs of a real label (A + B lost its
// "+ B"):
//   - Automatic line breaking is on by default. A label has no container width, so MathJax would split
//     "A+B" into two <svg> lines. Inline breaking is switched off, and output in more than one piece is refused.
//   - Glyphs of less common characters live in dynamic font files. They are all loaded once, after start-up,
//     so the synchronous tex2svg below is complete. (The promise form, tex2svgPromise, never settled in
//     headless Chrome, so it is not used.)

import { parseTypeset } from "./labels.js";

export const MATHJAX_URL = "https://cdn.jsdelivr.net/npm/@mathjax/mathjax-stix2-font@4.1.3/tex-mml-svg-mathjax-stix2.js";

/** The MathJax configuration the editor needs. test/fixtures/capture-mathjax.html uses the same. */
export const MATHJAX_CONFIG = { startup: { typeset: false }, svg: { fontCache: "none", linebreaks: { inline: false } } };

let loading = null;

export function loadMathJax() {
  loading ??= new Promise((resolve, reject) => {
    if (window.MathJax?.tex2svg) { resolve(window.MathJax); return; }
    window.MathJax = structuredClone(MATHJAX_CONFIG);
    const s = document.createElement("script");
    s.src = MATHJAX_URL;
    s.async = true;
    s.onload = () => window.MathJax.startup.promise.then(async () => {
      // A failure here is not fatal: tex2svg then reports any character whose glyph it could not load.
      try { await window.MathJax.startup.output.font.loadDynamicFiles(); } catch { /* reported per label */ }
      resolve(window.MathJax);
    }, reject);
    s.onerror = () => { loading = null; reject(new Error("could not load MathJax from jsDelivr (offline?)")); };
    document.head.append(s);
  });
  return loading;
}

/** Typeset one TeX string to SVG text (or throw MathJax's error). */
function tex2svgText(MathJax, tex) {
  const node = MathJax.tex2svg(tex, { display: false });
  const svgs = node.querySelectorAll("svg");
  if (svgs.length !== 1) throw new Error(svgs.length ? "MathJax broke the label over several lines" : "MathJax produced no SVG");
  return new XMLSerializer().serializeToString(svgs[0]);
}

/**
 * Make sure `cache` (a Map from TeX to parseTypeset's result) holds every string in `needed`.
 * A string that fails is cached as {ok: false, error}, so it is not retried on every redraw.
 * Returns true if anything was added.
 */
export async function typesetAll(needed, cache) {
  const todo = needed.filter((t) => !cache.has(t) || cache.get(t).retry);
  if (!todo.length) return false;
  let MathJax;
  try { MathJax = await loadMathJax(); } catch (e) {
    for (const t of todo) cache.set(t, { ok: false, error: e.message, retry: true });
    return true;
  }
  for (const t of todo) {
    try { cache.set(t, parseTypeset(tex2svgText(MathJax, t))); } catch (e) { cache.set(t, { ok: false, error: String(e.message ?? e).split("\n")[0] }); }
  }
  return true;
}
