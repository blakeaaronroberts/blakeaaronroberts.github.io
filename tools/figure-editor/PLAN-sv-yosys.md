# F22.1c plan: behavioural code (`always_comb`, `always_ff`) through YoWASP

Status: **plan only, waiting for Blake.** No code, no push. 2026-11-25.
Reads: STEWARD_HANDOFF F22.1b and F22.1c rows (slang.wasm.gz measured on Pages), PLAN-sv.md (sections 2, 4, 9), circuit-model `model-v0.15.1` (`import/README.md`, `engines-browser.mjs`, `engine-core.mjs`, DECISIONS C11.0b and C11.1b), the installed `@yowasp/yosys` 0.71.1284 (`gen/bundle.js`), and our `NOTICES.md`.
Scope kept: no change to circuit-model, nothing under `themes/`, no new dependency beyond what circuit-model already pins (section 3).

## 0. Findings that change the plan

1. **The pinned importer needs no re-pin.** Between `model-v0.14.0` (our pin) and `model-v0.15.1`, `engines-browser.mjs`, `engine-core.mjs` and `map.mjs` are byte-identical to our copy; only `races.mjs` and the README text changed. `createBrowserEngines({ yosysModule })` already exists. F22.1c stays on `model-v0.14.0`.
2. **Yosys is not in circuit-model's git** (`npm ci`, not committed), so `copy-model.js` cannot carry it. It needs its own copy script (section 1).
3. **YoWASP cannot be pre-gzipped as shipped.** `gen/bundle.js` fetches `./yosys.core.wasm` ... `core4.wasm` and `./yosys-resources.0.tar` from fixed names beside itself, and it captures `globalThis.fetch` when it loads. Fix: our Worker installs a `fetch` wrapper first (section 1). The vendored package stays byte-exact.
4. **circuit-model's Chrome parity test does load Yosys** (`tests/browser/parity_worker.mjs` line 10), but from plain files. Our `.gz` and wrapper path is not covered there, so we test it ourselves.
5. **Our Worker is thrown away after every run** (`svjob.js` `finish` terminates it). With Yosys that would mean fetch, decompress 75 MB and compile it again on every Import. Section 2.
6. **Cache headers cannot be changed on Pages** and revalidation can cost 17 MB (section 1, Caching).

## 1. Delivery on GitHub Pages

### Measured (2026-11-25; "not measured" means exactly that)

| Item | Result |
|---|---|
| `yosys.core.wasm` | 74,923,157 bytes raw; **17,181,082 gzip -6; 17,044,499 gzip -9** |
| `yosys-resources.0.tar` | 10,598,400 raw; 867,445 (-6); 856,267 (-9) |
| `bundle.js` | 591,988 raw; 53,863 (-6); 52,729 (-9) |
| `core2/3/4.wasm` | 30,318 / 1,409 / 999 raw; 10,356 / 698 / 429 gz |
| **Wire total, -9** | **about 17.96 MB** (17.1 MiB). With slang (1.49 MB): 19.5 MB, matching C11.0. Brotli: not measured (the run timed out, and Pages does not serve `.br`) |
| Pages, our `slang.wasm.gz` (today) | `Content-Type: application/gzip`, **no `Content-Encoding`**, 1,492,993 bytes, strong ETag, `Cache-Control: max-age=600`, `Access-Control-Allow-Origin: *`, 0.23 s here (6.4 MB/s; this link only) |
| Pages, our `.js` | gzipped on the fly (`Content-Encoding: gzip`), as before |
| Pages, `If-None-Match` | same ETag gives **304**; a different ETag gives a full **200** |
| Pages, `Range` | `Accept-Ranges: bytes` is sent, but a ranged request returned the **whole file (200)**: no resumable download |
| ETag form | `"<hex mtime>-<hex size>"`. Every file rendered in today's build shares one prefix (`6b072fd5` = 2026-11-25 18:58:29 UTC); one older file has an older prefix |
| Transfer time of 18 MB | arithmetic, not measured: 2.8 s at 6.4 MB/s, 29 s at 5 Mbit/s, 60 s at 2.4 Mbit/s |
| **Not measured** | Yosys run time in a browser; peak memory; decompress plus compile time of the 75 MB module; whether an unchanged file keeps its ETag across two deploys; Pages' behaviour for a 75 MB plain `.wasm` (see below) |

