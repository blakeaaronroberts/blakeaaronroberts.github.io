// U1.7: the first-run experience, from state: the readouts in the toolbar and status bar, and the start and tour
// decisions across both tools' storage keys. (Chooser keys and the tour's steps are in start.test.js and tour.test.js.)

import { AUTOSAVE_OFF, figureName, frameText, frameTotalText, gridText, saveText, tourText, zoomText } from "../src/bars.js";
import { startAction } from "../src/start.js";
import { createTour, shouldStartTour, tourSteps } from "../src/tour.js";
import { assertEquals } from "./helpers.js";

const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v); return true; }, m }; };

Deno.test("the frame readout: Frame n/last, and No frames when there are none", () => {
  assertEquals(frameText(0, 9), "Frame 0/8");
  assertEquals(frameText(3, 9), "Frame 3/8");
  assertEquals(frameText(-1, 9), "Frame 0/8", "no frame selected shows frame 0");
  assertEquals(frameText(0, 0), "No frames");
  assertEquals(frameTotalText(9), "/8");
  assertEquals(frameTotalText(0), "no frames");
});

Deno.test("the grid readout names the step: ½ by default, 1 for a whole module", () => {
  assertEquals(gridText(1), "Grid ½");
  assertEquals(gridText(2), "Grid 1");
});

Deno.test("the zoom readout: 100% at the opening view, more when closer", () => {
  assertEquals(zoomText(0.05), "100%");
  assertEquals(zoomText(0.025), "200%");
  assertEquals(zoomText(0.1), "50%");
  assertEquals(zoomText(0.004), "1250%");
});

Deno.test("the name block: the figure's title or Untitled figure; the autosave line carries the state in words", () => {
  assertEquals(figureName("Full adder"), "Full adder");
  assertEquals(figureName(""), "Untitled figure");
  assertEquals(figureName("   "), "Untitled figure");
  assertEquals(figureName(undefined), "Untitled figure");
  assertEquals(saveText("none"), "Not saved yet");
  assertEquals(saveText("saved"), "Autosaved in this browser");
  assertEquals(saveText("off"), AUTOSAVE_OFF);
  assertEquals(AUTOSAVE_OFF.startsWith("Autosave is off:"), true);
  assertEquals(new Set(["none", "saved", "off"].map(saveText)).size, 3, "each state reads differently, so colour is never the only signal");
});

Deno.test("the Tour button counts 0 of n until the tour is seen, then n of n", () => {
  assertEquals(tourText({ seen: false, total: 3 }), "Tour 0/3");
  assertEquals(tourText({ seen: true, total: 3 }), "Tour 3/3");
  assertEquals(tourText({ seen: false, total: 2 }), "Tour 0/2");
});

Deno.test("each tool starts from its own storage: an autosave in one does not open the other without the chooser", () => {
  for (const prefix of ["figure-editor/", "schematic-editor/"]) {
    const s = memory({ [`${prefix}autosave`]: '{"schema":"circuit/0.2"}' });
    assertEquals(startAction({ opened: false, saved: s.get(`${prefix}autosave`) }), "none", `${prefix} restores its autosave`);
  }
  const fig = memory({ "figure-editor/autosave": "{}" });
  assertEquals(startAction({ opened: false, saved: fig.get("schematic-editor/autosave") }), "chooser", "the other tool's key is empty");
  assertEquals(startAction({ opened: true, saved: null }), "none", "?open= wins, and a link that failed still skips the chooser");
});

Deno.test("the tour's seen flag is per tool, set by skip and by done, and read on the next visit", () => {
  for (const [prefix, timing, n] of [["figure-editor/", true, 3], ["schematic-editor/", false, 2]]) {
    const key = `${prefix}tour-seen`, other = prefix === "figure-editor/" ? "schematic-editor/tour-seen" : "figure-editor/tour-seen";
    const s = memory();
    const tour = createTour({ steps: tourSteps({ timing }), get: s.get, set: s.set, key });
    assertEquals(tour.total, n);
    assertEquals(shouldStartTour({ seen: tour.seen, choice: "example", timing }), true, `${prefix} first visit`);
    tour.start();
    assertEquals(tour.skip(), "skipped");
    assertEquals(s.m.get(key), "1");
    assertEquals(s.m.has(other), false, "the other tool's flag is untouched");
    const again = createTour({ steps: tourSteps({ timing }), get: s.get, set: s.set, key });
    assertEquals(shouldStartTour({ seen: again.seen, choice: "example", timing }), false, "seen on the next visit");
    again.start();   // replay from the button
    assertEquals(again.active, true);
    for (let i = 1; i < n; i++) assertEquals(again.next(), "next");
    assertEquals(again.next(), "done");
    assertEquals(s.m.get(key), "1", "the flag stays after a replay");
  }
});
