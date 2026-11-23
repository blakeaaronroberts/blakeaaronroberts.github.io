// Run the analyser tests with Quarto's bundled Deno:  quarto run tools/logic/analyze/test/run.js
const here = new URL(".", import.meta.url), root = new URL("../", here);
const path = (u) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, "$1");
const r = await new Deno.Command(Deno.execPath(), {
  args: ["test", "--no-config", "--no-lock", "--no-remote", `--allow-read=${path(root)}`, path(here)],
  stdout: "inherit", stderr: "inherit",
}).output();
Deno.exit(r.code);
