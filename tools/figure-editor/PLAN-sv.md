# F22.0 plan: SystemVerilog in the Figure Editor

Status: **plan only, waiting for Blake's OK.** No F22 code exists. Branch `f22-0`, 2026-11-24.
Reads: circuit-model `model-v0.11.0` (commit `7cc774a`, `circuit/0.4`, C11.1), its `DECISIONS.md` and handoff of 2026-11-24, `proposals/engine-memo.md`, and the editors' code on `main` (`bf821d9`).
This replaces the untracked draft `proposals/f22-systemverilog-plan.md` (left in the L1 working tree, not touched). It keeps that draft's structure; what changed is marked **new** or **checked**.

## 1. Answers

1. **Does import run in the browser? Yes, in two stages.** The importer's mapping and layout files have no Node calls (checked: `index.mjs`, `map.mjs`, `layout.mjs` contain none). Only `engines.mjs` is Node and Deno, and its header says the browser loader comes later. Stage 1 uses slang alone (`slang.wasm.gz`, 1.5 MB) for structural code. Stage 2 adds Yosys (about 17 MB gzipped) for `always_comb` and `always_ff`.
2. **What GitHub Pages serves for `.wasm`: it gzips it on the fly** (section 2). Not tested at our largest file size (75 MB), so nothing relies on it: the shipped files are pre-gzipped and the loader copes with either result.
3. **The JSON route is free:** the editor's Open takes any circuit file, so once it reads `circuit/0.4` it opens the importer's command-line output. That ships first.
4. **One thing is needed from circuit-model before the Import panel:** a browser engines adapter (C11.1b, small). Recommended there, not copied into the site.
5. **New: calculated levels do not yet work through module instances** (section 3, item 4). Without a change, an imported hierarchical design shows the schematic but computes no levels inside instances.

## 2. What GitHub Pages does with a `.wasm` file

I did not publish a test: no pushes, no new repository without Blake. I asked for real files on sites served by GitHub Pages (`Server: GitHub.com`), once with `Accept-Encoding: gzip, br`, once with `identity`.

| File | Request | Result |
|---|---|---|
| `mbbill.github.io/JSC.js/demo/jsc.wasm` | gzip, br | `Content-Type: application/wasm`, `Content-Encoding: gzip`, 1,553,384 bytes, weak ETag (`W/`), `Cache-Control: max-age=600`, `Access-Control-Allow-Origin: *` |
| same | identity | 5,199,336 bytes (so gzip is 3.3 to 1) |
| our own `blakeaaronroberts.github.io/assets/wavedrom/lecture.js` | gzip, br | `Content-Encoding: gzip`, 3,144 bytes: same behaviour on our own site, for text |

