// SVG import (F12). No DOM, so the tests run it as the browser does.
//
// Our own exports carry their circuit in <metadata>: circuitFromSvg() gives it back, and the figure opens
// exactly as it was. Any other SVG becomes a backdrop to trace over: sanitizeSvg() rewrites it from an
// allow-list, so scripts, event handlers, external references, foreign content and CSS that fetches
// anything never get through. (The editor also shows the result through an <image>, where a browser runs
// no script and loads nothing, so there are two walls.)

import { MODULE_CM } from "./geometry.js";

export const MAX_SVG_BYTES = 5e6;

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g, (m, d, h, n) => (n ? ENT[n] : String.fromCodePoint(d ? +d : parseInt(h, 16))));
const encode = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The circuit text an exported SVG carries in its <metadata>, or null if it has none (it is some other SVG). */
export function circuitFromSvg(text) {
  const m = /<metadata[^>]*>([\s\S]*?)<\/metadata>/.exec(text);
  if (!m) return null;
  const inner = decode(m[1]).trim();
  return inner.startsWith("{") && /"schema"\s*:\s*"circuit\//.test(inner) ? inner : null;
}

/** Wrap a circuit's text for <metadata>: XML-escaped, nothing else changed, so it comes back byte for byte. */
export const metadataOf = (circuitText) => `  <metadata>${encode(circuitText).replace(/&quot;/g, '"')}</metadata>`;

// ---- a tolerant reader ------------------------------------------------------------------------

/** Parse enough XML to rewrite an SVG: elements, attributes, text. DOCTYPE and processing instructions are dropped, entities are never defined by the file. */
function read(text) {
  const root = { tag: "#root", attrs: [], kids: [] };
  const stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    const chunk = text.slice(i, lt < 0 ? text.length : lt);
    if (chunk) top().kids.push({ text: decode(chunk) });
    if (lt < 0) break;
    i = lt;
    if (text.startsWith("<!--", i)) { const e = text.indexOf("-->", i + 4); i = e < 0 ? text.length : e + 3; continue; }
    if (text.startsWith("<![CDATA[", i)) { const e = text.indexOf("]]>", i); const end = e < 0 ? text.length : e; top().kids.push({ text: text.slice(i + 9, end) }); i = e < 0 ? text.length : e + 3; continue; }
    if (text.startsWith("<?", i)) { const e = text.indexOf("?>", i); i = e < 0 ? text.length : e + 2; continue; }
    if (text.startsWith("<!", i)) {                        // DOCTYPE, with an internal subset in [ ] if it has one
      let depth = 0, j = i + 2;
      for (; j < text.length; j++) { if (text[j] === "[") depth++; else if (text[j] === "]") depth--; else if (text[j] === ">" && depth <= 0) break; }
      i = j + 1; continue;
    }
    if (text.startsWith("</", i)) {
      const e = text.indexOf(">", i);
      const name = text.slice(i + 2, e < 0 ? text.length : e).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag.toLowerCase() === name) { stack.length = k; break; }
      i = e < 0 ? text.length : e + 1; continue;
    }
    const m = /^<([A-Za-z_][\w:.-]*)/.exec(text.slice(i, i + 80));
    if (!m) { top().kids.push({ text: "<" }); i++; continue; }
    const node = { tag: m[1], attrs: [], kids: [] };
    i += m[0].length;
    const attr = /\s*([^\s=/>"']+)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+))?/y;
    for (;;) {
      attr.lastIndex = i;
      const a = attr.exec(text);
      if (!a || !a[0].trim()) break;
      node.attrs.push([a[1], decode(a[3] ?? a[4] ?? a[2] ?? "")]);
      i = attr.lastIndex;
    }
    while (i < text.length && /\s/.test(text[i])) i++;
    top().kids.push(node);
    if (text.startsWith("/>", i)) { i += 2; continue; }
    if (text[i] === ">") i++;
    stack.push(node);
  }
  return root;
}

// ---- the allow-list ------------------------------------------------------------------------------

const KEEP = new Set(["svg", "g", "defs", "symbol", "use", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "textpath",
  "title", "desc", "clippath", "mask", "marker", "pattern", "lineargradient", "radialgradient", "stop"]);
const UNWRAP = new Set(["a", "switch"]);             // keep what is inside, drop the wrapper
const TEXTY = new Set(["text", "tspan", "textpath", "title", "desc"]);
const CAMEL = { clippath: "clipPath", lineargradient: "linearGradient", radialgradient: "radialGradient", textpath: "textPath" };