I did not push a test file (CLAUDE.md: push only when Blake asks). A Deno attempt to time Yosys failed to load the engine and I stopped; there is no number.

### Recommendation: commit the pre-gzipped files, decompress in the Worker

- **Files** (new folder `tools/shared/src/sv/third_party/yowasp/`, under the existing `-text` rule and the existing `tools/*/src/**` Quarto resources glob, so no `_quarto.yml` or `.gitattributes` change): `bundle.js` (as published), `yosys.core.wasm.gz`, `yosys.core2.wasm.gz`, `core3`, `core4`, `yosys-resources.0.tar.gz`, `MANIFEST.json`, `README.md`.
- **Why `.gz` and not the raw 75 MB file:** the raw file is over GitHub's 50 MB warning and relies on Pages gzipping a 75 MB `.wasm` on the fly, which nobody has tested (PLAN-sv.md section 2). `.gz` is measured: Pages sends it untouched. Cost: **+18 MB in git history** (the repository's `.git` is 24 MB today, so this nearly doubles it) and another 18 MB on each Yosys version change. Pins move only on a deliberate decision.
- **New script `tools/shared/scripts/copy-yowasp.js`** (the only writer of that folder): downloads the npm tarball for the pinned version, checks its sha512 against the integrity recorded in circuit-model DECISIONS C11.0b (`sha512-sEqbe2F1...`), gzips with a fixed level, and writes `MANIFEST.json` with the raw SHA-256 *and* the `.gz` SHA-256 of each file. gzip output can differ between zlib builds, so the test checks the committed `.gz` hash **and** that gunzip of it equals the recorded raw hash.
- **Loader (new `tools/shared/src/yowasp-fetch.js`, pure functions, injectable `fetch`):** `installYowaspFetch({ base, onProgress })` replaces `globalThis.fetch` in the Worker **before** the bundle is imported. For the five fixed names it fetches `<name>.gz`, applies slang's rule (first bytes `1F 8B`: `DecompressionStream("gzip")`; otherwise already decoded), counts compressed bytes for progress against `Content-Length`, and returns a `Response` with `Content-Type: application/wasm` for `.wasm` (so `WebAssembly.compileStreaming` still works) or `application/octet-stream` for the tar. Any other URL (slang's) passes through. Errors become readable messages ("the synthesis engine could not be downloaded: ...", "... is incomplete or damaged").
- **Load only on demand: already true.** `engine-core.mjs` imports the bundle lazily, only when a module has `always_*`; structural code never fetches it. A browser test asserts zero `yowasp/` requests for a structural import. **No prefetch** while typing (it would spend 18 MB without the visitor asking).
- **Data saver:** if `navigator.connection?.saveData` is on, ask before downloading.
- **Visible progress:** Worker posts `{ id, progress: { file, done, total } }`; the panel shows a `<progress>` bar, text ("Downloading the synthesis engine, 4.2 of 18 MB"), then "Preparing", then "Synthesising", with a **Cancel** button (terminates the Worker). Strings below are proposals; none is approved (U1 rule).
- **Fallback if it fails:** the import still returns a problem line, not a silent empty result, naming the cause (download failed with status, truncated, `DecompressionStream` or `compileStreaming` missing, out of memory when the Worker dies) and adding that structural code still imports. The next click retries (`engine-core` `once()` already forgets a failed load).
- **Caching (the risk):** `max-age=600` is fixed, and after 10 minutes the browser revalidates. If a deploy changes the file's mtime the ETag changes and the **full 17 MB downloads again** even though the bytes are identical; the build re-copies resources each deploy, so this is likely but **not measured** (needs two deploys). Mitigation, a separate small step: the Worker keeps the `.gz` bytes in Cache Storage under `yowasp-0.71.1284-<sha256 prefix>/<name>` and never revalidates; the key comes from the 1 KB `MANIFEST.json` fetched `no-cache`; old keys are deleted on success; if the browser evicts it, it just downloads again. Nothing leaves the browser. The panel would say it is stored (proposed string below).
- **Optional later, only if the IP Inspector asks:** a trimmed resources tar (only what `proc; opt; techmap; dfflegalize` read). Saves little (0.86 MB gz) but removes FPGA techlib files from what we serve. It would be our own derived file, not the package, so not recommended unless needed.

