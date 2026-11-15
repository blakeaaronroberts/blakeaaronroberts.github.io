// The slide frame (F10). No DOM.
//
// A slide-size rectangle on the canvas, in the same coordinates as the drawing, where the schematic and
// (later, F9) the timing diagram are arranged together. Exporting the frame writes one figure at the
// slide's real size: exactly what lies inside the rectangle, at 1:1 (times the export scale option), so it
// goes onto a slide without resizing. The frame is a viewer option kept in the browser, not part of the
// circuit file (the circuit schema has no place for it).
//
// Points are in SVG modules (y down, 0.5 cm a module), as the drawing is.

import { MODULE_CM } from "./geometry.js";

/** Slide sizes in cm: PowerPoint's own 13.333 x 7.5 in (16:9) and 10 x 7.5 in (4:3). */
export const FORMATS = {
  "16:9": { widthCm: 33.867, heightCm: 19.05, name: "16:9 (33.87 x 19.05 cm)" },
  "4:3": { widthCm: 25.4, heightCm: 19.05, name: "4:3 (25.4 x 19.05 cm)" },
};

/** Where the timing diagram goes, and how much of the frame the schematic keeps. */
export const LAYOUTS = {
  schematic: { name: "Schematic only" },
  below: { name: "Timing diagram below the schematic", split: 0.6 },
  beside: { name: "Timing diagram beside the schematic", split: 0.55 },
};

export const defaultFrame = () => ({ show: false, format: "16:9", layout: "schematic", x: 0, y: 0 });

/** The frame as saved in the options, repaired: unknown values become the defaults, the position a whole grid step. */
export function cleanFrame(f) {
  const d = defaultFrame();
  const x = Number.isFinite(+f?.x) ? Math.round(+f.x) : 0, y = Number.isFinite(+f?.y) ? Math.round(+f.y) : 0;
  return { show: f?.show === true, format: f?.format in FORMATS ? f.format : d.format, layout: f?.layout in LAYOUTS ? f.layout : d.layout, x, y };
}

/** Size in modules. */
export const sizeOf = (frame) => ({ w: FORMATS[frame.format].widthCm / MODULE_CM, h: FORMATS[frame.format].heightCm / MODULE_CM });

/** The frame as a box {min, max} in modules (y down). Its centre is the grid point (x, y), y up. */
export function frameBox(frame) {
  const { w, h } = sizeOf(frame);
  const cx = frame.x / 2, cy = -frame.y / 2;
  return { min: [cx - w / 2, cy - h / 2], max: [cx + w / 2, cy + h / 2] };
}

/** The schematic's region and, if the layout has one, the timing diagram's: two boxes that together are the frame. */
export function regions(frame) {
  const f = frameBox(frame), L = LAYOUTS[frame.layout];
  if (frame.layout === "schematic") return { schematic: f, timing: null };
  const [x0, y0] = f.min, [x1, y1] = f.max;
  if (frame.layout === "below") {
    const ys = y0 + (y1 - y0) * L.split;
    return { schematic: { min: [x0, y0], max: [x1, ys] }, timing: { min: [x0, ys], max: [x1, y1] } };
  }
  const xs = x0 + (x1 - x0) * L.split;
  return { schematic: { min: [x0, y0], max: [xs, y1] }, timing: { min: [xs, y0], max: [x1, y1] } };
}

/** The frame moved so the middle of its schematic region is the middle of `box` (the drawing's box, modules). Whole grid steps. */
export function centreOn(frame, box) {
  const f = frameBox(frame), r = regions(frame).schematic;
  const offX = (r.min[0] + r.max[0]) / 2 - (f.min[0] + f.max[0]) / 2, offY = (r.min[1] + r.max[1]) / 2 - (f.min[1] + f.max[1]) / 2;
  const cx = (box.min[0] + box.max[0]) / 2 - offX, cy = (box.min[1] + box.max[1]) / 2 - offY;
  return { ...frame, x: Math.round(cx * 2), y: Math.round(-cy * 2) };
}

/** Does the drawing's box stick out of the schematic's region? Returns the sides it crosses ([] if it fits). */
export function overflow(frame, box) {
  if (!box) return [];
  const r = regions(frame).schematic, out = [];
  if (box.min[0] < r.min[0] - 1e-9) out.push("left");
  if (box.max[0] > r.max[0] + 1e-9) out.push("right");
  if (box.min[1] < r.min[1] - 1e-9) out.push("top");
  if (box.max[1] > r.max[1] + 1e-9) out.push("bottom");
  return out;
}
