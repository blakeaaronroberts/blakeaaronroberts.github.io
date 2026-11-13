// Copy the symbol pack from a local circuit-model checkout into ../symbol-pack/.
//
//   quarto run tools/figure-editor-beta/scripts/copy-symbol-pack.js [--source ../circuit-model] [--ref symbols-v0.1.0]
//
// The only writer of tools/figure-editor-beta/symbol-pack/. Never edit that folder by hand.
// Files are read from git (`git show <ref>:symbols/<file>`), not from the working tree, so the
// copy is exactly what the ref holds, whatever is checked out. With no --ref it uses the newest
// `symbols-v*` tag; if there is none, HEAD, recorded as untagged (proposal section 10.2).
// Writes MANIFEST.json (source commit, tag, per-file SHA-256) and VERSION next to the copy.
// Runs under Quarto's bundled Deno; no other dependency.

const here = new URL(".", import.meta.url);
const packDir = new URL("../symbol-pack/", here);
const repoRoot = new URL("../../../", here);

function arg(name, fallback) {
  const i = Deno.args.indexOf(name);
  return i >= 0 && i + 1 < Deno.args.length ? Deno.args[i + 1] : fallback;
}

async function git(cwd, args, binary = false) {
  const r = await new Deno.Command("git", { args: ["-C", cwd, ...args], stdout: "piped", stderr: "piped" }).output();
  if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${new TextDecoder().decode(r.stderr).trim()}`);
  return binary ? r.stdout : new TextDecoder().decode(r.stdout).trim();
}

async function sha256(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const source = decodeURIComponent(new URL(arg("--source", "../circuit-model"), repoRoot).pathname).replace(/^\/([A-Za-z]:)/, "$1");

let ref = arg("--ref", null);
if (!ref) {
  const tags = (await git(source, ["tag", "--list", "symbols-v*", "--sort=-v:refname"])).split("\n").filter(Boolean);
  ref = tags[0] ?? "HEAD";
}
const commit = await git(source, ["rev-parse", `${ref}^{commit}`]);
const tags = (await git(source, ["tag", "--points-at", commit])).split("\n").filter((t) => t.startsWith("symbols-v"));
const tag = tags.includes(ref) ? ref : (tags[0] ?? null);

const names = (await git(source, ["ls-tree", "--name-only", `${commit}:symbols`])).split("\n").filter(Boolean).sort();
if (!names.includes("index.json")) throw new Error(`${ref} has no symbols/index.json`);

// The folder is script-owned: clear it, then write the copy.
try { await Deno.remove(packDir, { recursive: true }); } catch (e) { if (!(e instanceof Deno.errors.NotFound)) throw e; }
await Deno.mkdir(packDir, { recursive: true });

const files = [];
for (const name of names) {
  const bytes = await git(source, ["show", `${commit}:symbols/${name}`], true);
  await Deno.writeFile(new URL(name, packDir), bytes);
  files.push({ name, bytes: bytes.length, sha256: await sha256(bytes) });
}

// Every file the index names must be present.
const index = JSON.parse(await Deno.readTextFile(new URL("index.json", packDir)));
const missing = [index.theme, ...index.elements.flatMap((e) => [e.json, e.svg])].filter((f) => !names.includes(f));
if (missing.length) throw new Error(`index.json names missing files: ${missing.join(", ")}`);

const manifest = {
  note: "Written by tools/figure-editor-beta/scripts/copy-symbol-pack.js. Do not edit this folder by hand.",
  source: "circuit-model",
  path: "symbols/",
  ref,
  tag,
  commit,
  pack: index.pack,
  files,
};
await Deno.writeTextFile(new URL("MANIFEST.json", packDir), JSON.stringify(manifest, null, 2) + "\n");
await Deno.writeTextFile(new URL("VERSION", packDir), `${tag ?? "untagged"} ${commit}\n`);
console.log(`Copied ${files.length} files (${index.elements.length} elements) from circuit-model ${tag ?? "untagged"} @ ${commit.slice(0, 7)}`);
