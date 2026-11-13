// Save, load and save again gives byte-identical files.

import { addWire, deriveNets, netsMatch, newDoc, parse, serialize, setLevel } from "../src/doc.js";
import { buildFullAdderLevels } from "../examples/full-adder-levels.js";
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
  assertEquals(doc.wires.map((w) => w.level), [undefined, "X"]);
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

// ---- wire levels (schema: wire.level, one of "0" "1" "X" "Z", from circuit-model 1b63797) ----------------

Deno.test("levels are saved on the wire, after its other fields, and come back as they were", () => {
  const { doc } = parse(serialize(buildFullAdderLevels(pack), pack));
  assertEquals(doc.wires.filter((w) => w.level === "1").length > 0 && doc.wires.filter((w) => w.level === "0").length > 0, true);
  const text = serialize(doc, pack);
  assert(text.includes('{ "id": "w1", "from": "xor1.A", "to": "and3.A", "via": [[-30, 25], [-30, -11]], "level": "1" }'), text);
  assert(text.includes('{ "id": "w2", "from": "xor1.B", "to": "and2.A", "via": [[-26, 23], [-26, 1]], "level": "0" }'), text);
});

Deno.test("the labelled sample: save, load, save is byte-identical, with its levels, labels and ports", () => {
  const first = roundTrip(serialize(buildFullAdderLevels(pack), pack));
  const { doc } = parse(first);
  assertEquals(doc.ports.map((p) => [p.id, p.label, p.side]), [
    ["A", "$A$", "left"], ["B", "$B$", "left"], ["Cin", "$C_{\\mathrm{in}}$", "left"], ["S", "$S$", "right"], ["Cout", "$C_{\\mathrm{out}}$", "right"],
  ]);
  assertEquals(doc.labels, [{ text: "$A \\oplus B$", at: [8, 24], side: "up" }]);
  assertEquals(doc.wires.every((w) => w.level === "0" || w.level === "1"), true);
});

Deno.test("all four levels survive, and a wire with no level saves without the field", () => {
  let doc = addWire(newDoc(), pack, { kind: "point", at: [0, 0] }, { kind: "point", at: [6, 0] }).doc;
  for (const [i, level] of ["0", "1", "X", "Z"].entries()) {
    doc = addWire(doc, pack, { kind: "point", at: [0, 4 * (i + 1)] }, { kind: "point", at: [6, 4 * (i + 1)] }).doc;
    doc = setLevel(doc, [`w${i + 2}`], level);
  }
  const text = roundTrip(serialize(doc, pack));
  assertEquals(parse(text).doc.wires.map((w) => w.level), [undefined, "0", "1", "X", "Z"]);
  assert(text.includes('{ "id": "w1", "from": [0, 0], "to": [6, 0] }'), "no level, no field");
  assert(!text.includes('"level": null'));
});

Deno.test("a level never changes the nets", () => {
  const withLevels = buildFullAdderLevels(pack);
  const bare = structuredClone(withLevels);
  for (const w of bare.wires) delete w.level;
  assertEquals(deriveNets(withLevels, pack), deriveNets(bare, pack));
});

Deno.test("a level that is not \"0\", \"1\", \"X\" or \"Z\" is refused on load", () => {
  const file = (level) => JSON.stringify({
    schema: "circuit/0.2", id: "x", grid_cm: 0.25, elements: [], nets: {}, wires: [{ id: "w1", from: [0, 0], to: [4, 0], level }],
  });
  parse(file("X"));
  for (const bad of ["2", "high", "x", 1, 0, null, true]) assertThrows(() => parse(file(bad)), /level must be/, JSON.stringify(bad));
});

Deno.test("the committed sample file is what the sample builder makes", async () => {
  // Git may check the file out with CRLF (core.autocrlf on Windows); the content is what counts.
  const committed = (await Deno.readTextFile(new URL("../examples/full-adder-levels.json", import.meta.url))).replace(/\r\n/g, "\n");
  assertEquals(committed, serialize(buildFullAdderLevels(pack), pack));
});
