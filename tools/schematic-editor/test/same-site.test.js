// F25.2: the DigitalJS include (_includes/digitaljs.html) loads a circuit named by data-circuit only from the same site.
// The check is the function between the "same-site:begin" and "same-site:end" markers in that file; this runs that text.

import { assert, assertEquals } from "./helpers.js";

const html = await Deno.readTextFile(new URL("../../../_includes/digitaljs.html", import.meta.url));
const code = (html.match(/\/\/ same-site:begin\n([\s\S]*?)\/\/ same-site:end/) ?? [])[1];

Deno.test("the include marks its same-site check and uses it before fetching", () => {
  assert(code, "no same-site:begin/end block in _includes/digitaljs.html");
  const use = html.indexOf("sameSiteUrl(el.dataset.circuit)"), fetchAt = html.indexOf("fetch(");
  assert(use > 0 && fetchAt > use, "data-circuit must pass through sameSiteUrl before fetch");
});

const check = (page) => new Function("location", code + "\nreturn sameSiteUrl;")(new URL(page));
const at = check("https://blakeaaronroberts.github.io/explorations/kmaps/");

Deno.test("same-site files are allowed, relative or absolute", () => {
  assertEquals(at("circuit.json")?.href, "https://blakeaaronroberts.github.io/explorations/kmaps/circuit.json");
  assertEquals(at("../x/y.json")?.pathname, "/explorations/x/y.json");
  assertEquals(at("/assets/c.json")?.pathname, "/assets/c.json");
  assertEquals(at("https://blakeaaronroberts.github.io/a.json")?.pathname, "/a.json");
});

Deno.test("other sites, other schemes and unreadable values are refused", () => {
  for (const bad of ["https://example.com/c.json", "//example.com/c.json", "http://blakeaaronroberts.github.io/c.json",
    "https://blakeaaronroberts.github.io.evil.com/c.json", "https://user@example.com/c.json", "data:application/json,{}",
    "javascript:alert(1)", "blob:https://blakeaaronroberts.github.io/1234", "file:///etc/passwd", "", "http://[bad"]) {
    assertEquals(at(bad), null, bad);
  }
  assertEquals(check("http://localhost:4200/x/")("c.json")?.pathname, "/x/c.json", "a local preview is its own site");
});
