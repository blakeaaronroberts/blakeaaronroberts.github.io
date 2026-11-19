// The Figure Editor: the composite of the Schematic Editor and the Timing Diagram, with slide export, ZIP export and
// the LaTeX truth table (R1). It owns those parts and lends them to the Schematic Editor's shell; it reaches the other
// tools only through their index.js.
//
//   const tool = await mount(element, { pack, open })
//
// Same interface as the tools it is built from (tools/shared/src/tool.js); saved work lives under "figure-editor/".

import * as schematic from "../../schematic-editor/src/index.js";
import * as timing from "../../timing/src/index.js";
import * as slide from "./slide.js";
import { FORMATS } from "./frame.js";
import { zipStore } from "./zip.js";
import { latexTable, parseTable } from "./latex-table.js";

/** The parts the composite lends: what the Schematic Editor shows only when it runs inside the Figure Editor. */
export const parts = {
  slide: { ...slide, FORMATS },
  timing,
  zip: { zipStore },
  latex: { latexTable, parseTable },
};

export function mount(element, options = {}) {
  return schematic.mount(element, { storage: "figure-editor/", timingStorage: "timing-diagram/", migrate: true, ...options, parts });
}
