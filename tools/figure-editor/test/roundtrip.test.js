// Save, load and save again gives byte-identical files.

import { netsMatch, parse, serialize } from "../src/doc.js";
import { buildFullAdder } from "../examples/full-adder.js";
import { assert, assertEquals, assertThrows, fixture, pack } from "./helpers.js";

const bytes = (s) => new TextEncoder().encode(s);
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function roundTrip(text) {
  const first = serialize(parse(text).doc, pack);
  const second = serialize(parse(first).doc, pack);
  assert(sameBytes(bytes(first), bytes(second)), `save, load, save changed the file:\n${first}\n---\n${second}`);
  return first;
}

Deno.test("the sample figure: save, load, save is byte-identical", () => {
  const saved = serialize(buildFullAdder(pack), pack);
  assertEquals(roundTrip(saved), saved);
});

Deno.test("every schema field survives: title, ports, labels, groups, params, rotation, mirror, via, first", async () => {
  const text = await fixture("every-field.json");
  const saved = roundTrip(text);
  const { doc } = parse(saved);
  assertEquals(doc.title, "Every field");
  assertEquals(doc.elements.map((e) => [e.rotation, e.mirror, e.label, e.params]),
    [[90, undefined, "$G_1$", { delay: { Y: 2 } }], [undefined, true, undefined, undefined]]);
  assertEquals(doc.wires[0].first, "v");
  assertEquals(doc.groups, { bus: ["A", "B"] });
  assertEquals(doc.labels, [{ text: "A note", at: [0, 10], side: "up" }]);
});

Deno.test("nets are derived on save; a file whose nets disagree with its drawing is detected", async () => {
  const { doc, nets } = parse(await fixture("every-field.json"));
  const derived = parse(serialize(doc, pack)).nets;
  assert(!netsMatch(nets, derived), "the fixture's nets are deliberately wrong");
  assert(netsMatch(derived, parse(serialize(doc, pack)).nets));
});

Deno.test("saving the same document twice gives the same bytes", () => {
  const doc = buildFullAdder(pack);
  assertEquals(serialize(doc, pack), serialize(structuredClone(doc), pack));
});

Deno.test("files that are not circuit/0.2 are refused with a reason", () => {
  assertThrows(() => parse("{"), /not JSON/);
  assertThrows(() => parse('{"schema":"circuit/0.1","id":"x","grid_cm":0.25,"elements":[],"nets":{}}'), /circuit\/0\.2/);
  assertThrows(() => parse('{"schema":"circuit/0.2","id":"x","grid_cm":0.25,"elements":[{"id":"a","type":"and_gate","at":[0.5,0]}],"nets":{}}'), /whole grid steps/);
  assertThrows(() => parse('{"schema":"circuit/0.2","id":"x","grid_cm":0.25,"elements":[],"nets":{},"extra":1}'), /unknown field/);
});
