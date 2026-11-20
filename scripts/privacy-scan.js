// Privacy scan (CLAUDE.md, Privacy). Fails if tracked files or the rendered site hold what must never be published:
// CV files, phone numbers, email addresses Blake has not put on the site himself, or GPAs.
//   quarto run scripts/privacy-scan.js            scan git-tracked files (and _site if it exists)
// Allowed emails go in scripts/privacy-allow.json (Blake decides; empty by default). Output names the file and the
// kind of match only, never the matched text.

const root = new URL("../", import.meta.url);
const base = decodeURIComponent(root.pathname).replace(/^\/([A-Za-z]:)/, "$1").replace(/\/$/, "");
const cfg = JSON.parse(await Deno.readTextFile(new URL("privacy-allow.json", import.meta.url)));
const allow = cfg.emails.map((e) => e.toLowerCase()), vendored = cfg.vendored ?? [];

const tracked = new TextDecoder().decode((await new Deno.Command("git", { args: ["-C", base, "ls-files", "-z"], stdout: "piped" }).output()).stdout).split("\0").filter(Boolean);

const TEXT = /\.(qmd|md|html|htm|yml|yaml|json|js|mjs|css|scss|svg|txt|csl|xml|tex|bib)$/i;
const rules = [
  ["phone number", /(?<![\d.])(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}\b(?![\d.])/],
  ["GPA", /\bGPA\b[^\n]{0,24}\d\.\d/i],
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// Package and scope names such as @types/node or user@host in code are not addresses; only mail-like TLDs count and
// image names like icon@2x.png are skipped.
const NOT_MAIL = /\.(png|jpe?g|gif|svg|webp|js|mjs|css|json|map|woff2?)$/i;

const problems = [];
const note = (file, kind) => problems.push(`${file}: ${kind}`);

for (const f of tracked) if (/_CV_.*\.pdf$/i.test(f)) note(f, "CV file is tracked");

async function* walk(dir) {
  for await (const e of Deno.readDir(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) yield* walk(p); else yield p;
  }
}
const files = tracked.map((f) => `${base}/${f}`);
let site = false;
try { for await (const p of walk(`${base}/_site`)) { files.push(p); site = true; if (/_CV_.*\.pdf$/i.test(p)) note(p.slice(base.length + 1), "CV file in rendered site"); } } catch { /* not rendered */ }

for (const path of files) {
  const rel = path.slice(base.length + 1);
  if (!TEXT.test(rel) || /^tools\/shared\/(src\/sim|test\/model)\//.test(rel) || rel === "scripts/privacy-scan.js") continue;
  let text; try { text = await Deno.readTextFile(path); } catch { continue; }
  for (const [kind, re] of rules) if (re.test(text)) note(rel, kind);
  for (const m of vendored.some((v) => rel.startsWith(v)) ? [] : text.match(EMAIL) ?? []) {
    if (NOT_MAIL.test(m) || /@\d+x\./.test(m)) continue;
    if (!allow.includes(m.toLowerCase())) { note(rel, "email address not on the allow list"); break; }
  }
}
if (problems.length) { console.error(`privacy scan: ${problems.length} problem(s)\n` + [...new Set(problems)].join("\n")); Deno.exit(1); }
console.log(`privacy scan: clean (${tracked.length} tracked files${site ? ", rendered site" : ", no rendered site"})`);
