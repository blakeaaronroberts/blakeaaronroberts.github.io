// Run the figure editor's tests with Quarto's bundled Deno (proposal section 10.7):
//
//   quarto run tools/figure-editor/test/run.js
//
// `quarto run` executes this file with its own Deno; this starts that same Deno's test
// runner on the test folder. No Node and no other dependency.

const dir = new URL(".", import.meta.url);
const path = decodeURIComponent(dir.pathname).replace(/^\/([A-Za-z]:)/, "$1");
const pack = decodeURIComponent(new URL("../symbol-pack/", dir).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const examples = decodeURIComponent(new URL("../examples/", dir).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const r = await new Deno.Command(Deno.execPath(), {
  args: ["test", "--no-config", "--no-lock", "--no-remote", `--allow-read=${path},${pack},${examples}`, path],
  stdout: "inherit", stderr: "inherit",
}).output();
Deno.exit(r.code);
