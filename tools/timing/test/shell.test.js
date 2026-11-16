import { dockSettings, dockShell, pageShell } from "../src/shell.js";

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
  assert(html.includes('data-size="lockAspect"'), "the beta size controls can lock the aspect ratio");
  assert(html.includes('data-look="edgeDotted"'), "arrow types can use dotted lines");
  assert(html.includes('data-look="edgeColour"'), "each arrow type has a colour picker");
  assert(html.includes('data-do="reset-look">Reset look to defaults</button>'), "the complete look can be reset");
});

Deno.test("the beta dock includes a truth-table panel without changing the standalone page", () => {
  const beta = dockShell("test-button", true);
  const page = pageShell("test-button");
  assert(beta.includes('data-view="truth"'), "the beta timing pane has a truth-table view");
  assert(beta.includes('data-truth-action="generate"'), "all input cases can be generated");
  assert(beta.includes('data-truth-action="check"'), "a pasted table can be checked");
  assert(beta.includes('data-truth-table'), "the table can be edited in the pane");
  assert(!page.includes('data-view="truth"'), "the standalone timing page is unchanged");
});

Deno.test("external beta controls can live outside the timing drawing pane", () => {
  const dock = dockShell("test-button", true, true);
  const controls = dockSettings("test-button");
  assert(!dock.includes("data-look-split"), "the diagram pane has no look-controls splitter");
  assert(!dock.includes("td-view-look"), "the diagram pane has no docked Look and Size controls");
  assert(controls.includes("td-side-look") && controls.includes("td-side-size"), "Look and Size controls render in the external sidebar");
});
