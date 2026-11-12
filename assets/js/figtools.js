// figtools.js — small numerical toolkit for the site's computed figures.
// Every project figure is generated from published numbers by these functions at page load;
// nothing is traced or hand-drawn. Polynomials are coefficient arrays in DESCENDING powers
// (e.g. [1, -1.652, 0.8898] = z^2 - 1.652 z + 0.8898), matching how the reports print them.

// ---------- complex arithmetic (re, im pairs) ----------
const c = (re, im = 0) => ({ re, im });
const cadd = (a, b) => c(a.re + b.re, a.im + b.im);
const csub = (a, b) => c(a.re - b.re, a.im - b.im);
const cmul = (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const cabs = (a) => Math.hypot(a.re, a.im);

/** Product of two real polynomials (descending powers). */
export function polyMul(a, b) {
  const r = new Array(a.length + b.length - 1).fill(0);
  a.forEach((ai, i) => b.forEach((bj, j) => { r[i + j] += ai * bj; }));
  return r;
}

/** Evaluate a real polynomial at complex z (Horner). */
export function polyEval(p, z) {
  return p.reduce((acc, k) => cadd(cmul(acc, z), c(k)), c(0));
}

/** All complex roots of a real polynomial (Durand–Kerner iteration). Returns [{re, im}]. */
export function roots(p, iters = 500) {
  const lead = p[0];
  const a = p.map((k) => k / lead);
  const n = a.length - 1;
  const seed = c(0.4, 0.9);                                  // textbook starting points (0.4 + 0.9i)^k
  let z = [];
  for (let k = 0, s = c(1); k < n; k++, s = cmul(s, seed)) z.push(s);
  for (let it = 0; it < iters; it++) {
    let delta = 0;
    z = z.map((zi, i) => {
      let den = c(1);
      z.forEach((zj, j) => { if (j !== i) den = cmul(den, csub(zi, zj)); });
      const step = cdiv(polyEval(a, zi), den);
      delta = Math.max(delta, cabs(step));
      return csub(zi, step);
    });
    if (delta < 1e-14) break;
  }
  return z.map((r) => c(r.re, Math.abs(r.im) < 1e-10 ? 0 : r.im));
}

/** Discrete-time frequency response of H(z)=num/den at frequency f (Hz) for sample rate fs. */
export function freqz(num, den, f, fs) {
  const w = 2 * Math.PI * f / fs;
  const z = c(Math.cos(w), Math.sin(w));
  const h = cdiv(polyEval(num, z), polyEval(den, z));
  return { f, mag: cabs(h), dB: 20 * Math.log10(cabs(h)), phase: Math.atan2(h.im, h.re) };
}

/** Step response of H(z)=num/den (equal orders, descending powers) via the difference equation. */
export function stepResponse(num, den, nSamples) {
  const b = num.map((k) => k / den[0]), a = den.map((k) => k / den[0]);
  const y = [];
  for (let n = 0; n < nSamples; n++) {
    let acc = 0;
    for (let k = 0; k < b.length; k++) if (n - k >= 0) acc += b[k];          // x[n-k] = 1 for n-k >= 0
    for (let k = 1; k < a.length; k++) if (n - k >= 0) acc -= a[k] * y[n - k];
    y.push(acc);
  }
  return y;
}

/** Complete elliptic integral of the first kind K(k) via the arithmetic–geometric mean. */
export function ellipK(k) {
  let a = 1, g = Math.sqrt(1 - k * k);
  for (let i = 0; i < 40 && Math.abs(a - g) > 1e-15; i++) [a, g] = [(a + g) / 2, Math.sqrt(a * g)];
  return Math.PI / (2 * a);
}

/**
 * Minimum IIR low-pass orders for a digital spec (bilinear transform, pre-warped edges).
 * fp, fs_ = passband / stopband edges (Hz); fsamp = sample rate; Ap = max passband ripple (dB);
 * As = min stopband attenuation (dB). Returns exact (fractional) and rounded-up orders.
 */
export function lowpassOrders(fp, fs_, fsamp, Ap, As) {
  const wp = Math.tan(Math.PI * fp / fsamp), ws = Math.tan(Math.PI * fs_ / fsamp);
  const ratio = ws / wp;
  const D = (Math.pow(10, As / 10) - 1) / (Math.pow(10, Ap / 10) - 1);
  const butter = Math.log10(D) / (2 * Math.log10(ratio));
  const cheby = Math.acosh(Math.sqrt(D)) / Math.acosh(ratio);              // Chebyshev I and II share this bound
  const k = 1 / ratio, k1 = 1 / Math.sqrt(D);
  const ellip = (ellipK(k) * ellipK(Math.sqrt(1 - k1 * k1))) / (ellipK(Math.sqrt(1 - k * k)) * ellipK(k1));
  const row = (name, x) => ({ name, exact: x, order: Math.ceil(x - 1e-9) });
  return [row("Butterworth", butter), row("Chebyshev Type I", cheby), row("Chebyshev Type II", cheby), row("Elliptic", ellip)];
}

/** Equal-temperament frequency of a MIDI note number (A4 = 69 = 440 Hz). */
export const midiToHz = (m, a4 = 440) => a4 * Math.pow(2, (m - 69) / 12);

/** Pitch error of a measured frequency against a target, in cents. */
export const centsError = (measured, target) => 1200 * Math.log2(measured / target);

// ---------- shared plot styling (figures sit on the site's off-white "paper plate") ----------
export const palette = { ink: "#1a1917", blue: "#1f4e79", orange: "#b5541a", muted: "#6b675f", grid: "#cfcac0", spec: "#d9d3c6" };
export const plotStyle = { fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: "12px", background: "transparent", color: palette.ink, overflow: "visible" };

/** Evenly spaced samples [a, b] (n points). */
export const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
