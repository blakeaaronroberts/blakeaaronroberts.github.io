// U1.5: the words of the toolbar's and status bar's readouts, from state. Pure, so Deno tests cover them.
// Strings are the ones Blake approved on 2026-11-25.

export const UNTITLED = "Untitled figure";
export const AUTOSAVE_OFF = "Autosave is off: this browser will not store the figure. Use Save to keep it.";

/** The zoom readout: 100% is the opening view, 20 screen pixels to the module (0.05 modules to the pixel). */
export const zoomText = (scale) => `${Math.round(0.05 / scale * 100)}%`;
/** "Frame 3/8": `selected` is the frame shown, `count` how many frames the figure has (frame 0 included). */
export const frameText = (selected, count) => count ? `Frame ${Math.max(0, selected)}/${count - 1}` : "No frames";
/** The part after the stepper's number input: "/8". */
export const frameTotalText = (count) => count ? `/${count - 1}` : "no frames";
/** "Grid ½" or "Grid 1": `grid` is 1 for half a module (the default), 2 for a whole one. */
export const gridText = (grid) => `Grid ${grid === 2 ? "1" : "½"}`;
export const figureName = (title) => title?.trim() || UNTITLED;
/** The name block's autosave line; the dot only echoes it. */
export const saveText = (state) => state === "saved" ? "Autosaved in this browser" : state === "off" ? AUTOSAVE_OFF : "Not saved yet";
/** The Tour button: "Tour 0/3" until the tour is seen, "Tour 3/3" after. */
export const tourText = ({ seen, total }) => `Tour ${seen ? total : 0}/${total}`;
