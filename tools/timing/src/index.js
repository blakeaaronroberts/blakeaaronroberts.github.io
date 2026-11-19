// The Timing Diagram, as a tool (R1). Its own page is tools/timing-diagram/; the Figure Editor docks it. Other tools
// import only this file.
//
//   const tool = await mount(element, { storage, embedded, ...the module's own options })
//
// Formats: load and save "wavedrom" (WaveDrom-format JSON text). Events: change, status, frame. The module's own API
// (setCircuit, setFrame, exportSvg, ...) stays on the returned object for the composite.

import { emitter, unsupported } from "../../shared/src/tool.js";
import { mount as mountRaw } from "./app.js";

export async function mount(element, options = {}) {
  const bus = emitter();
  const { onChange, onStatus, onFrameChange, embedded, storage, ...rest } = options;
  const raw = mountRaw(element, {
    docked: embedded ?? rest.docked ?? false,
    ...(storage ? { storageKey: `${storage}source`, sendKey: `${storage}send` } : {}),
    ...rest,
    onChange: (...a) => { onChange?.(...a); bus.emit("change", { format: "wavedrom" }); },
    onStatus: (m, err) => { onStatus?.(m, err); bus.emit("status", { text: m, error: !!err }); },
    onFrameChange: (i, ...a) => { onFrameChange?.(i, ...a); bus.emit("frame", { index: i }); },
  });
  return Object.assign(raw, {
    load(format, data) {
      if (format !== "wavedrom") unsupported("the Timing Diagram", format, { verb: "load", list: ["wavedrom"] });
      raw.source = String(data);
    },
    save(format) {
      if (format !== "wavedrom") unsupported("the Timing Diagram", format, { verb: "save", list: ["wavedrom"] });
      return raw.source;
    },
    on: bus.on,
    off: bus.off,
    command(name) {
      const map = { new: raw.clear, export: raw.exportSvg, exportPng: raw.exportPng, fit: raw.fit };
      if (!map[name]) throw new Error(`the Timing Diagram has no command "${name}"`);
      return map[name]();
    },
    commands: () => ["new", "export", "exportPng", "fit"],
    panes: () => [],
    destroy() { element.replaceChildren(); },
  });
}

// What other tools may use from the timing code (DOM-free).
export { drawTiming, parseEdge } from "./draw.js";
export { arrowHeadSizeOf, arrowLabelSizeOf, edgeLineWidthOf, edgeStylesFor, lineWidthOf, signalNameSizeOf, textSizeOf } from "./model.js";
