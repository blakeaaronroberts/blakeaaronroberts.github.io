// Run the number-systems tests with Quarto's bundled Deno:  quarto run tools/logic/number-systems/test/run.js
const here = new URL(".", import.meta.url);
const path = (u) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, "$1");
const r = await new Deno.Command(Deno.execPath(), {
  args: ["test", "--no-config", "--no-lock", "--no-remote", `--allow-read=${path(here)}`, path(here)],
  stdout: "inherit", stderr: "inherit",
}).output();
Deno.exit(r.code);
