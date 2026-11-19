// The mount interface every tool in tools/ shares (R1; VISION.md section 4). No DOM.
//
//   const tool = await mount(element, options)
//
// options: storage (key prefix), embedded (inside a composite: no page chrome), theme, services, and the tool's own.
// The returned object always has:
//   load(format, data) / save(format)   one of the shared formats, as text (circuit, scenario, trace, function, wavedrom)
//   on(event, fn) / off(event, fn)       events: change, status, frame, levels, nodes, selection
//   command(name, args) / commands()     toolbar actions a host may forward, and the list of them
//   panes()                              the side panes the tool contributes: [{ id, title, element }]
//   destroy()                            remove the tool from its element
// A format or event a tool does not support throws (load, save) or never fires (on); it is never silently ignored.

export const EVENTS = ["change", "status", "frame", "levels", "nodes", "selection"];
export const FORMATS = ["circuit", "scenario", "trace", "function", "wavedrom"];

/** A small event bus: on, off, emit. Unknown events are refused so a typo fails loudly. */
export function emitter() {
  const handlers = new Map(EVENTS.map((e) => [e, new Set()]));
  const known = (event) => { if (!handlers.has(event)) throw new Error(`unknown event "${event}" (events: ${EVENTS.join(", ")})`); return handlers.get(event); };
  return {
    on: (event, fn) => { known(event).add(fn); return () => known(event).delete(fn); },
    off: (event, fn) => { known(event).delete(fn); },
    emit: (event, payload) => { for (const fn of known(event)) { try { fn(payload); } catch (e) { console.error(e); } } },
  };
}

/** Refuse a format the tool does not handle, with the ones it does. */
export function unsupported(tool, format, supported) {
  throw new Error(`${tool} does not ${supported.verb} "${format}" (it ${supported.verb}s: ${supported.list.join(", ")})`);
}