const NAME = /^[A-Za-z_][\w:.-]*$/;
/** Is every url(...) in a value a reference to something inside the file? */
const localUrls = (v) => [...v.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)].every((m) => m[2].trim().startsWith("#"));
const dangerous = (v) => /javascript:|vbscript:|data:text|expression\s*\(|@import|behavior\s*:|-moz-binding/i.test(v);

function cleanStyle(v) {
  return v.split(";").filter((d) => d.trim() && !dangerous(d) && localUrls(d)).join(";");
}

/** An attribute kept (as [name, value]) or dropped (null). */
function cleanAttr([name, value]) {
  if (!NAME.test(name) || /^on/i.test(name)) return null;
  const n = name.toLowerCase();
  if (n === "href" || n === "xlink:href") return /^#[0-9A-Za-z_.-]+$/.test(value.trim()) ? ["href", value.trim()] : null;
  if (n.includes(":") && n !== "xml:space") return null;      // editor-specific attributes (inkscape:, sodipodi:) and namespace declarations
  if (n === "xmlns") return null;
  if (n === "style") { const s = cleanStyle(value); return s ? [name, s] : null; }
  if (dangerous(value) || !localUrls(value)) return null;
  return [name, value];
}

function write(node, out) {
  if (node.text !== undefined) return;
  const tag = node.tag.toLowerCase().replace(/^svg:/, "");
  if (UNWRAP.has(tag)) { for (const k of node.kids) emit(k, out); return; }
  if (!KEEP.has(tag)) return;                          // script, style, image, foreignObject, filter, animate, ...: gone with their content
  const name = CAMEL[tag] ?? tag;
  const attrs = node.attrs.map(cleanAttr).filter(Boolean);
  const kids = [];
  for (const k of node.kids) emit(k, kids, TEXTY.has(tag));
  const a = attrs.map(([k, v]) => ` ${k}="${encode(v)}"`).join("");
  out.push(kids.length ? `<${name}${a}>${kids.join("")}</${name}>` : `<${name}${a}/>`);
}
function emit(node, out, keepText = false) {
  if (node.text !== undefined) { if (keepText) out.push(encode(node.text)); return; }
  write(node, out);
}

// ---- size ----------------------------------------------------------------------------------------

const UNIT_CM = { "": 2.54 / 96, px: 2.54 / 96, pt: 2.54 / 72, pc: 2.54 / 6, mm: 0.1, cm: 1, in: 2.54, q: 0.025 };
function lengthCm(v) {
  const m = /^\s*([0-9]*\.?[0-9]+(?:[eE][-+]?\d+)?)\s*([a-zA-Z%]*)\s*$/.exec(v ?? "");
  if (!m || m[2] === "%" || !(m[2].toLowerCase() in UNIT_CM)) return null;
  return +m[1] * UNIT_CM[m[2].toLowerCase()];
}

/**
 * A backdrop from any SVG: {svg, width, height} where svg is the rewritten text (it has a viewBox) and
 * width and height are its natural size in modules. Throws an Error that says what is wrong.
 */
export function sanitizeSvg(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("the file is empty");
  if (text.length > MAX_SVG_BYTES) throw new Error(`the file is ${(text.length / 1e6).toFixed(1)} MB, over the ${MAX_SVG_BYTES / 1e6} MB limit`);
  const root = read(text);
  const svg = root.kids.find((k) => k.tag && k.tag.toLowerCase().replace(/^svg:/, "") === "svg");
  if (!svg) throw new Error("this is not an SVG file (no <svg> element)");
  const get = (n) => svg.attrs.find(([k]) => k.toLowerCase() === n)?.[1];
  const vb = (get("viewbox") ?? "").trim().split(/[\s,]+/).map(Number);
  const hasVb = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  let wCm = lengthCm(get("width")), hCm = lengthCm(get("height"));
  if (wCm == null && hasVb) wCm = lengthCm(`${vb[2]}`);
  if (hCm == null && hasVb) hCm = lengthCm(`${vb[3]}`);
  if (wCm == null || hCm == null || !(wCm > 0 && hCm > 0)) throw new Error("this SVG has no size (no width, height or viewBox)");
  const box = hasVb ? vb : [0, 0, wCm / UNIT_CM[""], hCm / UNIT_CM[""]];
  svg.attrs = svg.attrs.filter(([k]) => !["width", "height", "viewbox", "x", "y"].includes(k.toLowerCase()));
  const body = [];
  for (const k of svg.kids) emit(k, body);
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(" ")}" width="${wCm / UNIT_CM[""]}" height="${hCm / UNIT_CM[""]}">${body.join("")}</svg>`;
  return { svg: out, width: wCm / MODULE_CM, height: hCm / MODULE_CM };
}
