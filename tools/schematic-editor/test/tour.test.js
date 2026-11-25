// U1.4: the tour's state (steps per page, seen flag, skip, replay), the key chips of the Keys dialog and the tooltip text.

import { DONE_TOAST, SKIP_TOAST, createTour, keyChips, shouldStartTour, tipText, tourSteps } from "../src/tour.js";
import { KEYS } from "../src/app.js";
import { assertEquals } from "./helpers.js";

const memory = (init = {}) => {
  const data = { ...init };
  return { get: (k) => data[k] ?? null, set: (k, v) => { data[k] = v; return true; }, data };
};

Deno.test("the Figure Editor tour has three steps, the Schematic Editor page two", () => {
  assertEquals(tourSteps({ timing: true }).map((s) => s.id), ["frames", "timing", "elements"]);
  assertEquals(tourSteps({ timing: false }).map((s) => s.id), ["elements", "wiring"]);
  assertEquals(tourSteps({ timing: true })[1].action, "viewtiming", "only the Timing Diagram step has an extra button");
  assertEquals(tourSteps({ timing: false }).some((s) => s.action), false);
});

Deno.test("no step mentions the arrow keys", () => {
  for (const timing of [true, false]) for (const s of tourSteps({ timing })) assertEquals(/arrow/i.test(s.title + s.body), false, s.id);
});

Deno.test("a tour starts after the example, or after an empty figure on the page with no Timing Diagram, and never once seen", () => {
  assertEquals(shouldStartTour({ seen: false, choice: "example", timing: true }), true);
  assertEquals(shouldStartTour({ seen: false, choice: "empty", timing: true }), false);
  assertEquals(shouldStartTour({ seen: false, choice: "empty", timing: false }), true);
  assertEquals(shouldStartTour({ seen: false, choice: "open", timing: false }), false);
  assertEquals(shouldStartTour({ seen: true, choice: "example", timing: true }), false);
});

Deno.test("the tour walks its steps, goes back, and ends with Done", () => {
  const s = memory(), t = createTour({ steps: tourSteps({ timing: true }), get: s.get, set: s.set, key: "figure-editor/tour-seen" });
  assertEquals([t.active, t.index], [false, 0]);
  t.start();
  assertEquals([t.active, t.index, t.step.id, t.isLast], [true, 1, "frames", false]);
  t.back();
  assertEquals(t.index, 1, "Back does nothing on step 1");
  t.next(); t.next();
  assertEquals([t.index, t.step.id, t.isLast], [3, "elements", true]);
  t.back();
  assertEquals(t.index, 2);
  t.next();
  assertEquals(t.next(), "done");
  assertEquals([t.active, t.index, t.seen], [false, 0, true]);
  assertEquals(s.data["figure-editor/tour-seen"], "1");
});

Deno.test("Skip sets the seen flag too, with its own toast; Done and Skip texts", () => {
  const s = memory(), t = createTour({ steps: tourSteps({ timing: false }), get: s.get, set: s.set, key: "schematic-editor/tour-seen" });
  t.start(); t.next();
  assertEquals(t.skip(), "skipped");
  assertEquals([t.active, t.seen, s.data["schematic-editor/tour-seen"]], [false, true, "1"]);
  assertEquals(typeof DONE_TOAST, "string");
  assertEquals(typeof SKIP_TOAST, "string");
});

Deno.test("a seen flag from an earlier visit is read; replay works and the flag stays", () => {
  const s = memory({ "figure-editor/tour-seen": "1" }), t = createTour({ steps: tourSteps({ timing: true }), get: s.get, set: s.set, key: "figure-editor/tour-seen" });
  assertEquals(t.seen, true);
  t.start();
  assertEquals([t.active, t.index], [true, 1]);
  t.skip();
  assertEquals(t.seen, true);
});

Deno.test("the tools keep separate keys", () => {
  const s = memory(), a = createTour({ steps: tourSteps({ timing: true }), get: s.get, set: s.set, key: "figure-editor/tour-seen" });
  const b = createTour({ steps: tourSteps({ timing: false }), get: s.get, set: s.set, key: "schematic-editor/tour-seen" });
  a.start(); a.skip();
  assertEquals([a.seen, b.seen], [true, false]);
});

Deno.test("when storage fails the tour is still seen for this visit", () => {
  const t = createTour({ steps: tourSteps({ timing: true }), get: () => { throw new Error("blocked"); }, set: () => false, key: "k" });
  assertEquals(t.seen, false);
  t.start(); t.skip();
  assertEquals(t.seen, true);
});

Deno.test("key chips: keys become chips, descriptions of mouse actions stay text", () => {
  assertEquals(keyChips("W"), ["W"]);
  assertEquals(keyChips("Delete, Backspace"), ["Delete", "Backspace"]);
  assertEquals(keyChips("0  1  X  Z"), ["0", "1", "X", "Z"]);
  assertEquals(keyChips("Ctrl+Z, Ctrl+Y"), ["Ctrl+Z", "Ctrl+Y"]);
  assertEquals(keyChips("Esc"), ["Esc"]);
  assertEquals(keyChips("?"), ["?"]);
  assertEquals(keyChips("Arrow keys"), ["Arrow keys"]);
  assertEquals(keyChips("Drag on empty canvas"), null);
  assertEquals(keyChips("Shift+click"), null);
  assertEquals(keyChips("Mouse wheel, + and −"), null);
  assertEquals(keyChips("Selected wire"), null);
});

Deno.test("every KEYS row gives chips or text, and all single-letter keys are chips", () => {
  for (const [k] of KEYS) { const c = keyChips(k); assertEquals(c === null || c.length > 0, true, k); }
  for (const k of ["W", "P", "T", "R", "M", "F", "?"]) assertEquals(KEYS.some(([x]) => x === k && keyChips(x)?.length === 1), true, k);
});

Deno.test("tooltip text: the label, then the keys", () => {
  assertEquals(tipText("Wire", "W"), { label: "Wire", keys: ["W"] });
  assertEquals(tipText("Undo", "Control+Z"), { label: "Undo", keys: ["Ctrl+Z"] });
  assertEquals(tipText("Next frame", ""), { label: "Next frame", keys: [] });
  assertEquals(tipText("Select", "V Escape"), { label: "Select", keys: ["V", "Escape"] });
});
