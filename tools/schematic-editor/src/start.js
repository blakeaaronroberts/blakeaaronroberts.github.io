// U1.1: the start chooser. Pure decisions only; the dialog itself is built in app.js.

/** The three ways to start, in order. `key` is the key that chooses it. */
export const CHOICES = [
  { id: "example", key: "1" },
  { id: "empty", key: "2" },
  { id: "open", key: "3" },
];

export const EXAMPLE_STATUS = "A full adder to start: step through its eight frames with ◀ ▶, or open Timing Diagram.";
export const EMPTY_STATUS = "Pick an element on the left to place it, or press W to draw a wire. Press ? for the keys.";

/** "chooser" only when nothing was opened by link and there is no autosave; otherwise the figure loads as before. */
export function startAction({ opened, saved }) {
  return !opened && !saved ? "chooser" : "none";
}

/** The choice a key makes, or null. Escape is the same as Empty figure. */
export function choiceForKey(key) {
  if (key === "Escape") return "empty";
  return CHOICES.find((c) => c.key === key)?.id ?? null;
}
