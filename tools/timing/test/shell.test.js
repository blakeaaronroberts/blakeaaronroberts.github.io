import { dockShell, pageShell } from "../src/shell.js";

const assert = (condition, message) => { if (!condition) throw new Error(message); };

Deno.test("beta source and fit controls do not change the standalone timing tool", () => {
  const page = pageShell("test-button");
  const dock = dockShell("test-button");
  for (const html of [page, dock]) {
    assert(html.includes(">WaveDrom source</button>"), "the standalone source tab keeps its label");
    assert(html.includes("Any WaveDrom diagram: paste one in and press Use this source."), "the standalone source hint remains");
    assert(!html.includes('data-do="fit">Fit</button>'), "Fit is not added outside the beta editor");
  }
});

Deno.test("the beta dock uses the concise source tab and adds viewer Fit", () => {
  const html = dockShell("test-button", true);
  assert(html.includes(">Source</button>"), "the beta source tab has its concise label");
  assert(!html.includes("Any WaveDrom diagram: paste one in and press Use this source."), "the beta source hint is removed");
  assert(html.includes('data-do="fit">Fit</button>'), "Fit is available in the beta viewer");
});
