// R1 (Blake's answer 8): one place decides where editor data sits in a circuit file.

import { editorDataOf, FILE_KEY, hasEditorData } from "../src/annotations.js";
import { parse, serialize } from "../src/doc.js";
import { captureFrame, setWireLabels } from "../src/levelframes.js";
import { buildClaChevron } from "../examples/cla-chevron.js";
import { assert, assertEquals, pack } from "./helpers.js";

Deno.test("editor data is read from its place in the file, and written back to the same place", () => {
  let doc = captureFrame(buildClaChevron(pack), "step");
  doc = setWireLabels(doc, [doc.wires[0].id], "CLK");
  const text = serialize(doc, pack), raw = JSON.parse(text);
  assert(raw[FILE_KEY]?.wire_labels, `editor data written under "${FILE_KEY}"`);
  assertEquals(editorDataOf(raw).wire_labels[doc.wires[0].id], "CLK");
  assertEquals(serialize(parse(text).doc, pack), text);
});

Deno.test("no editor data: an empty object; old place still read", () => {
  assertEquals(editorDataOf({ schema: "circuit/0.2" }), {});
  assert(!hasEditorData({ schema: "circuit/0.2" }));
  assertEquals(editorDataOf({ groups: { frames: [1] } }).frames, [1]);
});
