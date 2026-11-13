// A small headless-Chrome driver for the beta editor's browser checks. No dependency: Quarto's Deno,
// the Chrome DevTools protocol over a WebSocket, and a static server for the rendered _site folder.
//
//   quarto render tools/figure-editor/index.qmd
//   quarto run tools/figure-editor/test/browser/check.js [dark] [wires] [saves] [--out <dir>]

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"];
const TYPES = { html: "text/html", js: "text/javascript", css: "text/css", json: "application/json", svg: "image/svg+xml", woff2: "font/woff2", png: "image/png", xml: "application/xml" };

export function serve(root, port) {
  const server = Deno.serve({ port, hostname: "127.0.0.1", onListen() {} }, async (req) => {
    let path = decodeURIComponent(new URL(req.url).pathname);
    if (path.endsWith("/")) path += "index.html";
    try {
      const body = await Deno.readFile(`${root}${path}`);
      return new Response(body, { headers: { "content-type": TYPES[path.split(".").pop()] ?? "application/octet-stream" } });
    } catch { return new Response("not found", { status: 404 }); }
  });
  return server;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Start Chrome, open one tab, and return a page handle. */
export async function launch({ port = 9333, width = 1366, height = 768, scheme = "light", profile }) {
  const exe = (await Promise.all(CHROME.map((p) => Deno.stat(p).then(() => p, () => null)))).find(Boolean);
  if (!exe) throw new Error("no Chrome or Edge found");
  const dir = profile ?? await Deno.makeTempDir({ prefix: "fe-chrome-" });
  const proc = new Deno.Command(exe, {
    args: ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--window-size=${width},${height}`, "about:blank"],
    stdout: "null", stderr: "null",
  }).spawn();
  let info;
  for (let i = 0; i < 60 && !info; i++) {
    try { info = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json(); } catch { await sleep(250); }
  }
  if (!info) throw new Error("Chrome did not start");
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map(), listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(`${p.method}: ${msg.error.message}`)) : p.res(msg.result); }
    else for (const l of listeners) l(msg);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej, method }); ws.send(JSON.stringify({ id: n, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
  const errors = [];
  listeners.push((msg) => {
    if (msg.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});   // the editor warns before leaving with unsaved work
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  });
  const page = {
    errors,
    async goto(url) {
      const loaded = new Promise((res) => { const l = (msg) => { if (msg.method === "Page.loadEventFired") { listeners.splice(listeners.indexOf(l), 1); res(); } }; listeners.push(l); });
      await send("Page.navigate", { url });
      await loaded;
    },
    async eval(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expression, ms = 20000) {
      const end = Date.now() + ms;
      while (Date.now() < end) { if (await page.eval(expression).catch(() => false)) return true; await sleep(150); }
      throw new Error(`timed out waiting for ${expression}`);
    },
    sleep,
    async mouse(type, x, y, extra = {}) {
      await send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
    },
    async drag(from, to, steps = 8) {
      await page.mouse("mouseMoved", from[0], from[1], { buttons: 0 });
      await page.mouse("mousePressed", from[0], from[1]);
      for (let i = 1; i <= steps; i++) await page.mouse("mouseMoved", from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
      await page.mouse("mouseReleased", to[0], to[1]);
    },
    async click(x, y) { await page.mouse("mouseMoved", x, y, { buttons: 0 }); await page.mouse("mousePressed", x, y); await page.mouse("mouseReleased", x, y); },
    async key(key, code = key, vk = 0, modifiers = 0) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, modifiers });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers });
    },
    async beforeLoad(source) { await send("Page.addScriptToEvaluateOnNewDocument", { source }); },
    async downloadsTo(dir) {
      try { await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dir }); } catch { await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir }); }
    },
    async setFile(selector, path) {
      const { root } = await send("DOM.getDocument", { depth: 0 });
      const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector });
      await send("DOM.setFileInputFiles", { files: [path], nodeId });
    },
    async shotData() { return (await send("Page.captureScreenshot", { format: "png" })).data; },
    async shot(path) {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      await Deno.writeFile(path, Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
    },
    async close() {
      try { ws.close(); } catch { /* already closed */ }
      try { proc.kill(); } catch { /* already gone */ }
      await sleep(500);
      try { await Deno.remove(dir, { recursive: true }); } catch { /* Chrome still holds files; the temp folder is harmless */ }
    },
  };
  return page;
}
