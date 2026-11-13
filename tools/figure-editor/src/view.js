// The canvas: draws the document into an inline <svg>. DOM code lives here and in app.js only.
//
// The scene comes from export.js drawing(), so the screen and the exported file agree.
// Every colour and size comes from the active theme (the pack's theme.json, or a private
// theme's roles over it); the editor sets none of its own.

import { fmt, fromSvg, STEPS_PER_MODULE, svgTransform, toSvg } from "./geometry.js";
import { drawing, pathData } from "./export.js";
import { writeXml } from "./xml.js";

const NS = "http://www.w3.org/2000/svg";
export const symbolId = (type) => `fe-sym-${type}`;
const same = (a, b) => a.toUpperCase() === b.toUpperCase();

export function createView(svg, basePack) {
  // Palette previews reuse these <symbol>s. Colours baked into the pack's SVGs go through the active pack's mapping,
  // so the palette matches the canvas (as shipped in light; dark roles in dark).
  const recolourAttrs = (n, pack) => ({ ...n, attrs: (n.attrs ?? []).map(([k, v]) => [k, v.replace(/#[0-9A-Fa-f]{6}/g, (c) => pack.recolour(c))]), children: (n.children ?? []).map((c) => recolourAttrs(c, pack)) });
  const symbolsFor = (pack) => basePack.types(true).map((type) => {
    const inner = basePack.svgs.get(type).children.map((n) => writeXml(recolourAttrs(n, pack))).join("");
    return `<symbol id="${symbolId(type)}" overflow="visible">${inner}</symbol>`;
  }).join("");
  svg.innerHTML = `
      <defs class="fe-symbols">${symbolsFor(basePack)}</defs>
      <defs>
      <pattern id="fe-grid" patternUnits="userSpaceOnUse" x="-0.5" y="-0.5" width="1" height="1">
        <circle class="fe-grid-dot" cx="0.5" cy="0.5"/>
      </pattern>
    </defs>
    <rect class="fe-paper"/>
    <rect class="fe-gridlayer" fill="url(#fe-grid)"/>
    <g class="fe-scene"></g>
    <g class="fe-overlay" fill="none"></g>`;
  const paper = svg.querySelector(".fe-paper"), grid = svg.querySelector(".fe-gridlayer"), gridDot = svg.querySelector(".fe-grid-dot");
  const scene = svg.querySelector(".fe-scene"), overlay = svg.querySelector(".fe-overlay");

  // View: centre (modules) and modules per screen pixel.
  const cam = { cx: 0, cy: 0, scale: 0.05 };
  function box() {
    const r = svg.getBoundingClientRect();
    const w = Math.max(r.width, 1) * cam.scale, h = Math.max(r.height, 1) * cam.scale;
    return { x: cam.cx - w / 2, y: cam.cy - h / 2, w, h };
  }
  function applyCamera() {
    const b = box();
    svg.setAttribute("viewBox", `${b.x} ${b.y} ${b.w} ${b.h}`);
    for (const r of [paper, grid]) {
      r.setAttribute("x", b.x); r.setAttribute("y", b.y); r.setAttribute("width", b.w); r.setAttribute("height", b.h);
    }
  }

  /** A pointer event's position in grid steps (fractional). */
  function toGrid(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const m = pt.matrixTransform(svg.getScreenCTM().inverse());
    return fromSvg([m.x, m.y]);
  }

  function zoomAt(factor, evt) {
    const before = evt ? toSvg(toGrid(evt)) : [cam.cx, cam.cy];
    cam.scale = Math.min(Math.max(cam.scale * factor, 0.004), 1);
    applyCamera();
    if (evt) {
      const after = toSvg(toGrid(evt));
      cam.cx += before[0] - after[0]; cam.cy += before[1] - after[1];
      applyCamera();
    }
  }

  function panBy(dxPx, dyPx) { cam.cx -= dxPx * cam.scale; cam.cy -= dyPx * cam.scale; applyCamera(); }

  /** Fit a box (modules), or a default view of 40 x 24 modules about the origin. */
  function fit(b) {
    const r = svg.getBoundingClientRect();
    const bb = b ?? { min: [-20, -12], max: [20, 12] };
    const w = bb.max[0] - bb.min[0] + 4, h = bb.max[1] - bb.min[1] + 4;
    cam.cx = (bb.min[0] + bb.max[0]) / 2; cam.cy = (bb.min[1] + bb.max[1]) / 2;
    cam.scale = Math.max(w / Math.max(r.width, 1), h / Math.max(r.height, 1));
    applyCamera();
  }

  /**
   * state: {doc, pack (the active theme's), selection {elements, wires, ports, labels}, typeset, labelPt,
   * levelTags, ghost, rubber, hover, box}. Returns the drawing.
   */
  function render(state) {
    const { pack } = state;
    const { roles, line, junction } = pack.theme;
    const lw = line.width_module;
    paper.setAttribute("fill", roles.background);
    gridDot.setAttribute("r", fmt(lw / 2)); gridDot.setAttribute("fill", roles.grid);

    const d = drawing(state.doc, pack, { typeset: state.typeset, labelPt: state.labelPt, levelTags: state.levelTags });
    const parts = [];
    parts.push(`<g stroke="${roles.ink}" stroke-width="${fmt(lw)}" stroke-linecap="${line.cap}" stroke-linejoin="${line.join}" fill="none">`);
    for (const w of d.wires) parts.push(`<path data-wire="${w.id}"${same(w.colour, roles.ink) ? "" : ` stroke="${w.colour}"`} d="${pathData(w.points)}"/>`);
    parts.push("</g>");
    for (const e of d.elements) parts.push(`<g data-el="${e.el.id}" transform="${e.transform}">${e.nodes.map((n) => writeXml(n)).join("")}</g>`);
    parts.push(`<g fill="${roles.ink}">`);
    for (const c of [...d.joints, ...d.dots]) parts.push(`<circle cx="${fmt(c.at[0])}" cy="${fmt(c.at[1])}" r="${fmt(c.r)}"${same(c.colour, roles.ink) ? "" : ` fill="${c.colour}"`}/>`);
    parts.push("</g>");
    for (const l of d.labels) parts.push(`<g data-label="${l.key}" transform="${l.transform}">${l.nodes.map((n) => writeXml(n)).join("")}</g>`);
    scene.innerHTML = parts.join("");

    const o = [];
    const sel = state.selection;
    const accent = `stroke="${roles.accent}" stroke-width="${fmt(lw)}"`;
    const dash = `stroke-dasharray="${fmt(lw * 3)} ${fmt(lw * 2)}"`;
    const rect = (b, extra = "") => `<rect ${accent} ${extra} x="${fmt(b.min[0])}" y="${fmt(b.min[1])}" width="${fmt(b.max[0] - b.min[0])}" height="${fmt(b.max[1] - b.min[1])}"/>`;
    for (const e of d.elements) if (sel.elements.includes(e.el.id)) o.push(rect(e.box, dash));
    for (const w of d.wires) {
      if (sel.wires.includes(w.id)) o.push(`<path stroke="${roles.accent}" stroke-opacity="0.45" stroke-width="${fmt(lw * 4)}" stroke-linejoin="round" stroke-linecap="round" d="${pathData(w.points)}"/>`);
    }
    // Ports have no symbol of their own: the editor marks them (never exported) so they can be found and selected.
    for (const p of state.doc.ports) {
      const [x, y] = toSvg(p.at);
      const on = (sel.ports ?? []).includes(p.id);
      o.push(`<circle ${accent} stroke-opacity="${on ? 1 : 0.5}" ${on ? "" : dash} cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(junction.radius_module * 1.8)}"/>`);
    }
    for (const l of d.labels) {
      const on = l.kind === "label" ? (sel.labels ?? []).includes(l.index) : l.kind === "port" ? (sel.ports ?? []).includes(l.id) : false;
      if (on) o.push(rect({ min: [l.box.min[0] - lw, l.box.min[1] - lw], max: [l.box.max[0] + lw, l.box.max[1] + lw] }, dash));
    }
    for (const i of sel.labels ?? []) {            // a free label that could not be drawn is still selectable at its anchor
      const l = state.doc.labels[i];
      if (l && !d.labels.some((x) => x.key === `label:${i}`)) { const [x, y] = toSvg(l.at); o.push(`<circle ${accent} cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(junction.radius_module * 1.8)}"/>`); }
    }
    if (state.ghost) {
      const el = state.ghost;
      o.push(`<g opacity="0.55"><use href="#${symbolId(el.type)}" transform="${svgTransform(el)}"/></g>`);
    }
    if (state.rubber && state.rubber.length > 1) {
      o.push(`<path stroke="${roles.accent}" stroke-width="${fmt(lw)}" ${dash} d="${pathData(state.rubber.map(toSvg))}"/>`);
    }
    if (state.hover) {
      const [x, y] = toSvg(state.hover);
      o.push(`<circle stroke="${roles.highlight}" stroke-width="${fmt(lw)}" cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(junction.radius_module * 1.6)}"/>`);
    }
    if (state.box) {
      const [a, b] = [toSvg(state.box.min), toSvg(state.box.max)];
      o.push(`<rect ${accent} stroke-dasharray="${fmt(lw * 2)} ${fmt(lw * 2)}" x="${fmt(Math.min(a[0], b[0]))}" y="${fmt(Math.min(a[1], b[1]))}" width="${fmt(Math.abs(b[0] - a[0]))}" height="${fmt(Math.abs(b[1] - a[1]))}"/>`);
    }
    overlay.innerHTML = o.join("");
    return d;
  }

  applyCamera();
  /** Dot spacing, in grid steps (1 = half a module, 2 = a module). Dots sit on multiples of it. */
  function setGrid(steps) {
    const w = steps / STEPS_PER_MODULE, pat = svg.querySelector("#fe-grid");
    pat.setAttribute("width", w); pat.setAttribute("height", w);
    pat.setAttribute("x", -w / 2); pat.setAttribute("y", -w / 2);
    gridDot.setAttribute("cx", w / 2); gridDot.setAttribute("cy", w / 2);
  }

  /** Redraw the palette's symbols with a pack's colour mapping (the light or dark canvas). */
  const setSymbols = (pack) => { svg.querySelector(".fe-symbols").innerHTML = symbolsFor(pack); };

  return { render, toGrid, zoomAt, panBy, fit, applyCamera, setGrid, setSymbols, cam };
}

/** A small preview of one pack element for the palette (uses the canvas's <symbol>). */
export function thumbnail(pack, type) {
  const vb = pack.def(type).svg.viewBox;
  return `<svg xmlns="${NS}" class="fe-thumb" viewBox="${vb.join(" ")}" aria-hidden="true" focusable="false"><use href="#${symbolId(type)}"/></svg>`;
}
