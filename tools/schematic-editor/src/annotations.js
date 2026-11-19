// Where the editor's own data sits in a circuit file (R1, Blake's answer 8). No DOM.
//
// Editor data: frames of levels, net labels and their placement, level-tag style, the slide, port taps and port levels,
// solder crossings and dots, the backdrop, the logic mode and generated levels. In memory it is the document's
// `groups` object. In circuit/0.2 files it rides in `groups` too, whose schema meaning is buses (name to port ids),
// so circuit-model's validator refuses such a figure. circuit-model C13.5 adds an optional `annotations` object to
// circuit/0.3 for exactly this. When that tag is pinned, the move is this file: set FILE_KEY to "annotations"
// (reading keeps accepting the old `groups` place, so saved work still opens).

export const FILE_KEY = "groups";
const OLD_KEYS = ["groups"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** The editor data a parsed circuit file carries: an object (empty if none). Reads the current place, then the old one. */
export function editorDataOf(raw) {
  for (const key of [FILE_KEY, ...OLD_KEYS]) if (isObject(raw?.[key])) return raw[key];
  return {};
}

/** Whether a parsed file has editor data at all. */
export const hasEditorData = (raw) => [FILE_KEY, ...OLD_KEYS].some((key) => raw?.[key] !== undefined);
