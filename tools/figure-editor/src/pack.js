// Symbol pack loading. No DOM: `read(path)` is fetch in the browser, a file read in tests.
// The editor draws only what the pack holds: the element SVGs, their pin JSON, and
// theme.json's roles and sizes (proposal sections 5 and 10.1).

import { MODULE_CM, STEPS_PER_MODULE } from "./geometry.js";
import { attr, parseXml } from "./xml.js";

export async function loadPack(read) {
  const index = JSON.parse(await read("index.json"));
  if (!/^symbols\/0\./.test(index.pack)) throw new Error(`symbol pack ${index.pack}: this editor reads symbols/0.x`);
  const theme = JSON.parse(await read(index.theme));
  if (theme.geometry.grid_steps_per_module !== STEPS_PER_MODULE || theme.geometry.module_cm !== MODULE_CM) {
    throw new Error("theme.json geometry does not match the editor's grid (2 steps per 0.5 cm module)");
  }
  const defs = new Map(), svgs = new Map(), svgText = new Map();
  await Promise.all(index.elements.map(async (e) => {
    const [json, svg] = await Promise.all([read(e.json), read(e.svg)]);
    defs.set(e.type, JSON.parse(json));
    svgText.set(e.type, svg);
    svgs.set(e.type, parseXml(svg));
  }));
  return {
    index, theme, defs, svgs, svgText,
    /** Element types in pack order; approved only unless drafts are asked for (F3 adds the switch). */
    types: (drafts = false) => index.elements.filter((e) => drafts || e.status === "approved").map((e) => e.type),
    def: (type) => defs.get(type),
    /** Only elements whose pack JSON says "mirrorable": true can be mirrored (proposal 10.3). */
    mirrorable: (type) => defs.get(type)?.mirrorable === true,
  };
}

/** The pack's own SVG root children (defs, body, leads) for a type. */
export function symbolParts(pack, type) {
  const root = pack.svgs.get(type);
  return {
    viewBox: attr(root, "viewBox"),
    children: root.children,
  };
}
