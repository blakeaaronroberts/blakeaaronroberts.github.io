// F22.1a follow-up: ?open= takes a file of this site, or a blob: address made by this origin, and nothing else.
// The rule is tools/shared/src/openurl.js; the editor uses it before it fetches (app.js).

import { openableUrl } from "../../shared/src/openurl.js";
import { assert, assertEquals } from "./helpers.js";

const page = "https://blakeaaronroberts.github.io/tools/figure-editor/";
const origin = "https://blakeaaronroberts.github.io";
const check = (v) => openableUrl(v, page, origin);

Deno.test("same-site files are accepted: relative, root-relative and absolute", () => {
  assertEquals(check("examples/full-adder.json").url.pathname, "/tools/figure-editor/examples/full-adder.json");
  assertEquals(check("../schematic-editor/examples/x.json").url.pathname, "/tools/schematic-editor/examples/x.json");
  assertEquals(check("/sv_demo.json").url.pathname, "/sv_demo.json");
  assertEquals(check(origin + "/a.json").url.pathname, "/a.json");
});

Deno.test("a blob: address made by this origin is accepted (the logic tools' Send to Figure Editor)", () => {
  const b = `blob:${origin}/6f1c2c0e-2f0a-4d0e-9a53-3b8d6f0d1111`;
  assertEquals(check(b).url.href, b);
});

Deno.test("everything else is refused with a readable message", () => {
  for (const bad of ["https://example.com/c.json", "//example.com/c.json", "http://blakeaaronroberts.github.io/c.json",
    "blob:https://example.com/6f1c2c0e-2f0a-4d0e-9a53-3b8d6f0d1111", "blob:null/1234", "data:application/json,{}", "javascript:alert(1)",
    "file:///etc/passwd", "https://login:pw" + String.fromCharCode(64) + "blakeaaronroberts.github.io/c.json", "", "   ", "http://[bad"]) {
    const r = check(bad);
    assertEquals(r.url, undefined, bad);
    assert(/this site/.test(r.error), `${JSON.stringify(bad)}: ${r.error}`);
  }
});

Deno.test("the editor checks the address with that rule before it fetches", async () => {
  const src = (await Deno.readTextFile(new URL("../src/app.js", import.meta.url))).replaceAll("\r\n", "\n");
  const use = src.indexOf("openableUrl("), fetchAt = src.indexOf("await fetch(url", use);
  assert(src.includes('import { openableUrl } from "../../shared/src/openurl.js";'), "app.js does not import openableUrl");
  assert(use > 0 && fetchAt > use, "app.js must pass options.open through openableUrl before fetch");
});

Deno.test("a refused link stays visible: the start-up messages do not overwrite it", async () => {
  const src = (await Deno.readTextFile(new URL("../src/app.js", import.meta.url))).replaceAll("\r\n", "\n");
  assert(src.includes("if (openError) status(openError, true);"), "app.js must show the refusal after the default start-up status");
});
