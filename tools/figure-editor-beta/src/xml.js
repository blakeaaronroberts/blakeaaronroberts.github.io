// A small XML reader and writer for the symbol pack's SVGs. No DOM, so the core
// (and the export) runs in tests exactly as in the browser. It handles what the
// toolbox exporter writes: elements, attributes, comments, the XML declaration.
// Text content is refused except in <title>, <desc> and <metadata> (the exported circuit) (and in whatever `textTags` adds): the pack carries text as outlined paths.

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENT[e]);
const encode = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Parse to {tag, attrs: [[name, value], ...], children: [...]}; returns the root element. */
export function parseXml(text, textTags = []) {
  let i = 0;
  const root = { tag: "#root", attrs: [], children: [] };
  const stack = [root];
  const fail = (msg) => { throw new Error(`XML: ${msg} at ${i}`); };
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    const chunk = text.slice(i, lt < 0 ? text.length : lt);
    if (chunk.trim()) {
      const open = stack[stack.length - 1];
      if (open.tag !== "title" && open.tag !== "desc" && open.tag !== "metadata" && !textTags.includes(open.tag)) fail(`unexpected text "${chunk.trim().slice(0, 20)}"`);
      open.children.push({ tag: "#text", text: decode(chunk), attrs: [], children: [] });
    }
    if (lt < 0) break;
    i = lt;
    if (text.startsWith("<?", i)) { i = text.indexOf("?>", i) + 2; continue; }
    if (text.startsWith("<!--", i)) { i = text.indexOf("-->", i) + 3; continue; }
    if (text.startsWith("<!", i)) fail("DOCTYPE or CDATA not supported");
    if (text.startsWith("</", i)) {
      const end = text.indexOf(">", i);
      const tag = text.slice(i + 2, end).trim();
      const open = stack.pop();
      if (!open || open.tag !== tag) fail(`</${tag}> closes <${open?.tag}>`);
      i = end + 1;
      continue;
    }
    const m = /^<([A-Za-z_][\w:.-]*)/.exec(text.slice(i));
    if (!m) fail("bad tag");
    const node = { tag: m[1], attrs: [], children: [] };
    i += m[0].length;
    const attr = /\s*([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/y;
    for (;;) {
      attr.lastIndex = i;
      const a = attr.exec(text);
      if (!a) break;
      node.attrs.push([a[1], decode(a[3] ?? a[4])]);
      i = attr.lastIndex;
    }
    while (/\s/.test(text[i])) i++;
    stack[stack.length - 1].children.push(node);
    if (text.startsWith("/>", i)) { i += 2; continue; }
    if (text[i] !== ">") fail(`bad attribute in <${node.tag}>`);
    i++;
    stack.push(node);
  }
  if (stack.length !== 1) fail(`<${stack[stack.length - 1].tag}> not closed`);
  const els = root.children;
  if (els.length !== 1) fail("expected one root element");
  return els[0];
}

export const attr = (node, name) => node.attrs.find(([k]) => k === name)?.[1];

export function writeXml(node, indent = "") {
  if (node.tag === "#text") return `${indent}${encode(node.text.trim())}`;
  const a =node.attrs.map(([k, v]) => ` ${k}="${encode(v)}"`).join("");
  if (!node.children.length) return `${indent}<${node.tag}${a}/>`;
  const inner = node.children.map((c) => writeXml(c, indent + "  ")).join("\n");
  return `${indent}<${node.tag}${a}>\n${inner}\n${indent}</${node.tag}>`;
}

export function walk(node, fn) {
  fn(node);
  node.children.forEach((c) => walk(c, fn));
}
