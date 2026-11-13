// Units and the element transform: mirror (x negated in the element's own frame) before rotation.

import { fromSvg, orient, pinOf, svgTransform, toSvg } from "../src/geometry.js";
import { addElement, mirrorElements, newDoc } from "../src/doc.js";
import { assertEquals, mirrorablePack, pack } from "./helpers.js";

Deno.test("grid steps and SVG modules convert both ways in one place", () => {
  assertEquals(toSvg([4, -6]), [2, 3]);
  assertEquals(fromSvg(toSvg([-5, 7])), [-5, 7]);
});

Deno.test("rotation is counter-clockwise in grid steps, y up", () => {
  assertEquals([0, 90, 180, 270].map((r) => orient([2, 1], r)), [[2, 1], [-1, 2], [-2, -1], [1, -2]]);
});

Deno.test("mirror is applied before rotation, and pins mirror with the element", () => {
  const def = pack.def("and_gate");                 // A: tip [-4, 1], left
  const el = { id: "g", type: "and_gate", at: [10, 0], rotation: 90, mirror: true };
  // mirror: [4, 1] pointing right; then rotate 90: [-1, 4] pointing up; then +at
  assertEquals(pinOf(el, def, "A"), { at: [9, 4], dir: [0, 1] });
  // (rotating first and then mirroring would give [11, -4])
  assertEquals(svgTransform(el), "translate(5 0) rotate(-90) scale(-1 1)");
});

Deno.test("mirror works on elements the pack marks mirrorable, and is refused on the rest", () => {
  for (const type of pack.types()) {
    const { doc, id } = addElement(newDoc(), pack, type, [0, 0]);
    const r = mirrorElements(doc, pack, [id]);
    if (pack.def(type).mirrorable === true) {
      assertEquals(r.refused, [], type);
      assertEquals(r.doc.elements[0].mirror, true, type);
    } else {
      assertEquals(r.refused, [id], type);
      assertEquals(r.doc.elements[0].mirror, undefined, type);
    }
  }
});

Deno.test("a mirrored element's pins mirror with it: left and right swap, up and down stay", () => {
  const def = pack.def("and_gate");
  const el = { id: "g", type: "and_gate", at: [0, 0], mirror: true };
  assertEquals(pinOf(el, def, "A"), { at: [4, 1], dir: [1, 0] });    // was [-4, 1] pointing left
  assertEquals(pinOf(el, def, "Y"), { at: [-5, 0], dir: [-1, 0] });  // was [5, 0] pointing right
  const vdd = { id: "v", type: "vdd", at: [0, 0], mirror: true };
  assertEquals(pinOf(vdd, pack.def("vdd"), "1").dir, [0, -1]);        // down stays down
});

Deno.test("an element marked mirrorable toggles mirror", () => {
  const { doc, id } = addElement(newDoc(), mirrorablePack, "and_gate", [0, 0]);
  const once = mirrorElements(doc, mirrorablePack, [id]).doc;
  assertEquals(once.elements[0].mirror, true);
  assertEquals(mirrorElements(once, mirrorablePack, [id]).doc.elements[0].mirror, undefined);
});
