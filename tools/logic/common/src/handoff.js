// L1.4: moving a function between the logic tools and into the Figure Editor. Core parts have no DOM; sendToFigureEditor does.
//
// Between tools the format is `function/0.1` (a file, or a link with ?expr=). Into the Figure Editor the format is a `circuit`
// made by the library's toCircuit. The editor opens `?open=<url>` for same-origin addresses, and a blob: address made by this page
// counts as same-origin, so the hand-off needs no change to the editor. The blob lives while the sending tab is open.

import { toCircuit, parse } from "../../analyze/model/logic/index.mjs";

/** The expression a function file stands for: the one it was written as, else its cheapest listed minimal sum of products, else its canonical SOP. */
export const expressionOfFunction = (fn) => fn.expression ?? fn.minimal?.sop?.[0] ?? fn.sop ?? null;

/** A circuit/0.2 as text for `expression` over `variables`, or { error }. */
export function circuitFor(expression, { id = "f", output = "F", variables, title } = {}) {
  try {
    const c = toCircuit(parse(expression), { id, title: title ?? `${output}`, output, variables });
    return { text: JSON.stringify(c, null, 2) + "\n" };
  } catch (e) { return { error: e.message }; }
}

/** A link to the Boolean solver with an expression filled in. `from` is a path to the solver folder from the current page. */
export const solverHref = (expression, { goal = "sop", from = "../solver/" } = {}) => `${from}?expr=${encodeURIComponent(expression)}&goal=${goal}`;

/** Open the Figure Editor in a new tab with this circuit. Returns an error message, or null when the tab was opened. */
export function sendToFigureEditor(circuitText, { editor = "../../figure-editor/" } = {}) {
  const blob = URL.createObjectURL(new Blob([circuitText], { type: "application/json" }));
  const url = new URL(editor, location.href);
  url.searchParams.set("open", blob);
  const w = window.open(url.href, "_blank");
  if (!w) { URL.revokeObjectURL(blob); return "The browser blocked the new tab. Allow pop-ups for this site, or download the circuit and use the editor's Open command."; }
  return null;
}
