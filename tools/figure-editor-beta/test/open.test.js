// F7: opening a file. A bad file is refused with a reason that names what is wrong, before anything changes.

import { parse, serialize } from "../src/doc.js";
import { assert, assertEquals, assertThrows, fixture, pack } from "./helpers.js";

const good = { schema: "circuit/0.2", id: "x", grid_cm: 0.25, elements: [{ id: "a1", type: "and_gate", at: [0, 0] }] };
const refused = (obj, pattern, why) => assertThrows(() => parse(typeof obj === "string" ? obj : JSON.stringify(obj)), pattern, why);

Deno.test("a file that is not a circuit is refused with a reason that names the problem", () => {
  refused("this is not json", /not JSON/, "text");
  refused("", /not JSON/, "empty file");
  refused("[1, 2, 3]", /not a circuit file/, "a JSON list");
  refused("42", /not a circuit file/, "a bare number");
  refused("null", /not a circuit file/, "null");
  refused({ ...good, schema: "circuit/0.1" }, /schema is "circuit\/0.1"/, "old schema");
  refused({ ...good, grid_cm: 0.5 }, /grid_cm is 0.5/, "wrong grid");
  refused({ ...good, elements: [{ id: "a1", type: "and_gate", at: [1.5, 2] }] }, /whole grid steps/, "off-grid point");
  refused({ ...good, elements: [good.elements[0], good.elements[0]] }, /used twice/, "duplicate id");
  refused({ ...good, bogus: 1 }, /unknown field "bogus"/, "unknown field");
  refused({ ...good, wires: [{ id: "w1", from: "a1.Y", to: "nowhere nothing" }] }, /bad end/, "bad wire end");
  refused({ ...good, wires: "none" }, /must be a list/, "wires not a list");
});

Deno.test("opening a bad file throws before it returns a document, so the caller still holds the old one", () => {
  const current = parse(JSON.stringify(good)).doc;
  const before = JSON.stringify(current);
  let result = null;
  try { result = parse("{ broken"); } catch { /* refused */ }
  assertEquals(result, null);
  assertEquals(JSON.stringify(current), before);
});

Deno.test("a saved figure opens as the same figure (save, open, save is byte-identical), including a dragged wire", async () => {
  const text = await fixture("every-field.json").catch(() => null);
  assert(text !== null, "fixture every-field.json is present");
  const once = serialize(parse(text).doc, pack);
  assertEquals(serialize(parse(once).doc, pack), once);
});
