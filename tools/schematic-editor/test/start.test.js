// U1.1: the start chooser. When it opens, what each key chooses, and the two status lines.

import { CHOICES, EMPTY_STATUS, EXAMPLE_STATUS, choiceForKey, startAction } from "../src/start.js";
import { assertEquals } from "./helpers.js";

Deno.test("the chooser opens only with no ?open= file and no autosave", () => {
  assertEquals(startAction({ opened: false, saved: false }), "chooser");
  assertEquals(startAction({ opened: true, saved: false }), "none", "a file opened by link");
  assertEquals(startAction({ opened: false, saved: "{}" }), "none", "an autosave exists");
  assertEquals(startAction({ opened: true, saved: "{}" }), "none");
  assertEquals(startAction({ opened: false, saved: null }), "chooser", "storage returned nothing");
  assertEquals(startAction({ opened: false, saved: "" }), "chooser", "an empty autosave is no autosave");
});

Deno.test("keys 1, 2, 3 and Escape choose; other keys do not", () => {
  assertEquals(choiceForKey("1"), "example");
  assertEquals(choiceForKey("2"), "empty");
  assertEquals(choiceForKey("3"), "open");
  assertEquals(choiceForKey("Escape"), "empty", "Esc is the same as Empty figure");
  for (const k of ["0", "4", "x", "Enter", " ", "?", "w"]) assertEquals(choiceForKey(k), null, k);
});

Deno.test("the options are in order and each names its key", () => {
  assertEquals(CHOICES.map((c) => c.id), ["example", "empty", "open"]);
  assertEquals(CHOICES.map((c) => c.key), ["1", "2", "3"]);
  for (const c of CHOICES) assertEquals(choiceForKey(c.key), c.id);
});

Deno.test("the two status lines are the ones the editor already said (the example's is no longer overwritten)", () => {
  assertEquals(EXAMPLE_STATUS, "A full adder to start: step through its eight frames with ◀ ▶, or open Timing Diagram.");
  assertEquals(EMPTY_STATUS, "Pick an element on the left to place it, or press W to draw a wire. Press ? for the keys.");
});