- **Brotli is offered but not used**; gzip only.
- **Unknown, not tested:** a size ceiling for on-the-fly compression (our 75 MB `yosys.core.wasm`), and how Pages labels a file ending `.gz` (does it add a second `Content-Encoding`?). I looked for a large `.wasm` on Pages to probe the first and found none (YoWASP's own site is not on Pages).
- **No COOP/COEP headers can be set**, so no `SharedArrayBuffer`; slang is already built without threads and `read_slang` runs with `--threads 1`.
- **New: git limits.** A file over 50 MB draws a warning on push and over 100 MB is refused. The raw `yosys.core.wasm` (75 MB) cannot be committed; pre-gzipped (about 17 MB) can. (GitHub's published limits; I did not test a push.)

**Rule for the loader (works whichever way Pages behaves):** fetch the `.wasm.gz` (or `.wasm.bin`), read the first two bytes; if they are `1F 8B` run `DecompressionStream("gzip")`, otherwise the browser already decoded it and the bytes are the module. Then `WebAssembly.compile`. A test for each case is in section 6.

**YoWASP does not allow pre-gzipping as shipped:** its `bundle.js` fetches `yosys.core.wasm` and `yosys-resources.0.tar` itself at import time. Using `.gz` needs a small shim that redirects those fetches, or letting Pages gzip a plain file. Release 2's first task; untested.

## 3. How the editors pin and read `circuit/0.4`

**Today.** `tools/schematic-editor/MODEL_PIN.json` pins `model-v0.9.0` (schema `circuit/0.3`, reads 0.2 and 0.3) and, since F25.3, also holds the logic tools' `logic_tag`. `copy-model.js` reads the pin; `manifests.test.js` checks every copy against its MANIFEST.

**Checked, what breaks if only the pin moves:**

- `doc.js:13` writes `circuit/0.3` only and refuses other schemas.
- `doc.js:827` `ORDER` and the field checks refuse an unknown top-level field, so `modules` is refused.
- `block.js` accepts only `shape, w, h, label, pins` in a block's params, so `params.module` is refused.
- The pinned `simulate.mjs` at v0.11.0 imports `./flatten.mjs`, which `copy-model.js` does not list.
- **Checked (was open in the draft):** `simlevels.js` `circuitOf()` does **not** pass the document to the simulator. It builds its own flat `circuit/0.3` from elements that have a model in `MODELS`, with `ports: []`. A block is not in `MODELS`, so the inside of a module instance is dropped.

**Changes (F22.1a, tests first):**

1. `copy-model.js`: pin `model-v0.12.0` or newer (v0.12.0 is commit `1e65a2a4e5318bf0c20a169b33e35cfabcd74733`; same `circuit/0.4` schema file, hash schema sha256 `ec734d9c1da2b36c3c43b1c2391192010e9c130f35ce8c71f0c483f7776ab0dc`, `reads` 0.2, 0.3, 0.4); add `sim/flatten.mjs`; refresh schemas, validators, fixtures. The logic tools keep their own tag.
2. `doc.js`: read 0.4; keep `modules` as an opaque object (`doc.modules`) written back unchanged in its key position; write `circuit/0.4` only when `modules` is non-empty, else the existing 0.2 / 0.3 rule. No editing of module bodies in release 1.
3. `block.js`: allow `params.module` (a string id), carried through; the block's pins are the module's port ids, as the importer writes them.
4. `simlevels.js`: for a document with `modules`, send the simulator a `circuit/0.4` with the block elements, `params.module`, and `modules`, so it flattens. Not assumed: this needs a parity check against `examples/sv_demo.json` and its trace from circuit-model. **If it does not hold up, the fallback is a message: "levels are not calculated through module instances", shown once, not silent.**
5. Tests: `sv_demo.json` round-trips byte for byte; everything the editor writes validates against the pinned 0.4 schema in `tools/shared/test/model/`; an unknown schema (`circuit/0.5`) is still refused with the readable message; a 0.3 file without `modules` stays 0.3.

Older editors refuse a 0.4 file with the schema message; that is the format's rule.

## 4. Browser or JSON, and what it costs

**Recommended: browser import, staged.** "Paste a module" is the point of F22.1, and JSON-only needs a command line.

**Needed from circuit-model (C11.1b, its own tag, the next free tag: `model-v0.12.0` is taken (C16), so not that one):**

- a browser engines module: fetch the gzipped binary, the magic-byte rule above, same slang calls and same diagnostics parser as the Node one, so the two cannot drift;
- `importSystemVerilog(files, { top, engines })` with engines injectable (Node's by default) and `top` optional (slang picks the uninstantiated module; today `{ top }` is required);
- a test that runs the 9 importing and 16 refused fixtures through the browser module in headless Chrome and compares with the Node result.

If Blake prefers not to wait, a thin adapter in the site (about 40 lines in `tools/shared/src/`) works but copies the diagnostics parser and slang argument list, against the VISION rule and the memo's "keep the adapter thin". Not recommended.

**Delivery.** `copy-model.js` gains a third set (importer files, `layout.mjs`, `third_party/slang/slang.mjs`, `slang.wasm.gz`, `NOTICES.md`) with MANIFEST hashes, checked by `manifests.test.js` and marked `-text` in `.gitattributes`. `slang.wasm.gz` (1.5 MB) is committed; the panel links `NOTICES.md`.

**Where it runs: a Web Worker**, not the page. slang is synchronous, pasted text is untrusted, a large generate loop would freeze the tab. The page gives it 20 seconds, terminates it, and reports "took too long". Input cap 200 KB. The importer already restricts file names to letters, digits, `_`, `.`, `-` and writes only to slang's in-memory file system. The Worker script is a same-site file, loaded with the same-site rule of F25.2.

**New: what the importer refuses today** (Blake's rule, 2026-11-24; each refusal is shown with its line): asynchronous reset or set and `negedge` flip-flops (until the E9 symbols and circuit-model C11.5), arithmetic and comparison operators (until C11.6 draws them as blocks), `inout`, tri-state, ascending ranges, plain `always`, `initial`, `#` delays. So the course's async-reset registers and adders do not import in release 1 whatever the engine; the panel says so and does not guess.

**Release 2: behavioural code** (`always_comb`, `always_ff`) through YoWASP (`@yowasp/yosys` 0.71.1284, pinned; 74.9 MB raw, about 17 MB gzipped, 0.9 MB resources). Choices left to its own plan: commit the `.gz` files (17 MB per version in public history, no network in CI) or fetch at CI from npm at the pinned integrity (small repository, adds an npm step to F25's gated workflow); the shim or Pages' gzip, whichever a headless test shows works; Yosys time in a browser is unmeasured. Until then a module with `always_*` is reported with its line ("behavioural code needs the synthesis engine, not in this release").

## 5. What release 1 shows

**In (F22.1b):**

- Toolbar button **Import SystemVerilog**: a panel with a text area (paste), **Open .sv** (one or more files, read locally, never uploaded), and **Top module** (default automatic).
- **Import** places the importer's own layout (logic array for fully combinational bodies, left to right otherwise), which Blake then tidies. It replaces the figure after a confirm; one Undo restores it.
- Instances are labelled blocks showing the module name. To see a module's inside, choose it as the top module (the list fills after the first run). Opening a block in place is F22.2.
- **Problems list:** `file:line:column construct: message`; clicking one selects that line. Refusals are shown the same way.
- Calculated levels per section 3, item 4. A link to the third-party notices.

**Not in release 1:** opening or editing a module body (F22.2); export to `.sv` and round trip (F22.3); testbench, scenario and the Timing pane (F22.4, and circuit-model C11.2 is still open); behavioural code; inserting into an existing figure.

## 6. Tests and checks

Written first and failing:

1. Pin and 0.4 read and write (section 3, item 5).
2. Importer through the pinned copy in Deno, slang only: structural fixtures give circuit-model's own output; refused fixtures give the same problem lines.
3. Loader: bytes starting `1F 8B` are decompressed; bytes already decoded are not; a truncated file gives a readable error.
4. Panel logic without the DOM: input cap, timeout message, problem list to text-area ranges.
5. Browser (headless Chrome, existing harness): import a full-adder text and screenshot it; import a file with an error and check the reported line; measure bytes transferred for `slang.wasm.gz` over the local server and, **after deploy, over Pages** (the first real measure on our host; I report it, including whether Pages adds `Content-Encoding` to a `.gz`).
6. Privacy scan; licence lines in `DECISIONS.md` for slang and the NOTICES file; the manifest check and the same-site rule already run in CI.

Render and screenshot cadence follows CLAUDE.md.

## 7. Steps after Blake's OK

| Step | What | Needs |
|---|---|---|
| F22.1a | Pin `model-v0.12.0` or newer; `circuit/0.4` read and write; `modules` kept; block `module` param; simlevels passes modules (or the stated limit); Open takes the importer's JSON. **Review stop:** open `examples/sv_demo.json` | nothing new |
| circuit-model C11.1b | Browser engines adapter, injectable engines, optional `top`, browser parity test, tag | Blake names the batch there |
| F22.1b | Import panel, Worker, problem list, slang only; deploy and report Pages' real transfer. **Review stop** | C11.1b tagged |
| F22.1c | Behavioural code: YoWASP shipping choice, shim or Pages gzip, in-browser timing | after F22.1b |

## 8. Decisions for Blake

1. **Browser adapter owner:** circuit-model (C11.1b, recommended) or a thin copy in the site?
2. **Release 1 without behavioural code**, YoWASP in F22.1c? (Course examples with `always_ff` wait; so do async-reset registers and adders whichever engine, until C11.5 and C11.6.)
3. **Web Worker, 20 second limit, 200 KB input cap**, as above?
4. **Import replaces the figure** (confirm, one Undo), or also offer inserting?
5. **F22.1a first**, so the JSON route works while C11.1b is written?
6. **New:** if levels cannot be calculated through module instances in F22.1a, ship with the stated limit, or hold F22.1a until they can?

## Discrepancies to report

- The handoff says import runs in the browser "only if the C11.0 spike passes". It passed, but the 19.5 MB figure assumes gzip that the spike did not check; section 2 checks it for slang and finds YoWASP cannot be pre-gzipped without a shim.
- circuit-model's `import/README.md` documents Node and Deno only. `races.mjs` and `stimulus.mjs` are on its disk but not in `model-v0.11.0` (post-tag C11.2 work); this plan does not use them.
- The handoff had no F22.0 row; this branch adds one.

## 9. Decisions by Blake, 2026-11-24 (answers to section 8)

1. Browser adapter: circuit-model, as C11.1b (already queued there). No copy in the site.
2. Release 1 has no behavioural code. F22.1c adds it through YoWASP.
3. Web Worker, 20 second limit, 200 KB input cap.
4. Import replaces the figure after a confirm, with one Undo. Inserting waits for F22.2.
5. F22.1a goes first.
6. If levels cannot be calculated through module instances, F22.1a ships with a stated limit shown once in the UI, not silent.

**Two changes to the plan (same date):**

- **Pin `model-v0.12.0` or newer, not v0.11.0.** Checked: v0.12.0 (C16, simulator checks) has the same `circuit/0.4` schema file (same SHA-256) and still contains `sim/flatten.mjs`. `model-v0.12.0` is taken, so the browser-adapter tag (C11.1b) is the next free tag after it, not v0.12.0.
- **F22.1b (the Import panel) must not ship before the tag that holds circuit-model's sign-extension fix** for `assign y = a & s` (commit `95d31c6`, "Fix mixed-signedness widening"). It is on circuit-model's main but in no tag yet (checked: no tag contains it); F22.1b pins the tag that does. F22.1a does not import anything, so it is not blocked.
