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

import { FLAG_R1, migrateR1 } from "../src/migrate.js";

Deno.test("R1: the beta's work wins and nothing is lost; old keys stay; runs once", () => {
  const s = mem({
    "figure-editor/autosave": '{"id":"stable"}', "figure-editor-beta/autosave": '{"id":"beta"}',
    "figure-editor/saves": JSON.stringify([{ id: "a", saved: "2026-11-14", text: "A" }]),
    "figure-editor-beta/saves": JSON.stringify([{ id: "a", saved: "2026-11-14", text: "A" }, { id: "b", saved: "2026-11-16", text: "B" }]),
    "figure-editor-beta/options": '{"x":1}', "figure-editor-beta/timing-source": '{"signal":[1]}', "timing-diagram/source": '{"signal":[0]}',
    "figure-editor-beta/truth-table": "TT",
  });
  migrateR1(s.get, s.set, "2026-11-19");
  assertEquals(s.get("figure-editor/autosave"), '{"id":"beta"}');
  assertEquals(JSON.parse(s.get("figure-editor/saves")).map((x) => x.text), ['{"id":"stable"}', "B", "A"]);
  assertEquals([s.get("figure-editor/options"), s.get("figure-editor/truth-table")], ['{"x":1}', "TT"]);
  assertEquals([s.get("timing-diagram/source"), s.get("timing-diagram/source-before-r1")], ['{"signal":[1]}', '{"signal":[0]}']);
  assertEquals(s.get("figure-editor-beta/autosave"), '{"id":"beta"}');
  assert(s.get(FLAG_R1));
  assertEquals(migrateR1(s.get, s.set), null);
});

Deno.test("R1: only one set of keys, or none", () => {
  const onlyStable = mem({ "figure-editor/autosave": "S" });
  migrateR1(onlyStable.get, onlyStable.set);
  assertEquals(onlyStable.get("figure-editor/autosave"), "S");
  const none = mem({});
  assertEquals(migrateR1(none.get, none.set), []);
});
