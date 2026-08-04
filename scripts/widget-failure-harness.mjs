/**
 * Serves the real built chat UI against a FAKE API, so failure modes that are
 * hard to trigger against production — a 429 on session, a 401 on send, a hang —
 * can be driven on demand.
 *
 * Mode is set per-request via the ?mode= on the host page, forwarded in a header
 * the stub reads. Simpler: a module-level switch flipped by /__mode/<name>.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const DIST = "C:/Users/ritik/OneDrive/Desktop/Metnmat-customer-agent-main/iframe-chat-widget/iframe-ui/dist";
let mode = "ok";
let sendCount = 0;

const HOST_PAGE = `<!doctype html><meta charset=utf-8><title>host</title><body>
<iframe id="f" src="/chat-widget/" style="width:400px;height:640px;border:1px solid #ccc"></iframe>
<script>
  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'WIDGET_READY') {
      document.getElementById('f').contentWindow.postMessage(
        { type: 'INIT_WIDGET', siteKey: 'metnmat-main', theme: 'light' }, '*');
    }
  });
</script></body>`;

const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "content-type": type, "access-control-allow-origin": "*" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");

    if (url.pathname.startsWith("/__mode/")) {
      mode = url.pathname.split("/").pop();
      sendCount = 0;
      return send(res, 200, { mode });
    }
    if (url.pathname === "/__stats") return send(res, 200, { sendCount });

    if (url.pathname === "/widget/session") {
      if (mode === "session429") return send(res, 429, { error: "Too many requests" });
      if (mode === "session500") return send(res, 500, { error: "boom" });
      return send(res, 200, { sessionToken: "tok-123", conversationId: "conv-123" });
    }

    if (url.pathname === "/widget/messages") return send(res, 200, []);

    if (url.pathname === "/widget/message") {
      sendCount++;
      if (mode === "send401") return send(res, 401, { error: "expired" });
      if (mode === "hang") return; // never respond — exercises the timeout
      // Slow enough that a second tap would overlap if concurrency were allowed.
      await new Promise((r) => setTimeout(r, 1200));
      const body = await new Promise((resolve) => {
        let d = "";
        req.on("data", (c) => (d += c));
        req.on("end", () => resolve(JSON.parse(d || "{}")));
      });
      return send(res, 200, [
        { _id: `u${sendCount}`, id: `u${sendCount}`, conversation: "conv-123", sender: "user", type: "text", payload: { text: body.text }, createdAt: new Date().toISOString() },
        { _id: `a${sendCount}`, id: `a${sendCount}`, conversation: "conv-123", sender: "agent", type: "text", payload: { text: `reply ${sendCount}` }, createdAt: new Date().toISOString() },
      ]);
    }

    if (url.pathname === "/" ) return send(res, 200, HOST_PAGE, "text/html");

    // static: the real built UI
    let rel = url.pathname.replace(/^\/chat-widget\/?/, "") || "index.html";
    if (!path.extname(rel)) rel = "index.html";
    const file = path.join(DIST, rel);
    if (!fs.existsSync(file)) return send(res, 404, "not found", "text/plain");
    const types = { ".js": "application/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml" };
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
  })
  .listen(4700, () => console.log("ready"));