## 2. What the Worker, the 20 second limit and the 200 KB cap need

| Today (F22.1b) | Change |
|---|---|
| `sv-worker.js`: `createBrowserEngines()`, slang only | Install the fetch wrapper, then `createBrowserEngines({ yosysModule: new URL("./sv/third_party/yowasp/bundle.js", import.meta.url).href })`. Catch engine errors and rethrow them as the readable messages above. Forward progress |
| `svjob.js`: new Worker per run, terminated in `finish` | **Keep one warm Worker** after a run that loaded Yosys; reuse it; terminate on timeout, error, Cancel, panel close or **5 minutes idle** (memory). Structural-only runs behave as today. Without this, every Import pays fetch, gunzip and compile again (that cost is unmeasured) |
| 20 s timer starts at `postMessage` | A cold first run includes an 18 MB download, so the clock would kill it on a slow link. Proposed rule: **the 20 s limit applies to the run, not the download**: the timer is paused while progress events arrive, restarts at "engine ready" (last file done), and a download that makes **no progress for 20 s** is stopped as "stalled". A hard cap on the whole first run (proposal: 3 minutes) plus Cancel. Warm runs keep exactly 20 s. `TIME_LIMIT_MS` stays 20000 |
| 200 KB cap (`MAX_INPUT_BYTES`) | **Keep.** The cost of Yosys depends on the elaborated size (generate loops, wide registers), not file size, so the 20 s limit is the real guard. Revisit after the browser measurements in section 4 give run time and memory for a 200 KB worst case; if memory is the problem, the answer is a message, not a lower cap by guess |
| `failure(construct, message)` | New construct `engine` for download, memory and unsupported-browser problems; the existing `synthesis` problem stays when the engine is unavailable |
| Panel (`svpanel.js`) | Progress bar, Cancel, retry text, the engine notice. `app.js` is **not** touched: the panel is self-contained (`run = runImport` is already injectable) |

Unchanged on purpose: Yosys runs with `--threads 1` (no `SharedArrayBuffer` on Pages), the importer still refuses async reset or set, `negedge`, arithmetic and comparisons, `inout`, plain `always`, `initial`, delays, and instances inside a module with `always`. `demo.sv` is the first file this makes importable end to end.

## 3. Licence and attribution (record in DECISIONS.md terms)

`tools/shared/src/sv/third_party/NOTICES.md` is circuit-model's file and already holds "Bundle 2" for this engine: YoWASP (ISC, Catherine), Yosys (ISC, Claire Xenia Wolf), yosys-slang (ISC, Martin Povisier), slang and its libraries (MIT, BSL-1.0, Emscripten-style runtime, LLVM Apache-2.0 with LLVM Exceptions, musl), ABC (UC permissive), MiniSat, cxxopts, json11, fst (MIT), bigint and sha1 (public domain). **No new dependency for the site** beyond what circuit-model already pins; it is a new *shipped third-party component* of the site, so it needs entries here.

Add to `DECISIONS.md` (newest first, date, decision, why), and one row in the F25 licence table:

> **2026-11-XX: Yosys engine for behavioural import (F22.1c).** Decision: `@yowasp/yosys` 0.71.1284 (npm integrity `sha512-sEqbe2F1XgBk/pkykD8YBAF1/3BvyT6DgeJjzZEubo+piXAkFq/ih9WmXuplrpXtTQ6iHkQg6BbBxBgZYFfHWg==`, Yosys 0.71 git b4c586fd3), committed as gzipped copies in `tools/shared/src/sv/third_party/yowasp/` with a MANIFEST of raw and compressed SHA-256, served from this site only, loaded on demand in the import Worker. Licences: ISC (YoWASP, Yosys, yosys-slang) plus the components in `third_party/NOTICES.md`, shipped beside the files and linked from the panel. Why: behavioural code needs synthesis (engine memo); pre-gzipped files do not depend on how Pages compresses; 18 MB repository cost accepted.
>
> Table row: `@yowasp/yosys | 0.71.1284 | ISC (and the notices file) | Import SystemVerilog, behavioural code | this site, on demand`.

