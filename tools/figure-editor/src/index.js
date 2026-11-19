// The Figure Editor: the composite of the Schematic Editor and the Timing Diagram, with slide export, ZIP export and
// the LaTeX truth table (R1). It owns the page's shell: the toolbar (the Schematic Editor's button groups plus its own)
// and the section stack (Schematic Editor, Timing Diagram, Slide, with their bars and resizers). The Schematic Editor runs
// embedded inside it: it fills the slots the shell leaves and has no toolbar of its own. The composite lends the parts
// (slide, ZIP, LaTeX table, the Timing Diagram) and reaches the other tools only through their index.js.
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

const SECTIONS = [["figure", "Schematic Editor"], ["timing", "Timing Diagram"], ["slide", "Slide"]];

/** The composite's shell: its toolbar and section stack, with slots the embedded Schematic Editor fills. */
export function shell(tg) {
  const group = (label, html, end = false) => `<div class="fe-group${end ? " fe-group-end" : ""}" role="group" aria-label="${label}">${html}</div>`;
  const bar = (key, title) => `<button type="button" class="fe-sec-bar" data-cmd="view${key}" data-sec-bar="${key}" aria-expanded="false"><span class="label-mono">${title}</span><span class="fe-sec-chev" aria-hidden="true"></span></button>`;
  const resize = (a, b, A, B) => `<div class="fe-stack-resizer" data-stack-resize="${a}-${b}" role="separator" aria-label="Resize ${A} and ${B} panes" aria-orientation="horizontal" tabindex="0"></div>`;
  return `
  <div class="fe">
    <div class="fe-toolbar" role="toolbar" aria-label="Figure Editor">
      ${group("Tool", tg.tool)}${group("Edit", tg.edit)}${group("History", tg.history)}${group("Clipboard", tg.clipboard)}${group("View", tg.view)}${group("Part grid: snap step for parts", tg.grid)}
      ${group("File", tg.file + tg.projectzip)}
      <div class="fe-group fe-group-end" role="navigation" aria-label="Frames"><span class="fe-stepper">${tg.frames.replace(/(<button[^>]*data-cmd="navframes")/, `${tg.frametosignal}$1`)}</span>${tg.help}</div>
    </div>
    <div data-slot="left"></div>
    <div data-slot="resizer"></div>
    <div class="fe-stack" role="region" aria-label="Workspace: Schematic Editor, Timing Diagram and Slide">
      ${bar("figure", "Schematic Editor")}
      <div class="fe-sec" data-sec="figure"></div>
      ${resize("figure", "timing", "Schematic Editor", "Timing Diagram")}
      ${bar("timing", "Timing Diagram")}
      <div class="fe-sec" data-sec="timing"></div>
      ${resize("timing", "slide", "Timing Diagram", "Slide")}
      ${bar("slide", "Slide")}
      <div class="fe-sec" data-sec="slide"></div>
    </div>
    <div data-slot="status"></div>
  </div>`;
}

export async function mount(element, options = {}) {
  element.innerHTML = shell(await schematic.toolbarGroups());
  return schematic.mount(element, { storage: "figure-editor/", timingStorage: "timing-diagram/", migrate: true, ...options, host: true, parts });
}

export { SECTIONS };
