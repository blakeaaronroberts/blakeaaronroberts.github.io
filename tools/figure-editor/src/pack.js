// Symbol pack loading. No DOM: `read(path)` is fetch in the browser, a file read in tests.
// The editor draws only what the pack holds: the element SVGs, their pin JSON, and
// theme.json's roles and sizes (proposal sections 5 and 10.1).

import { MODULE_CM, STEPS_PER_MODULE } from "./geometry.js";
import { attr, parseXml } from "./xml.js";
import { BLOCK, blockDef } from "./block.js";

/** The four logic levels a wire can be drawn at, and the theme role that colours each. */
export const LEVELS = [
  { value: "0", role: "low", name: "low" },
  { value: "1", role: "high", name: "high" },
  { value: "X", role: "unknown", name: "unknown" },
  { value: "Z", role: "floating", name: "floating" },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** What the pack's theme must say, because the editor carries no drawing constants of its own. */
function checkTheme(theme) {
  if (theme.geometry?.grid_steps_per_module !== STEPS_PER_MODULE || theme.geometry?.module_cm !== MODULE_CM) {
    throw new Error("theme.json geometry does not match the editor's grid (2 steps per 0.5 cm module)");
  }
  const f = theme.line?.straight_joint_frac;
  if (!(typeof f === "number" && f > 0 && f <= 1)) {
    throw new Error("theme.json has no line.straight_joint_frac (the straight-joint size). Copy symbol pack 0.2 or later.");
  }
  for (const k of ["width_cm", "width_pt", "width_module"]) {
    if (!(theme.line?.[k] > 0)) throw new Error(`theme.json has no line.${k}`);
  }
  if (!(theme.geometry?.label_gap_cm >= 0)) throw new Error("theme.json has no geometry.label_gap_cm");
}

export async function loadPack(read) {
  const index = JSON.parse(await read("index.json"));
  if (!/^symbols\/0\./.test(index.pack)) throw new Error(`symbol pack ${index.pack}: this editor reads symbols/0.x`);
  const theme = JSON.parse(await read(index.theme));
  checkTheme(theme);
  const defs = new Map(), svgs = new Map(), svgText = new Map();
  await Promise.all(index.elements.map(async (e) => {
    const [json, svg] = await Promise.all([read(e.json), read(e.svg)]);
    const stem = e.json.replace(/\.json$/, "");   // pack 0.3: a file per variant (and_gate, and_gate--n3, ...); the default has the type's own name
    defs.set(stem, JSON.parse(json));
    svgText.set(stem, svg);
    svgs.set(stem, parseXml(svg));
  }));
  return makePack({ index, theme, defs, svgs, svgText, baseTheme: theme, remap: new Map() });
}

const isDefault = (e) => !e.variant || Object.keys(e.variant).length === 0;
function makeStem(p, el) {
  const ps = p.defs.get(el.type)?.parameters ?? [];
  const stem = el.type + ps.map((q) => { const v = el.params?.[q.name]; return v !== undefined && v !== q.default ? `--${q.name}${v}` : ""; }).join("");
  return p.defs.has(stem) ? stem : el.type;
}

function makePack(p) {
  return {
    ...p,
    /** Element types in pack order; approved only unless drafts are asked for. */
    /** The element families in pack order: one per type (its default variant), the ones a newer type replaces left out; approved only unless drafts are asked for. */
    types: (drafts = false) => p.index.elements.filter((e) => isDefault(e) && !e.superseded_by && (drafts || e.status === "approved")).map((e) => e.type),
    /** Every type with a default variant, replaced ones included (an old figure may use them). */
    allTypes: () => p.index.elements.filter(isDefault).map((e) => e.type),
    /** The status of a type's default variant: "approved" or "draft". */
    statusOf: (type) => p.index.elements.find((e) => isDefault(e) && e.type === type)?.status ?? "approved",
    /** The sizes and counts a family can be drawn with: [{name, default, values}] (none for most elements). */
    parametersOf: (type) => (p.defs.get(type)?.parameters ?? []).map(({ name, default: d, values }) => ({ name, default: d, values })),
    /** The file stem of a placed element: its type plus a "--<name><value>" for each parameter that is not at its default. */
    stemOf: (el) => {
      const ps = p.defs.get(el.type)?.parameters ?? [];
      const stem = el.type + ps.map((q) => { const v = el.params?.[q.name]; return v !== undefined && v !== q.default ? `--${q.name}${v}` : ""; }).join("");
      return p.defs.has(stem) ? stem : el.type;
    },
    /** Every file stem in the pack, variants included. */
    stems: () => [...p.defs.keys()],
    def: (type) => p.defs.get(type),
    /** The definition of a placed element: the pack's (its variant, if its params ask for one), or for the built-in block the one its params make (null if they are invalid). */
    defFor: (el) => (el.type === BLOCK ? blockDef(el.params) : p.defs.get(makeStem(p, el))),
    /** Only elements whose pack JSON says "mirrorable": true can be mirrored (proposal 10.3). The built-in block always can. */
    mirrorable: (type) => type === BLOCK || p.defs.get(type)?.mirrorable === true,
    /** A theme role's colour, or null if the theme has no such role. */
    role: (name) => p.theme.roles?.[name] ?? null,
    /** The colour of a wire level ("0", "1", "X", "Z"), or null if the theme lacks its role (the level is then unavailable). */
    levelColour: (level) => {
      const l = LEVELS.find((x) => x.value === level);
      return l ? (p.theme.roles?.[l.role] ?? null) : null;
    },
    /** Colours baked into a pack SVG, mapped to the active theme (identity unless a private theme is loaded). */
    recolour: (hex) => p.remap.get(hex.toUpperCase()) ?? hex,
    /** Same pack drawn with a private theme's roles. Returns a new pack; the loaded pack is untouched. */
    withTheme: (roles) => withTheme(p, roles),
    isPrivate: p.theme !== p.baseTheme,
  };
}

/**
 * A private theme: a JSON file shaped like the pack's theme.json, of which only `roles` is read
 * (every value a #RRGGBB colour; roles left out keep the pack's colour). It lives in the browser only.
 */
export function parsePrivateTheme(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw new Error(`not JSON: ${e.message}`); }
  const roles = raw?.roles;
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) throw new Error('the file needs a "roles" object, like the pack\'s theme.json');
  const out = {};
  for (const [k, v] of Object.entries(roles)) {
    if (!/^[a-z][a-z0-9_]*$/.test(k)) throw new Error(`role name "${k}" is not a lowercase name`);
    if (typeof v !== "string" || !HEX.test(v)) throw new Error(`role "${k}": ${JSON.stringify(v)} is not a #RRGGBB colour`);
    out[k] = v.toUpperCase();
  }
  if (!Object.keys(out).length) throw new Error('"roles" is empty');
  return out;
}

function withTheme(p, roles) {
  const base = p.baseTheme.roles;
  const merged = { ...base };
  for (const [k, v] of Object.entries(roles)) merged[k] = v;
  // Pack SVGs carry the base theme's colours baked in. Map each baked colour to the role that owns it
  // (the first role in this order when several share a colour), then to that role's new colour.
  const order = ["ink", "background", "low", "high", "flow", "accent", "highlight", ...Object.keys(base)];
  const remap = new Map();
  for (const role of order) {
    const was = base[role]?.toUpperCase();
    if (was && !remap.has(was) && merged[role]) remap.set(was, merged[role].toUpperCase());
  }
  return makePack({ ...p, theme: { ...p.baseTheme, roles: merged }, remap });
}

/** The pack's own SVG root children (defs, body, leads) for a type. */
export function symbolParts(pack, type) {
  const root = pack.svgs.get(type);
  return {
    viewBox: attr(root, "viewBox"),
    children: root.children,
  };
}
