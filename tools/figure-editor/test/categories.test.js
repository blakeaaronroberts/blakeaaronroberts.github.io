// F16: the Elements pane's sections come from one data file.
import { CATEGORIES, sections } from "../src/categories.js";
import { assert, assertEquals } from "./helpers.js";

Deno.test("every type is in exactly one section, unlisted ones under Other", () => {
  const types = ["and_gate", "d_latch", "resistor", "brand_new"];
  const s = sections(types);
  assertEquals(s.flatMap((x) => x.types).sort(), [...types].sort());
  assertEquals(s.find((x) => x.id === "other").types, ["brand_new"]);
  assert(s.some((x) => x.presets), "the Blocks section stays");
});
Deno.test("empty sections are dropped; no type is listed twice in the data", () => {
  assert(!sections(["and_gate"]).some((x) => x.id === "sequential"));
  const all = CATEGORIES.flatMap((c) => c.types ?? []);
  assertEquals(new Set(all).size, all.length);
});
