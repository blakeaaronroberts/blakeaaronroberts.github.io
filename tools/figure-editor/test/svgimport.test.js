// F12: SVG import. Our own exports carry their circuit; any other SVG becomes a sanitised backdrop.

import { addElement, addWire, newDoc, parse, serialize } from "../src/doc.js";
import { BLOCK } from "../src/block.js";
import { exportSvg } from "../src/export.js";
import { buildFullAdderLevels } from "../examples/full-adder-levels.js";
import { buildClaChevron } from "../examples/cla-chevron.js";
import { buildRippleCarryBlocks } from "../examples/ripple-carry-blocks.js";
import { circuitFromSvg, metadataOf, sanitizeSvg } from "../src/svgimport.js";
import { assert, assertEquals, assertThrows, pack, typeset } from "./helpers.js";

Deno.test("an exported SVG carries its circuit, and the circuit comes back byte for byte", () => {
  for (const build of [buildFullAdderLevels, buildClaChevron, buildRippleCarryBlocks]) {
    const doc = build(pack);
    const svg = exportSvg(doc, pack, { typeset });
    const text = circuitFromSvg(svg);
    assert(text !== null, "the metadata is found");
    assertEquals(text, serialize(doc, pack).trim());
    assertEquals(serialize(parse(text).doc, pack), serialize(doc, pack));          // opens, saves again, identical
  }
});

Deno.test("the embedded text survives XML escaping: &, <, >, quotes and TeX in labels", () => {
  let doc = addElement(newDoc(), pack, BLOCK, [0, 0], 0, { shape: "rect", w: 4, h: 4, pins: { left: [{ name: "A", label: "$A_1$" }] } }).doc;
  doc.title = 'He said "hi" & <left>';
  const svg = exportSvg(doc, pack, { typeset: new Map([...typeset, ["A_1", typeset.get("A")]]) });
  assert(!svg.includes("<left>"), "the title is escaped in the metadata");
  assertEquals(circuitFromSvg(svg), serialize(doc, pack).trim());
  assert(/^  <metadata>/m.test(svg));
});

Deno.test("an SVG that is not ours has no circuit", () => {
  assertEquals(circuitFromSvg('<svg xmlns="http://www.w3.org/2000/svg"><metadata>hello</metadata></svg>'), null);
  assertEquals(circuitFromSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'), null);
  assertEquals(metadataOf("{}"), "  <metadata>{}</metadata>");
});

const dirty = `<?xml version="1.0"?>
<!DOCTYPE svg [<!ENTITY boom "&boom;&boom;"> <!ENTITY x SYSTEM "file:///etc/passwd">]>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:ink="http://ink" width="10cm" height="5cm" viewBox="0 0 100 50" onload="alert(1)">
  <script>alert(2)</script>
  <style>@import url(http://evil.example/x.css); rect { fill: url(http://evil.example/p) }</style>
  <foreignObject><iframe src="http://evil.example"/></foreignObject>
  <image href="http://evil.example/a.png" width="10" height="10"/>
  <image xlink:href="data:image/png;base64,AAAA"/>
  <a xlink:href="javascript:alert(3)"><rect id="r1" x="1" y="1" width="20" height="10" fill="red" onclick="alert(4)" ink:label="x"/></a>
  <use href="http://evil.example/s.svg#a"/>
  <use xlink:href="#r1" x="30"/>
  <rect width="5" height="5" style="fill:blue;background:url(http://evil.example/b);stroke:green"/>
  <path d="M0 0 L10 10" stroke="url(#grad)" fill="url(http://evil.example/g)"/>
  <animate attributeName="href" to="http://evil.example"/>
  <set attributeName="href" to="javascript:alert(5)"/>
  <filter id="f"><feImage href="http://evil.example/i.png"/></filter>
  <text x="2" y="3">Hello &amp; <![CDATA[<b>not markup</b>]]></text>
  <circle r="3" ink:foo="1" xml:base="http://evil.example/"/>
</svg>`;

Deno.test("sanitising removes scripts, handlers, external references, foreign content and fetching CSS", () => {
  const { svg } = sanitizeSvg(dirty);
  for (const bad of ["script", "alert", "onload", "onclick", "evil", "foreignObject", "iframe", "<image", "<style", "@import", "javascript:", "data:", "<animate", "<set", "<filter", "feImage", "DOCTYPE", "ENTITY", "passwd", "ink:", "xml:base"]) {
    assert(!svg.includes(bad), `"${bad}" is gone from ${svg}`);
  }
  assert(!/(?:href|src)="(?!#)/.test(svg), "every remaining reference points inside the file");
  assert(!/<!\[CDATA|<b>/.test(svg), "text is escaped, never markup");
});

Deno.test("sanitising keeps the drawing: shapes, inside references, local urls, safe style, text", () => {
  const { svg } = sanitizeSvg(dirty);
  assert(svg.includes('<rect id="r1" x="1" y="1" width="20" height="10" fill="red"/>'), svg);   // unwrapped from the <a>
  assert(svg.includes('<use href="#r1" x="30"/>'), svg);
  assert(svg.includes('style="fill:blue;stroke:green"'), svg);                                      // the fetching declaration alone is removed
  assert(svg.includes('stroke="url(#grad)"'), svg);
  assert(svg.includes("<path d=\"M0 0 L10 10\" stroke=\"url(#grad)\"/>"), svg);                    // the external fill is dropped
  assert(svg.includes("<text x=\"2\" y=\"3\">Hello &amp; &lt;b&gt;not markup&lt;/b&gt;</text>"), svg);
  assert(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"'), svg);
});

Deno.test("an entity bomb or an external entity is not expanded", () => {
  const bomb = '<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]><svg xmlns="http://www.w3.org/2000/svg" width="1cm" height="1cm"><text>&b;&a;</text></svg>';
  const { svg } = sanitizeSvg(bomb);
  assert(svg.length < 400, `${svg.length} bytes`);
  assert(!svg.includes("aaaa"));
});

Deno.test("the backdrop's natural size is read in modules from width and height, or from the viewBox", () => {
  const size = (head) => { const r = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" ${head}><rect width="1" height="1"/></svg>`); return [+r.width.toFixed(4), +r.height.toFixed(4)]; };
  assertEquals(size('width="10cm" height="5cm" viewBox="0 0 10 5"'), [20, 10]);        // a module is 0.5 cm
  assertEquals(size('width="1in" height="1in"'), [5.08, 5.08]);
  assertEquals(size('width="100mm" height="50mm" viewBox="0 0 1 1"'), [20, 10]);
  assertEquals(size('viewBox="0 0 192 96"'), [+(192 * 2.54 / 96 / 0.5).toFixed(4), +(96 * 2.54 / 96 / 0.5).toFixed(4)]);   // user units are px
  assertThrows(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'), /no size/);
  assertThrows(() => sanitizeSvg("<html><body/></html>"), /not an SVG/);
  assertThrows(() => sanitizeSvg(""), /empty/);
  assertThrows(() => sanitizeSvg("x".repeat(5.1e6)), /over the 5 MB/);
});

Deno.test("an SVG with a prefixed root and nested svg still comes through; the file is one well-formed svg", () => {
  const { svg } = sanitizeSvg('<svg:svg xmlns:svg="http://www.w3.org/2000/svg" width="2cm" height="2cm"><svg:g><svg:circle r="1"/></svg:g></svg:svg>');
  assert(svg.includes("<g><circle r=\"1\"/></g>"), svg);
});
