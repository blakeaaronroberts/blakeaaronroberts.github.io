// Run the timing-diagram tests with Quarto's bundled Deno:  quarto run tools/timing-diagram/test/run.js
const dir = new URL(".", import.meta.url);
const path = decodeURIComponent(dir.pathname).replace(/^\/([A-Za-z]:)/, "$1");
const src = decodeURIComponent(new URL("../src/", dir).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const r = await new Deno.Command(Deno.execPath(), {
  args: ["test", "--no-config", "--no-lock", "--no-remote", `--allow-read=${path},${src}`, path],
  stdout: "inherit", stderr: "inherit",
}).output();
Deno.exit(r.code);
