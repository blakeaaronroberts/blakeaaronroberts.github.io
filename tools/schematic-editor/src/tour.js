// U1.4: the first-run tour (its steps, seen state, start rule), the Keys dialog's key chips and the toolbar tooltip text.
// Pure: no DOM here, so Deno tests cover it. The tour's look is in tourui.js.
//
// New strings below are not approved by Blake until he says so (handoff, U1.4).

export const DONE_TOAST = "You’re set. Press ? any time for the keys.";
export const SKIP_TOAST = "Tour skipped. Replay it from the status bar.";   // U1.5, not approved by Blake

const ELEMENTS = { id: "elements", target: ".fe-palette", place: "right", title: "Place elements", body: "Pick an element on the left to place it, or press W to draw a wire. Press ? for the keys." };

/** The Figure Editor (it has the Timing Diagram) tours three things; the Schematic Editor page, two. */
export function tourSteps({ timing }) {
  if (timing) return [
    { id: "frames", target: ".fe-stepper", place: "below", title: "Step through the frames", body: "A full adder to start: step through its eight frames with ◀ ▶." },
    { id: "timing", target: '[data-sec-bar="timing"]', place: "above", title: "Timing Diagram", body: "The same eight frames, as signals over time. Open it here, under the schematic.", action: "viewtiming", actionLabel: "Open it" },
    ELEMENTS,
  ];
  return [
    { ...ELEMENTS, body: "Pick an element on the left to place it." },
    { id: "wiring", target: ".fe-canvas", place: "center", title: "Draw wires", body: "Press W to draw a wire; click a pin, junction or wire to finish it. Press ? for the keys." },
  ];
}

/** After the example always (once); after an empty figure only where the tour has no Timing Diagram step to show. */
export function shouldStartTour({ seen, choice, timing }) {
  if (seen) return false;
  return choice === "example" || (choice === "empty" && !timing);
}

/** The tour's state: step 0 is off, steps count from 1. `get`/`set` are the browser storage; if it fails the flag lasts the visit. */
export function createTour({ steps, get, set, key }) {
  let index = 0, session = false;
  const stored = () => { try { return get(key) === "1"; } catch { return false; } };
  const finish = (how) => { index = 0; session = true; try { set(key, "1"); } catch { /* the flag lasts this visit only */ } return how; };
  return {
    get index() { return index; },
    get active() { return index > 0; },
    get step() { return index ? steps[index - 1] : null; },
    get isLast() { return index === steps.length; },
    get total() { return steps.length; },
    get seen() { return session || stored(); },
    start() { index = 1; },
    next() { if (!index) return null; if (index === steps.length) return finish("done"); index++; return "next"; },
    back() { if (index > 1) index--; },
    skip() { return index ? finish("skipped") : null; },
  };
}

const KEY = /^(?:(?:Ctrl|Control|Shift|Alt)\+)*(?:[A-Za-z0-9?+−=-]|Delete|Backspace|Esc|Escape|Enter|Arrow keys)$/;

/** A row's label of KEYS as key chips, or null when it describes a mouse action or a state, not keys. */
export function keyChips(label) {
  const parts = label.split(/,\s+|\s{2,}/);
  return parts.every((p) => KEY.test(p)) ? parts : null;
}

/** A button's tooltip: its label and the keys written in `aria-keyshortcuts` form ("Control+Z", "V Escape"). */
export function tipText(title, keys) {
  return { label: title, keys: String(keys || "").split(/\s+/).filter(Boolean).map((k) => k.replace(/^Control\+/, "Ctrl+")) };
}
