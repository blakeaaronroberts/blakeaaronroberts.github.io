// F25.4: the WaveDrom "lecture" skin uses the figure fonts (VISION.md section 7) and carries WaveDrom's MIT notice,
// because the file is a restyled copy of WaveDrom's default skin.

import { assert } from "./helpers.js";

const src = await Deno.readTextFile(new URL("../../../assets/wavedrom/lecture.js", import.meta.url));

Deno.test("the skin's text is STIX Two Text, its mono role is Fira Mono, and no other family is named", () => {
  const families = [...src.matchAll(/font-family:([^};"]*)/g)].map((m) => m[1]);
  assert(families.length >= 2, "expected a text rule and a mono rule, found " + families.length);
  assert(families.every((f) => /STIX Two Text|Fira Mono/.test(f)), families.join(" | "));
  assert(!/Cambria|Helvetica|Arial/.test(src), "an old font family is still named");
  assert(/\.mono\{[^}]*Fira Mono/.test(src), "no .mono rule with Fira Mono");
});

Deno.test("the third-party notice is the first thing in the file: WaveDrom's MIT licence, copyright line and permission text", () => {
  const head = src.split("\n").slice(0, 30).join("\n");
  assert(/MIT License/i.test(head) && /Copyright \(c\) 2011-2026 Aliaksei Chapyzhenka/.test(head), "licence or copyright line missing");
  assert(/Permission is hereby granted, free of charge/.test(head) && /THE SOFTWARE IS PROVIDED "AS IS"/.test(head), "licence text incomplete");
  assert(/WaveDrom 3\.7\.0/.test(head) && /restyled/i.test(head), "does not say what the file is derived from");
});
