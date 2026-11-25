// Run the truth table tests with Quarto's bundled Deno:  quarto run tools/logic/truth-table/test/run.js
// The tests read the analyser's pinned model copy (../../analyze/model), so the whole tools/logic folder is readable.
const here = new URL(".", import.meta.url), root = new URL("../../", here);
const path = (u) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, "$1");
const r = await new Deno.Command(Deno.execPath(), {
  args: ["test", "--no-config", "--no-lock", "--no-remote", `--allow-read=${path(root)}`, path(here)],
  stdout: "inherit", stderr: "inherit",
}).output();
Deno.exit(r.code);
