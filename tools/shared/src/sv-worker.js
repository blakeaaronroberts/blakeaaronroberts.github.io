// The Worker that runs circuit-model's SystemVerilog importer (F22.1b). A module Worker: slang only, loaded from the pinned
// copy in ./sv/. One message in, { id, ok, result } or { id, ok: false, error } out. The page ends the Worker (svjob.js).

import { importSystemVerilog } from "./sv/import/sv/index.mjs";
import { createBrowserEngines } from "./sv/import/sv/engines-browser.mjs";

self.onmessage = async (e) => {
  const { id, files, top } = e.data ?? {};
  try {
    const result = await importSystemVerilog(files, { top, engines: createBrowserEngines() });
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
