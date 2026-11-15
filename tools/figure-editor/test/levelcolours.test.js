// F17: level colours saved in the figure's style block (circuit/0.2, schema model-v0.3.1), applied to the drawing, with warnings.

import { parse, serialize, setStyleLevels } from "../src/doc.js";
import { cleanLevels, contrast, difference, levelRoles, warnings, withLevelColour } from "../src/levelcolours.js";
import { drawing } from "../src/export.js";
import { buildClaChevron } from "../examples/cla-chevron.js";
import { assert, assertEquals, assertThrows, pack, typeset } from "./helpers.js";

const doc = () => buildClaChevron(pack);

Deno.test("style.levels round-trips in the schema's own shape, canonical order, and other style fields survive", () => {
  let d = doc();
  d.style = { theme: "dark", weight: "bold" };
  d = setStyleLevels(d, { Z: { dark: "#56b4e9" }, 1: { dark: "#E69F00", light: "#D55E00" } });
  const text = serialize(d, pack);
  assert(text.includes('"style": { "weight": "bold", "theme": "dark", "levels": { "1": { "light": "#D55E00", "dark": "#E69F00" }, "Z": { "dark": "#56b4e9" } } }'), text.split("\n").find((l) => l.includes("style")));
  const back = parse(text).doc;
  assertEquals(back.style, { weight: "bold", theme: "dark", levels: { 1: { light: "#D55E00", dark: "#E69F00" }, Z: { dark: "#56b4e9" } } });
  assertEquals(serialize(back, pack), text);
  const cleared = setStyleLevels(back, {});
  assertEquals(cleared.style, { weight: "bold", theme: "dark" });
  assertEquals(setStyleLevels(doc(), {}).style, undefined);
});

Deno.test("the file is checked as the schema checks it: bad colours, unknown levels and fields are refused", () => {
  const withStyle = (style) => serialize({ ...doc(), style: undefined }, pack).replace('"grid_cm": 0.25,', `"grid_cm": 0.25,\n  "style": ${JSON.stringify(style)},`);
  parse(withStyle({ levels: { 1: { light: "#D55E00" } } }));
  for (const bad of [{ levels: { 1: { light: "red" } } }, { levels: { 1: { light: "#FFF" } } }, { levels: { 2: { light: "#FFFFFF" } } }, { levels: { 1: { mid: "#FFFFFF" } } }, { colour: 1 }, { weight: "heavy" }]) {
    assertThrows(() => parse(withStyle(bad)), /style/, JSON.stringify(bad));
  }
});

Deno.test("chosen colours become role overrides for the light or the dark canvas, and change what is drawn", () => {
  const levels = { 1: { light: "#123456", dark: "#E69F00" }, 0: { dark: "#56B4E9" } };
  assertEquals(levelRoles(levels, false), { high: "#123456" });
  assertEquals(levelRoles(levels, true), { low: "#56B4E9", high: "#E69F00" });
  const d = doc();
  const id = d.wires[0].id;
  d.wires[0].level = "1";
  const drawn = (p) => drawing(d, p, { typeset }).wires.find((w) => w.id === id).colour;
  assertEquals(drawn(pack.withTheme(levelRoles(levels, false))), "#123456");
  assert(drawn(pack) !== "#123456");
});

Deno.test("setting and clearing one colour; junk is dropped", () => {
  let l = withLevelColour({}, "1", "light", "#aabbcc");
  assertEquals(l, { 1: { light: "#AABBCC" } });
  l = withLevelColour(l, "1", "dark", "#112233");
  l = withLevelColour(l, "1", "light", null);
  assertEquals(l, { 1: { dark: "#112233" } });
  assertEquals(withLevelColour(l, "1", "dark", null), {});
  assertEquals(cleanLevels({ 1: { light: "nope", dark: "#abcdef" }, 7: { light: "#FFFFFF" }, X: 3 }), { 1: { dark: "#ABCDEF" } });
});

Deno.test("warnings: low contrast, colours that look alike, and pairs colour-blind viewers confuse", () => {
  assert(Math.abs(contrast("#000000", "#FFFFFF") - 21) < 1e-6);
  assert(warnings({ 0: "#FEFEFE" }, "#FFFFFF").some((w) => /contrast/.test(w)));
  assert(warnings({ 0: "#000000", 1: "#111111" }, "#FFFFFF").some((w) => /look alike/.test(w)));
  const redGreen = warnings({ 0: "#D55E00", 1: "#009E73" }, "#FFFFFF");
  assert(difference("#FF0000", "#00AA00", "deuteranopia") < difference("#FF0000", "#00AA00"), "deuteranopia shrinks red-green");
  assertEquals(warnings({ 0: "#000000", 1: "#D55E00", X: "#0072B2" }, "#FFFFFF").length, 0, `a safe set: ${redGreen}`);
});
