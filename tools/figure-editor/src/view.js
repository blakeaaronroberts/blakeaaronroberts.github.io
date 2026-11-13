// The canvas: draws the document into an inline <svg>. DOM code lives here and in app.js only.
//
// The scene comes from export.js drawing(), so the screen and the exported file agree.
// Each pack element is defined once as a <symbol> and placed with <use>. Every colour
// and size comes from the pack's theme.json (roles, line, junction); the editor sets none.

import { fmt, fromSvg, svgTransform, toSvg } from "./geometry.js";
import { drawing, pathData } from "./export.js";
import { writeXml } from "./xml.js";

const NS = "http://www.w3.org/2000/svg";
export const symbolId = (type) => `fe-sym-${type}`;

export function createView(svg, pack) {
  const { roles, line, junction } = pack.theme;
  const lw = line.width_module;
  const defs = pack.types(true).map((type) => {
    const inner = pack.svgs.get(type).children.map((n) => writeXml(n)).join("");
    return `<symbol id="${symbolId(type)}" overflow="visible">${inner}</symbol>`;
  }).join("");
  svg.innerHTML = `
    <defs>
      ${defs}
      <pattern id="fe-grid" patternUnits="userSpaceOnUse" x="-0.5" y="-0.5" width="1" height="1">
        <circle cx="0.5" cy="0.5" r="${fmt(lw / 2)}" fill="${roles.grid}"/>
      </pattern>
    </defs>
    <rect class="fe-paper" fill="${roles.background}"/>
    <rect class="fe-gridlayer" fill="url(#fe-grid)"/>
    <g class="fe-scene"></g>
    <g class="fe-overlay" fill="none"></g>`;
  const paper = svg.querySelector(".fe-paper"), grid = svg.querySelector(".fe-gridlayer");
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

  function render(state) {
    const d = drawing(state.doc, pack);
    const parts = [];
    parts.push(`<g stroke="${roles.low}" stroke-width="${fmt(lw)}" stroke-linecap="${line.cap}" stroke-linejoin="${line.join}" fill="none">`);
    for (const w of d.wires) parts.push(`<path data-wire="${w.id}" d="${pathData(w.points)}"/>`);
    parts.push("</g>");
    for (const e of d.elements) parts.push(`<use data-el="${e.el.id}" href="#${symbolId(e.el.type)}" transform="${e.transform}"/>`);
    parts.push(`<g fill="${roles.low}">`);
    for (const c of [...d.joints, ...d.dots]) parts.push(`<circle cx="${fmt(c.at[0])}" cy="${fmt(c.at[1])}" r="${fmt(c.r)}"/>`);
    parts.push("</g>");
    scene.innerHTML = parts.join("");

    const o = [];
    const sel = state.selection;
    const accent = `stroke="${roles.accent}" stroke-width="${fmt(lw)}"`;
    for (const e of d.elements) {
      if (!sel.elements.includes(e.el.id)) continue;
      const b = e.box;
      o.push(`<rect ${accent} stroke-dasharray="${fmt(lw * 3)} ${fmt(lw * 2)}" x="${fmt(b.min[0])}" y="${fmt(b.min[1])}" width="${fmt(b.max[0] - b.min[0])}" height="${fmt(b.max[1] - b.min[1])}"/>`);
    }
    for (const w of d.wires) {
      if (sel.wires.includes(w.id)) o.push(`<path stroke="${roles.accent}" stroke-opacity="0.45" stroke-width="${fmt(lw * 4)}" stroke-linejoin="round" stroke-linecap="round" d="${pathData(w.points)}"/>`);
    }
    if (state.ghost) {
      const el = state.ghost;
      o.push(`<g opacity="0.55"><use href="#${symbolId(el.type)}" transform="${svgTransform(el)}"/></g>`);
    }
    if (state.rubber && state.rubber.length > 1) {
      o.push(`<path stroke="${roles.accent}" stroke-width="${fmt(lw)}" stroke-dasharray="${fmt(lw * 3)} ${fmt(lw * 2)}" d="${pathData(state.rubber.map(toSvg))}"/>`);
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
  return { render, toGrid, zoomAt, panBy, fit, applyCamera, cam };
}

/** A small preview of one pack element for the palette (uses the canvas's <symbol>). */
export function thumbnail(pack, type) {
  const vb = pack.def(type).svg.viewBox;
  return `<svg xmlns="${NS}" class="fe-thumb" viewBox="${vb.join(" ")}" aria-hidden="true" focusable="false"><use href="#${symbolId(type)}"/></svg>`;
}
