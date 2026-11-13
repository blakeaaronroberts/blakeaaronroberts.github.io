// Browser checks for the beta editor, in headless Chrome against the rendered _site folder.
//
//   quarto render tools/figure-editor-beta/index.qmd
//   quarto run tools/figure-editor-beta/test/browser/check.js [dark] [wires] [saves] [--out <dir>] [--site <dir>]
//
// Exits non-zero if any check fails. Screenshots go to --out (default: the system temp folder).

import { launch, serve } from "./cdp.js";
import { scenarios } from "./scenarios.js";

const args = Deno.args;
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const site = opt("--site", "_site"), out = opt("--out", Deno.makeTempDirSync({ prefix: "fe-shots-" }));
const names = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const wanted = names.length ? names : Object.keys(scenarios);

const server = serve(site, 4177);
let failed = 0;
for (const name of wanted) {
  const run = scenarios[name];
  if (!run) { console.log(`unknown scenario ${name}`); failed++; continue; }
  console.log(`== ${name}`);
  try {
    const results = await run({ launch, url: "http://127.0.0.1:4177/tools/figure-editor-beta/", out });
    for (const [ok, msg] of results) { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failed++; }
  } catch (e) { console.log(`FAIL  ${name} crashed: ${e.stack ?? e.message}`); failed++; }
}
await server.shutdown();
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll browser checks passed");
Deno.exit(failed ? 1 : 0);
