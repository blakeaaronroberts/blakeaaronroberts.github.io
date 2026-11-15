// F14 / F18.1: the beta's browser storage is brought across once, and nothing is lost.

import { FLAG, migrateBeta } from "../src/migrate.js";
import { assert, assertEquals } from "./helpers.js";

const mem = (init) => { const m = new Map(Object.entries(init)); return { m, get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v) }; };

Deno.test("an empty Figure Editor takes the beta's autosave, saves, options and theme; the beta keeps its own", () => {
  const s = mem({ "figure-editor-beta/autosave": '{"id":"a"}', "figure-editor-beta/saves": JSON.stringify([{ id: "x", saved: "2026-11-13", text: "X" }]), "figure-editor-beta/options": "{}", "figure-editor-beta/private-theme": "{}" });
  const moved = migrateBeta(s.get, s.set);
  assertEquals(s.get("figure-editor/autosave"), '{"id":"a"}');
  assertEquals(JSON.parse(s.get("figure-editor/saves")).map((x) => x.text), ["X"]);
  assertEquals(s.get("figure-editor/options"), "{}");
  assertEquals(s.get("figure-editor-beta/autosave"), '{"id":"a"}');
  assert(moved.includes("autosave") && s.get(FLAG));
  assertEquals(migrateBeta(s.get, s.set), null);
});

Deno.test("when both have an autosave, the beta's goes into the saved list; saves merge without duplicates", () => {
  const s = mem({
    "figure-editor/autosave": '{"id":"mine"}', "figure-editor-beta/autosave": '{"id":"b"}',
    "figure-editor/saves": JSON.stringify([{ id: "m", saved: "2026-11-12", text: "M" }]),
    "figure-editor-beta/saves": JSON.stringify([{ id: "m", saved: "2026-11-12", text: "M" }, { id: "n", saved: "2026-11-14", text: "N" }]),
    "figure-editor/options": '{"scale":2}', "figure-editor-beta/options": '{"scale":1}',
  });
  migrateBeta(s.get, s.set, "2026-11-15");
  assertEquals(s.get("figure-editor/autosave"), '{"id":"mine"}');
  assertEquals(JSON.parse(s.get("figure-editor/saves")).map((x) => x.text), ['{"id":"b"}', "N", "M"]);
  assertEquals(s.get("figure-editor/options"), '{"scale":2}');
});
