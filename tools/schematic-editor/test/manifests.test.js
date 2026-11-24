// F25.3: every pinned copy still matches its MANIFEST (SHA-256 and size), the model pin is written in one place,
// no script names a path that moved, and the old beta URL stays out of search. Runs in CI with the other tests.

import { verifyManifest } from "../../shared/src/manifest.js";
import { assert, assertEquals } from "./helpers.js";

const root = new URL("../../../", import.meta.url);
const read = (p) => Deno.readFile(new URL(p, root));
const text = (p) => Deno.readTextFile(new URL(p, root));
const bytes = (s) => new TextEncoder().encode(s);

const sha = async (b) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");

Deno.test("verifyManifest accepts a matching copy and names a changed, shortened or missing file", async () => {
  const good = bytes("hello");
  const manifest = { files: [{ name: "a.txt", bytes: 5, sha256: await sha(good) }, { name: "b.txt", bytes: 3, sha256: await sha(bytes("abc")) }] };
  const files = { "a.txt": good, "b.txt": bytes("abc") };
  assertEquals(await verifyManifest(manifest, async (n) => files[n]), []);
  assertEquals((await verifyManifest(manifest, async (n) => n === "a.txt" ? bytes("hellp") : files[n])).map((p) => p.name), ["a.txt"]);
  assertEquals((await verifyManifest(manifest, async (n) => n === "b.txt" ? bytes("ab") : files[n])).map((p) => p.name), ["b.txt"]);
  const gone = await verifyManifest(manifest, async (n) => { if (n === "a.txt") throw new Deno.errors.NotFound(n); return files[n]; });
  assertEquals(gone.map((p) => p.name), ["a.txt"]);
  assert(/missing/i.test(gone[0].problem), gone[0].problem);
});

const COPIES = [
  ["the symbol pack", "tools/schematic-editor/symbol-pack/"],
  ["the editors' simulator", "tools/shared/src/sim/"],
  ["the editors' validator and schemas", "tools/shared/test/model/"],
  ["the logic tools' model copy", "tools/logic/analyze/model/"],
];
for (const [what, dir] of COPIES) {
  Deno.test(`${what} (${dir}) matches its MANIFEST`, async () => {
    const manifest = JSON.parse(await text(dir + "MANIFEST.json"));
    assert(manifest.files.length > 0, "empty manifest");
    assertEquals(await verifyManifest(manifest, (n) => read(dir + n)), []);
  });
}

Deno.test("MODEL_PIN.json is the one place the model tag is written: the copies and copy-model.js follow it", async () => {
  const pin = JSON.parse(await text("tools/schematic-editor/MODEL_PIN.json"));
  for (const dir of ["tools/shared/src/sim/", "tools/shared/test/model/"]) {
    const m = JSON.parse(await text(dir + "MANIFEST.json"));
    assertEquals([m.ref, m.commit], [pin.tag, pin.commit], dir);
  }
  const logic = JSON.parse(await text("tools/logic/analyze/model/MANIFEST.json"));
  assertEquals([logic.ref, logic.commit], [pin.logic_tag, pin.logic_commit], "logic tools' copy");
  const script = await text("tools/shared/scripts/copy-model.js");
  assert(/MODEL_PIN\.json/.test(script), "copy-model.js does not read MODEL_PIN.json");
  assert(!/model-v\d/.test(script), "copy-model.js still names a model tag: " + (script.match(/model-v[\d.]+/) ?? [])[0]);
});

Deno.test("no script or test header names a path that moved out of tools/figure-editor", async () => {
  const stale = /tools\/figure-editor\/(scripts\/(copy-symbol-pack|build-sample|tex-needed)|symbol-pack)/;
  for (const f of ["copy-symbol-pack.js", "build-sample.js", "tex-needed.js"]) {
    const s = await text("tools/schematic-editor/scripts/" + f);
    assert(!stale.test(s), f + ": " + s.match(stale)?.[0]);
  }
  assert(!/tools\/figure-editor\/test\/run\.js/.test(await text("tools/schematic-editor/test/run.js")), "schematic-editor/test/run.js names the Figure Editor's runner");
  const man = JSON.parse(await text("tools/schematic-editor/symbol-pack/MANIFEST.json"));
  assert(man.note.includes("tools/schematic-editor/scripts/copy-symbol-pack.js"), man.note);
});

Deno.test("the old beta URL is kept out of search (tools/_metadata.yml) and its page does not undo that", async () => {
  assert(/include-in-header:\s*\.\.\/_includes\/noindex\.html/.test(await text("tools/_metadata.yml")), "tools/_metadata.yml has no noindex include");
  assert(/robots"\s+content="noindex"/.test(await text("_includes/noindex.html")));
  assert(!/include-in-header/.test(await text("tools/figure-editor-beta/index.qmd")), "the beta page overrides include-in-header");
});
