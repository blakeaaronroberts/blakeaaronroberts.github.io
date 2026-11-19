// The Schematic Editor: the drawing pane, as a tool (R1). Its own page is tools/schematic-editor/; the Figure Editor
// mounts it with the parts it lends (slide, Timing Diagram, ZIP, LaTeX table). Other tools import only this file.
//
//   const tool = await mount(element, { pack, open, storage, embedded, parts })
//
// Formats: load and save "circuit" (circuit/0.2 text). Events: change, status, frame. See tools/shared/src/tool.js.

import { emitter, unsupported } from "../../shared/src/tool.js";

export async function mount(element, options = {}) {
  const bus = emitter();
  const { mount: mountApp } = await import("./app.js");   // loaded on demand: the exports below stay DOM-free
  const app = await mountApp(element, { storage: "schematic-editor/", ...options, emit: bus.emit });
  return {
    load(format, data) {
      if (format !== "circuit") unsupported("the Schematic Editor", format, { verb: "load", list: ["circuit"] });
      app.load(String(data));
    },
    save(format) {
      if (format !== "circuit") unsupported("the Schematic Editor", format, { verb: "save", list: ["circuit"] });
      return app.save();
    },
    on: bus.on,
    off: bus.off,
    command: (name, args) => app.command(name, args),
    commands: () => app.commandNames(),
    panes: () => [...element.querySelectorAll(".fe-palette, .fe-side > details")].map((d) => ({ id: d.className.match(/fe-[a-z-]+/g)?.at(-1) ?? "pane", title: d.querySelector("summary")?.textContent.trim() ?? "", element: d })),
    destroy() { element.replaceChildren(); },
    /** The editor's own API (doc, exportSvg, png, typesetting), for the page and tests. */
    app,
  };
}

// What other tools may use from the drawing code (DOM-free).
export { exportSvg, drawing } from "./export.js";
export { applyFrame, framesOf } from "./levelframes.js";
export { fmt, MODULE_CM } from "./geometry.js";
export { editorDataOf } from "./annotations.js";
