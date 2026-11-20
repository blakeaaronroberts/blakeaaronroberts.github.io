// Where the editor's own data sits in a circuit file (R1; circuit-model C13.5, tag model-v0.7.0). No DOM.
//
// Editor data: frames of levels, net labels and their placement, level-tag style, the slide, port taps and port levels,
// solder crossings and dots, the backdrop, the logic mode and generated levels. In memory it is the document's `groups`
// object (one flat object). In a file:
// - circuit/0.3 (written whenever there is editor data): `annotations`, one object per tool in kebab-case,
//   annotations["schematic-editor"] for the drawing's data and annotations["figure-editor"] for the slide. The file's
//   own `groups` means what the schema says, buses (name to port ids), and is kept as it is (doc.buses).
// - circuit/0.2 files saved before R1.4 kept editor data in `groups`; they are still read, and saved again as 0.3.

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Which tool owns each kind of editor data in annotations; anything not listed is the Schematic Editor's. */
export const OWNER = { slide: "figure-editor" };
export const DEFAULT_OWNER = "schematic-editor";

/** A bus in the schema's sense: a list of ids. Editor data in an old file's `groups` is never shaped like that. */
const isBus = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * The editor data a parsed circuit file carries, as one flat object (empty if none). With `annotations`, that is where
 * it is. Without (circuit/0.2 files from before R1.4, and the beta's draft circuit/0.3), it was kept in `groups`:
 * every entry there that is not a bus.
 */
export function editorDataOf(raw) {
  if (isObject(raw?.annotations)) return Object.assign({}, ...Object.values(raw.annotations).filter(isObject));
  if (!isObject(raw?.groups)) return {};
  return Object.fromEntries(Object.entries(raw.groups).filter(([, v]) => !isBus(v)));
}

/** The buses (`groups` in the schema's sense) a parsed file carries, or undefined. */
export function busesOf(raw) {
  if (!isObject(raw?.groups)) return undefined;
  const buses = isObject(raw.annotations) ? raw.groups : Object.fromEntries(Object.entries(raw.groups).filter(([, v]) => isBus(v)));
  return Object.keys(buses).length ? buses : undefined;
}
/** Whether a parsed file has editor data at all. */
export const hasEditorData = (raw) => Object.keys(editorDataOf(raw)).length > 0;

/** The flat editor data split into annotations, one object per owning tool. */
export function annotationsFor(data) {
  const out = {};
  for (const [key, value] of Object.entries(data ?? {})) (out[OWNER[key] ?? DEFAULT_OWNER] ??= {})[key] = value;
  return out;
}
