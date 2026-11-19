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

// ---- R1: the beta becomes the Figure Editor ------------------------------------------------------------------------
// The beta (Copilot's work, Nov 15 to 16) is the newer copy, so its autosave wins; the Figure Editor's own autosave goes
// into the saved list. Saved lists merge. Options and private theme are copied only where the Figure Editor has none.
// The beta's timing diagram becomes the shared one (timing-diagram/source, also the Timing Diagram page's); a different
// diagram already there is kept under timing-diagram/source-before-r1. Truth table copies across. Old keys are never
// removed, so the tag editor-before-r1 still finds its data. Runs once (flag figure-editor/migrated-r1).

export const FLAG_R1 = "figure-editor/migrated-r1";

export function migrateR1(get, set, now = new Date().toISOString()) {
  if (get(FLAG_R1)) return null;
  const moved = [], B = (k) => get(`figure-editor-beta/${k}`), F = (k) => get(`figure-editor/${k}`);
  const saves = [...list(F("saves"))];
  const have = new Set(saves.map((s) => s.text));
  for (const s of list(B("saves"))) if (s?.text && !have.has(s.text)) { saves.push(s); have.add(s.text); moved.push(`saved ${s.id}`); }
  const beta = B("autosave"), mine = F("autosave");
  if (beta && beta !== mine) {
    if (mine && !have.has(mine)) { saves.push({ id: `${idOf(mine)} (before R1)`, saved: now, text: mine }); have.add(mine); }
    set("figure-editor/autosave", beta); moved.push("autosave");
  }
  saves.sort((a, b) => String(b.saved ?? "").localeCompare(String(a.saved ?? "")));
  if (saves.length !== list(F("saves")).length) set("figure-editor/saves", JSON.stringify(saves));
  for (const k of ["options", "private-theme"]) if (B(k) && !F(k)) { set(`figure-editor/${k}`, B(k)); moved.push(k); }
  const tsrc = B("timing-source"), shared = get("timing-diagram/source");
  if (tsrc && tsrc !== shared) {
    if (shared) set("timing-diagram/source-before-r1", shared);
    set("timing-diagram/source", tsrc); moved.push("timing diagram");
  }
  if (B("timing-send") && !get("timing-diagram/send")) set("timing-diagram/send", B("timing-send"));
  if (B("truth-table") && !F("truth-table")) { set("figure-editor/truth-table", B("truth-table")); moved.push("truth table"); }
  set(FLAG_R1, now);
  return moved;
}
