// One-time move of the beta editor's browser storage into the Figure Editor's (F14 / F18.1). No DOM.
//
// The beta page now redirects here. Whatever Blake kept in the beta (autosave, saved list, options, private
// theme) is copied into the Figure Editor's keys, and the beta's own keys are left in place, so nothing is lost
// even if something goes wrong. A flag makes it run once.

export const FLAG = "figure-editor/migrated-from-beta";
const PAIRS = ["autosave", "saves", "options", "private-theme"];

const list = (text) => { try { const v = JSON.parse(text ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const idOf = (text) => { try { return JSON.parse(text).id ?? "figure"; } catch { return "figure"; } };

/** Copy the beta's keys into the Figure Editor's. `get`/`set` are storage accessors. Returns what moved (names), or null if already done. */
export function migrateBeta(get, set, now = new Date().toISOString()) {
  if (get(FLAG)) return null;
  const moved = [];
  const beta = Object.fromEntries(PAIRS.map((k) => [k, get(`figure-editor-beta/${k}`)]));
  const mine = Object.fromEntries(PAIRS.map((k) => [k, get(`figure-editor/${k}`)]));

  // The saved list: both lists, newest first, one entry per distinct text.
  const saves = [...list(mine.saves)];
  const have = new Set(saves.map((s) => s.text));
  for (const s of list(beta.saves)) if (s?.text && !have.has(s.text)) { saves.push(s); have.add(s.text); moved.push(`saved ${s.id}`); }
  // The autosave: taken over if the Figure Editor has none; otherwise kept in the saved list so it is not lost.
  if (beta.autosave && beta.autosave !== mine.autosave) {
    if (!mine.autosave) { set("figure-editor/autosave", beta.autosave); moved.push("autosave"); }
    else if (!have.has(beta.autosave)) { saves.push({ id: `${idOf(beta.autosave)} (beta autosave)`, saved: now, text: beta.autosave }); moved.push("beta autosave, into the saved list"); }
  }
  saves.sort((a, b) => String(b.saved ?? "").localeCompare(String(a.saved ?? "")));
  if (saves.length !== list(mine.saves).length) set("figure-editor/saves", JSON.stringify(saves));
  for (const k of ["options", "private-theme"]) if (beta[k] && !mine[k]) { set(`figure-editor/${k}`, beta[k]); moved.push(k); }
  set(FLAG, now);
  return moved;
}