**Open items for the IP Inspector, not mine to close** (circuit-model's `NOTICES.md` says the same): (a) Yosys's FPGA techlib `.v` files inside the resources tar were "not read one by one"; (b) circuit-model's DECISIONS lists `ezsat`, `subcircuit` (ISC) and **WASI libc** among the YoWASP licences, but `NOTICES.md` has no section for them (the LLVM and musl texts are there); (c) the IEEE `vpi_user.h` flag. Editing `NOTICES.md` is a circuit-model change, so I would report these, not patch our copy (the manifest test would fail it anyway).

No Blake licence notice is added (VISION.md section 3).

## 4. Tests to write first (all failing before code)

Deno, run by the existing test jobs (`tools/schematic-editor/test/`):

1. **`yowaspfetch.test.js`:** the five names map to `.gz`; gunzip works; bytes already decoded are passed through; a truncated `.gz`, a 404 and a 503 give readable errors; other URLs pass through untouched; progress counts compressed bytes; `Content-Type` is `application/wasm` for `.wasm`.
2. **`manifests.test.js` (extended):** `third_party/yowasp/` against its MANIFEST: committed `.gz` SHA-256, gunzip equals raw SHA-256, every file under 50 MB, recorded npm integrity equals the constant above.
3. **`svjob.test.js` (extended, fake Worker):** progress is forwarded; the timer pauses during download and restarts at ready; stall after 20 s without bytes; hard cap; Cancel terminates; a warm Worker is reused and then ended on error and on idle; the 20 s run limit still ends a stuck run; `TIME_LIMIT_MS` and `MAX_INPUT_BYTES` still equal 20000 and 200 KB.
4. **Parity with circuit-model:** the vendored engine plus the wrapper, run in Deno (`file:` fetch) on the copied `demo.sv`, must give circuit-model's own `examples/sv_demo.json` (already in `test/model/`), and the `always_comb` and `always_ff` fixtures must equal circuit-model's expected output. Marked slow.

Headless Chrome (`check.js`, new scenario `svyosys`, light and dark):

5. Structural import makes **no** `yowasp/` request.
6. Importing `demo.sv` with the network throttled (CDP) shows the progress bar, text and Cancel; the result equals `sv_demo.json`; a second import downloads nothing and is faster; Cancel stops it; a blocked or 503 `.gz` gives the readable message and structural code still imports.
7. **Measures, recorded in the handoff:** bytes on the wire, time to ready (cold and warm), run time for `demo.sv` and a 200 KB worst case, peak memory.
8. **After deploy, on Pages:** headers of each `.gz` (expect `application/gzip`, no `Content-Encoding`), wire bytes, and ETag before and after a second deploy to settle the caching question.

Existing scenarios stay as they are; the 8 failing T-fix scenarios are not part of this.

## 5. What the privacy scan will flag (checked on the real files)

- `scripts/privacy-scan.js` reads only `qmd|md|html|yml|json|js|mjs|css|scss|svg|txt|csl|xml|tex|bib`. The `.gz` files are **not scanned**. `bundle.js`, `MANIFEST.json` and `README.md` are: `bundle.js` has **0 phone-pattern matches and 0 email addresses** (checked), so it is clean even outside the vendored list.
- The new folder is under `tools/shared/src/sv/`, which Blake's `vendored` list already covers (also `_site/tools/shared/src/sv/`), so **`privacy-allow.json` needs no change** and I do not touch it.
- **Blind spot to tell Blake:** the resources tar (scanned by nobody) contains ten third-party authors' email addresses in file headers. Visitors do not see them (the tar is unpacked into the Worker's memory), but they are in a file we publish. Same class as the NOTICES.md entries Blake already allowed. Decision for Blake: accept, or ship the trimmed tar (section 1).
- Any new on-screen string, the DECISIONS text and the handoff row are scanned as usual. The CV rule is unaffected.

## 6. Files I would touch, and sequencing after U1.1 and U1.4

U1.1 and U1.4 edit `tools/schematic-editor/src/app.js` and `tools/figure-editor/src/index.js`. **F22.1c touches neither.** The `u1` branch (checked) also changes `tools/schematic-editor/editor.css` and `tools/figure-editor/test/browser/scenarios.js`; F22.1c adds to both.

