// F29.6: how big the diagram is drawn in the editor's view window. No DOM.
//
// The size is a layout input to drawTiming: steps and lanes are re-spaced to fit it and text keeps its size, so a window
// of any size gets a full diagram with readable text. Below a readable minimum the diagram stops shrinking and the window
// scrolls instead: steps may narrow to 40% of their natural width (16 px at hscale 1) and lanes to 60% of their natural
// height; text of 24 pt and above is not squeezed at all (its natural size is already the minimum).

export const MIN_STEP_SHARE = 0.4;
export const MIN_HEIGHT_SHARE = 0.6;

/**
 * natural: { w, h } from naturalSize(); room: { w, h } the free space in the window (0 or less means unknown, use natural).
 * Returns { w, h, scrolls }: the size to draw, and whether it is larger than the room (the window then scrolls).
 */
export function fitSize(natural, room, { steps = 1, hscale = 1, largeText = false } = {}) {
  const minW = largeText ? natural.w : Math.max(160, Math.round(natural.w - steps * 40 * hscale * (1 - MIN_STEP_SHARE)));
  const minH = largeText ? natural.h : Math.max(80, Math.round(natural.h * MIN_HEIGHT_SHARE));
  const w = Math.round(Math.max(minW, room.w > 0 ? room.w : natural.w));
  const h = Math.round(Math.max(minH, room.h > 0 ? room.h : natural.h));
  return { w, h, scrolls: (room.w > 0 && w > room.w + 1) || (room.h > 0 && h > room.h + 1) };
}
