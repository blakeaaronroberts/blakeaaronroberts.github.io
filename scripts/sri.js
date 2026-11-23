// Integrity hashes on third-party scripts.
//   quarto run scripts/sri.js              add integrity + crossorigin to _site pages (Quarto post-render step)
//   quarto run scripts/sri.js --check      fail if an external <script src> in _site lacks a pinned hash
//   quarto run scripts/sri.js --hash <url> print the SHA-384 integrity value of a file
// Hashes live in scripts/third-party.json. Stylesheets (Google Fonts) cannot be pinned: the service varies its CSS per
// browser. MathJax's own dynamic font files load from jsDelivr after the pinned bundle and carry no hash either.

const cfg = JSON.parse(await Deno.readTextFile(new URL("third-party.json", import.meta.url)));
const table = cfg.scripts, blocked = cfg.blocked ?? [];   // blocked: scripts Quarto adds that cannot be pinned (the polyfill service answers per browser); removed after render
const root = new URL("../_site/", import.meta.url);
const dirPath = decodeURIComponent(root.pathname).replace(/^\/([A-Za-z]:)/, "$1");

if (Deno.args[0] === "--hash") {
  const bytes = new Uint8Array(await (await fetch(Deno.args[1])).arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-384", bytes));
  console.log("sha384-" + btoa(String.fromCharCode(...digest)));
  Deno.exit(0);
}
const check = Deno.args[0] === "--check";

async function* htmlFiles(dir) {
  for await (const e of Deno.readDir(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) yield* htmlFiles(p); else if (e.name.endsWith(".html")) yield p;
  }
}

const SCRIPT = /<script\b[^>]*\bsrc=(["'])(https?:\/\/[^"']+)\1[^>]*>(<\/script>)?/gi;
let patched = 0, problems = [];
for await (const file of htmlFiles(dirPath.replace(/\/$/, ""))) {
  const text = await Deno.readTextFile(file);
  const out = text.replace(SCRIPT, (tag, _q, url, close = "") => {
    if (blocked.includes(url.replace(/&amp;/g, "&"))) return check ? (problems.push(`${file}: ${url} is blocked`), tag) : "";
    const hash = table[url];
    if (!hash) { problems.push(`${file}: ${url} has no pinned hash`); return tag; }
    const has = /\bintegrity=/i.test(tag);
    if (check) { if (!has || !tag.includes(hash)) problems.push(`${file}: ${url} lacks its integrity attribute`); return tag; }
    if (has) return tag;
    patched++;
    return tag.slice(0, tag.length - close.length).replace(/\s*>$/, ` integrity="${hash}" crossorigin="anonymous">`) + close;
  });
  if (!check && out !== text) await Deno.writeTextFile(file, out);
}
if (problems.length) { console.error(problems.join("\n")); Deno.exit(1); }
console.log(check ? "sri: every external script is pinned" : `sri: ${patched} script tag(s) pinned`);