| File | Change | Overlaps U1? |
|---|---|---|
| `tools/shared/src/sv/third_party/yowasp/**` (new) | vendored engine, MANIFEST, README | no |
| `tools/shared/scripts/copy-yowasp.js` (new) | the only writer of that folder | no |
| `tools/shared/src/yowasp-fetch.js` (new) | fetch wrapper | no |
| `tools/shared/src/sv-worker.js` | wrapper, `yosysModule`, progress, readable errors | no |
| `tools/shared/src/svjob.js` | warm Worker, timer rule, progress, `engine` problems | no |
| `tools/schematic-editor/src/svpanel.js` | progress bar, Cancel, retry, notice | no |
| `tools/schematic-editor/editor.css` | progress styles (`fe-sv-*`) | **yes** (U1.1, U1.4) |
| `tools/figure-editor/test/browser/scenarios.js` | new `svyosys` scenario, appended | **yes** (U1.1, U1.4; additive) |
| `tools/schematic-editor/test/{manifests,svjob}.test.js`, new `yowaspfetch.test.js` | tests (section 4) | no |
| `DECISIONS.md`, `docs/STEWARD_HANDOFF.md`, `tools/figure-editor/README.md` | decision, rows, notes | handoff rows only |

Suggested order:

1. **F22.1c-0 (any time, no overlap):** vendor the files and the copy script, tests 1 and 2, push to `main` **with Blake's OK** (the inert files are the "test file on Pages": measures headers, wire time and, after a second deploy, the ETag question). Nothing in the editor uses them yet.
2. **F22.1c-1 (any time):** Worker, wrapper, `svjob.js`, tests 3 and 4. No UI, no overlap.
3. **F22.1c-2 (after U1.1 merges; before or after U1.4, but not at the same time as U1.4 because of `editor.css` and `scenarios.js`):** panel, progress, fallback, browser scenario. **Review stop** (progress, failure, light and dark).
4. **F22.1c-3 (optional, after the Pages ETag result):** Cache Storage.

## 7. Proposed on-screen strings (none approved; placeholders for Blake)

- Progress: `Downloading the synthesis engine, {done} of {total} MB (once)` / `Preparing the synthesis engine` / `Synthesising`.
- Cancel: `Cancel`.
- Failure: `The synthesis engine could not be loaded ({reason}). Structural code still imports; code with always_comb or always_ff needs it. Try again.`
- Data saver: `The synthesis engine is 18 MB. Download it now?`
- Storage (only with F22.1c-3): `Kept in this browser so it downloads once. Clearing site data removes it.`

## 8. Decisions for Blake

1. **Commit the pre-gzipped engine (+18 MB in git, recommended)**, or the raw file and rely on Pages gzip (untested at 75 MB, 75 MB in git)?
2. **Fetch wrapper in the Worker** (our code; vendored package untouched) — OK?
3. **Warm Worker** kept after a Yosys run, ended after 5 minutes idle?
4. **Limit rule:** 20 s for the run only; download stops after 20 s without progress, hard cap 3 minutes on a cold first run, Cancel always — OK? 200 KB cap unchanged?
5. **Cache Storage layer** (F22.1c-3) — yes, after the two-deploy ETag measure?
6. **Ask first when Data Saver is on** — yes?
7. **Push the inert engine files to `main`** as step F22.1c-0 so I can measure on Pages?
8. **Ten author emails inside the tar**: accept, or ship a trimmed tar?
9. Strings in section 7.

## 9. Discrepancies to report

- The memo's "17.0 MB gzip" for `yosys.core.wasm` is right at -9 (17,044,499) and 17.18 MB at -6; the wire total is **17.96 MB**, not "17 MB".
- `ezsat`, `subcircuit` and WASI libc are named in circuit-model DECISIONS C11.0 (d) but have no section in its `NOTICES.md`.
- circuit-model README says the `.wasm` and `.tar` go "beside" `bundle.js`; our site deviates (they are `.gz`, through the wrapper). Not a defect, but its parity test does not cover our path.
- Pages answers `Accept-Ranges: bytes` but returned the full file for a ranged request.
