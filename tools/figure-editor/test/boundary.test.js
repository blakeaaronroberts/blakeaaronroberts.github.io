// R1: tools are modules. A tool's source imports only its own src/, tools/shared/src/, and another tool's src/index.js.
// Also: each tool's index.js offers the shared mount interface, and the shared event bus behaves.

import { emitter, EVENTS } from "../../shared/src/tool.js";
import { assert, assertEquals, assertThrows } from "../../schematic-editor/test/helpers.js";

const tools = new URL("../../", import.meta.url);
const TOOLS = ["schematic-editor", "timing", "figure-editor"];

async function sources(tool) {
  const out = [];
  for await (const e of Deno.readDir(new URL(`${tool}/src/`, tools))) if (e.isFile && e.name.endsWith(".js")) out.push(e.name);
  return out;
}

Deno.test("no tool imports another tool's internals: only its own src, tools/shared/src, or another tool's index.js", async () => {
  const bad = [];
  for (const tool of TOOLS) {
    for (const file of await sources(tool)) {
      const text = await Deno.readTextFile(new URL(`${tool}/src/${file}`, tools));
      for (const m of text.matchAll(/(?:import|export)[^"'`;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
        const spec = m[1] ?? m[2];
        if (!spec.startsWith(".")) continue;
        const target = new URL(spec, new URL(`${tool}/src/${file}`, tools)).pathname;
        const own = target.includes(`/tools/${tool}/src/`), shared = target.includes("/tools/shared/src/");
        const viaIndex = TOOLS.some((t) => target.endsWith(`/tools/${t}/src/index.js`));
        if (!own && !shared && !viaIndex) bad.push(`${tool}/src/${file} imports ${spec}`);
      }
    }
  }
  assertEquals(bad, []);
});

Deno.test("each tool has an index.js that exports mount", async () => {
  for (const tool of TOOLS) {
    const text = await Deno.readTextFile(new URL(`${tool}/src/index.js`, tools));
    assert(/export (async )?function mount\(/.test(text), `${tool}/src/index.js exports mount`);
  }
});

Deno.test("the event bus: known events only, on and off, a throwing handler does not stop the others", () => {
  const bus = emitter(), seen = [];
  const off = bus.on("change", (p) => seen.push(["a", p.format]));
  bus.on("change", () => { throw new Error("boom"); });
  bus.on("change", (p) => seen.push(["c", p.format]));
  const quiet = console.error; console.error = () => {};
  bus.emit("change", { format: "circuit" });
  off();
  bus.emit("change", { format: "wavedrom" });
  console.error = quiet;
  assertEquals(seen, [["a", "circuit"], ["c", "circuit"], ["c", "wavedrom"]]);
  assertThrows(() => bus.on("chnage", () => {}), /unknown event/);
  assertEquals(EVENTS, ["change", "status", "frame", "levels", "nodes", "selection"]);
});
