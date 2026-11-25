# slang (WebAssembly build)

slang **v12.1** (MIT), built for the browser and Node by
`.github/workflows/slang-wasm.yml` from the pinned tag (commit 42710c78) with
Emscripten 7.0.0 (commit 1693ce73). Copied unchanged from that workflow's
artifact `slang-wasm-v12.1`, run 45245287490 (2026-11-23). Licence texts:
`third_party/NOTICES.md`, which is shipped beside these files.

| File | SHA-256 |
|---|---|
| `slang.mjs` | `3c13ff37b667e1ea9bdb791eab716c1a76cd6e7f6a6348d49a31a990c975a43e` |
| `slang.wasm.gz` | `4df964a14d8dbbbb6b3514fe14b8da26be2efba87288c48802c6617fbf212b65` |

`import/sv/engines.mjs` decompresses the `.wasm.gz` itself; nothing relies on
the host compressing. To update: run the workflow on a new pinned tag, copy
the artifact here, update this table and DECISIONS.md.
