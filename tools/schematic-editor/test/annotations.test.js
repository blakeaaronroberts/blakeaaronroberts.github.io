// R1.4 (circuit-model C13.5, tag model-v0.7.0): editor data goes in circuit/0.3 `annotations`, one object per tool; the
// file's `groups` are buses again; old files (circuit/0.2, and the beta's draft circuit/0.3 with editor data in groups)
// still open with nothing lost. What the editor writes passes circuit-model's own validator and schema.

import { annotationsFor, busesOf, editorDataOf } from "../src/annotations.js";
import { parse, serialize } from "../src/doc.js";
import { captureFrame, setWireLabels } from "../src/levelframes.js";
import { buildClaChevron } from "../examples/cla-chevron.js";
import { checkCircuit } from "../../shared/test/model/formats.mjs";
import { assert, assertEquals, pack } from "./helpers.js";

const schema = JSON.parse(await Deno.readTextFile(new URL("../../shared/test/model/circuit.schema.json", import.meta.url)));
const valid = (text) => { const r = checkCircuit(schema, JSON.parse(text)); return Array.isArray(r) ? r : r?.errors ?? []; };

Deno.test("editor data is written to circuit/0.3 annotations, one object per tool; it reads back the same", () => {
  let doc = captureFrame(buildClaChevron(pack), "step");
  doc = setWireLabels(doc, [doc.wires[0].id], "CLK");
  doc = { ...doc, groups: { ...doc.groups, slide: { format: "16:9", headerCm: 3, footerCm: 1, layout: "over", splits: {}, regions: [] } } };
  const text = serialize(doc, pack), raw = JSON.parse(text);
  assertEquals(raw.schema, "circuit/0.3");
  assertEquals(raw.groups, undefined);
  assertEquals(raw.annotations["schematic-editor"].wire_labels[doc.wires[0].id], "CLK");
  assert(raw.annotations["figure-editor"].slide, "the slide is the Figure Editor's");
  assertEquals(serialize(parse(text).doc, pack), text);
});

Deno.test("what the editor writes passes circuit-model's validator (model-v0.7.0)", () => {
  const plain = buildClaChevron(pack);
  const withData = setWireLabels(captureFrame(plain, "a"), [plain.wires[0].id], "CLK");
  for (const d of [plain, withData]) assertEquals(valid(serialize(d, pack)), [], d.id);
});

Deno.test("old files: circuit/0.2 and the beta's draft circuit/0.3 kept editor data in groups; buses stay buses", () => {
  const old = { schema: "circuit/0.3", groups: { wire_labels: { w1: "A" }, frames: [{ name: "Frame 0", levels: {} }], DATA: ["A", "B"] } };
  assertEquals(Object.keys(editorDataOf(old)).sort(), ["frames", "wire_labels"]);
  assertEquals(busesOf(old), { DATA: ["A", "B"] });
  const now = { schema: "circuit/0.3", groups: { DATA: ["A"] }, annotations: { "schematic-editor": { wire_labels: { w1: "A" } } } };
  assertEquals(editorDataOf(now), { wire_labels: { w1: "A" } });
  assertEquals(busesOf(now), { DATA: ["A"] });
  assertEquals(editorDataOf({ schema: "circuit/0.2" }), {});
  assertEquals(annotationsFor({ frames: [], slide: {} }), { "schematic-editor": { frames: [] }, "figure-editor": { slide: {} } });
});
