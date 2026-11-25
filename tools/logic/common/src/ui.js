// Small page helpers shared by the logic tools that were built after the analyser (truth table, Boolean solver).
// Text from the person typing always goes in with textContent, never as HTML.

export const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
};
export const button = (label, onclick, title = "") => el("button", { type: "button", textContent: label, title, onclick: (e) => onclick(e.currentTarget) });
export const fileName = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, "_");
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function copyText(text, b) {
  const done = () => { const was = b.textContent; b.textContent = "Copied"; setTimeout(() => { b.textContent = was; }, 1200); };
  const fallback = () => { const t = el("textarea", { value: text }); document.body.append(t); t.select(); try { document.execCommand("copy"); done(); } catch { b.textContent = "Copy failed"; } t.remove(); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}

export function download(name, text, type = "application/json") {
  const a = el("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// MathJax: the site's pinned MathJax 4 bundle (same URL and hash as _quarto.yml). Quarto only loads it on pages that contain
// maths, and these pages make their maths at run time, so the page loads it itself unless it is already there.
const MATHJAX_URL = "https://cdn.jsdelivr.net/npm/@mathjax/mathjax-stix2-font@4.1.3/tex-mml-chtml-mathjax-stix2.js";
const MATHJAX_SRI = "sha384-CJjhmfvJA5XRHyZl+TpLl4s4BjLmd4GJzhwHAYQyq+Zu+728ElSiWdPtmhSuPG60";
let mathjax = null;
export function loadMathJax() {
  mathjax ??= new Promise((resolve, reject) => {
    const ready = () => window.MathJax.startup.promise.then(() => resolve(window.MathJax), reject);
    if (window.MathJax?.typesetPromise) { resolve(window.MathJax); return; }
    if (!window.MathJax) window.MathJax = { startup: { typeset: false }, tex: { inlineMath: [["\\(", "\\)"]] } };
    const s = el("script", { src: MATHJAX_URL, async: true, integrity: MATHJAX_SRI, crossOrigin: "anonymous" });
    s.onload = ready;
    s.onerror = () => { mathjax = null; reject(new Error("could not load MathJax (offline?)")); };
    document.head.append(s);
  });
  return mathjax;
}
export const typeset = (node) => loadMathJax().then((mj) => mj.typesetPromise([node])).catch(() => { /* the maths stays as TeX text */ });
