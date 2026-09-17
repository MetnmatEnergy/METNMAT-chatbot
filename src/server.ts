import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";

import { config, assertConfig } from "./config/env";
import connectToDb from "./lib/connect-to-db";
import { ensureProductsSeeded } from "./lib/seed-products";
import whatsappRouter from "./routes/whatsapp.routes";
import widgetRouter from "./routes/widget.routes";
import metaSocialRouter from "./routes/meta-social.routes";
import { rateLimit } from "./lib/rate-limit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.app.port;
// Behind Caddy on the v2 host the service must not be reachable from other
// machines in the VPC (it was listening on every interface). Containers and
// local dev keep the wide-open default; production sets BIND_HOST=127.0.0.1.
const BIND_HOST = process.env.BIND_HOST?.trim() || "0.0.0.0";
// The framework banner is free information for an attacker.
app.disable("x-powered-by");
const PUBLIC_URL = config.app.publicUrl;

const WIDGET_PATH = path.join(__dirname, "../iframe-chat-widget/widget/dist");
const UI_PATH = path.join(__dirname, "../iframe-chat-widget/iframe-ui/dist");
const PUBLIC_PATH = path.join(__dirname, "../public");

const allowedOrigins = config.app.allowedOrigins;

/**
 * Compress responses. Mounted FIRST so it wraps everything below, including the
 * two static mounts that serve the chat bundle.
 *
 * Nothing was compressing this service at all. Measured against production:
 *
 *   GET /chat-widget/assets/index-*.js   accept-encoding: gzip, br
 *   → no content-encoding header, content-length: 356216
 *
 * Express does not compress by default and Cloud Run does not do it for you, so
 * every first-time visitor downloaded 356 KB of JavaScript that gzips to about
 * 114 KB. One line is worth more here than any code splitting available in this
 * bundle.
 *
 * The default filter already skips what should not be compressed — anything
 * already encoded, images, fonts — and honours `Cache-Control: no-transform`.
 */
app.use(compression());

// Baseline response headers. The chat UI route below replaces X-Frame-Options
// with its frame-ancestors policy; everything else is not meant to be framed.
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  })
);
// Capture the raw body so Meta webhook signatures (HMAC over the raw bytes) can
// be verified. The parsed JSON is still available as req.body downstream.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);
app.use(express.static(WIDGET_PATH));
app.use(express.static(PUBLIC_PATH));

/** Allow the chat UI iframe to load only on the configured embedding origins. */
function allowWidgetIframe(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Content-Security-Policy", `frame-ancestors ${config.app.frameAncestors}`);
  res.removeHeader("X-Frame-Options");
  next();
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    message: "OK",
    brand: "Metnmat",
    status: "ready",
    widget: `${PUBLIC_URL}/widget.js`,
    demo: `${PUBLIC_URL}/demo`,
  });
});

/** Copy-paste embed snippet for metnmat.com */
app.get("/integrate", (_req: Request, res: Response) => {
  const snippet = `<script src="${PUBLIC_URL}/widget.js" data-site-key="metnmat-main"></script>`;
  res.type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Metnmat Widget — Integrate</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 24px;color:#0f172a}
pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:12px;overflow-x:auto;font-size:14px}
button{margin-top:12px;padding:10px 18px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px}
p{color:#475569;line-height:1.6}a{color:#2563eb}</style></head><body>
<h1>Embed on metnmat.com</h1>
<p>Paste this line <strong>before</strong> the closing <code>&lt;/body&gt;</code> tag on every page where you want the chat button:</p>
<pre id="code">${snippet.replace(/</g, "&lt;")}</pre>
<button type="button" onclick="navigator.clipboard.writeText(document.getElementById('code').textContent);this.textContent='Copied!'">Copy snippet</button>
<p><a href="/demo">Open live demo</a> · <a href="/health">Health check</a></p>
</body></html>`);
});

app.get("/demo", (_req: Request, res: Response) => {
  res.sendFile(path.join(PUBLIC_PATH, "demo.html"));
});

// Meta delivers in bursts from a handful of addresses; 120/min per address is
// far above current volume and stops a forged-webhook flood from driving the
// LLM at our cost. Signature checks still run first inside each router.
app.use("/api/webhook", rateLimit({ keyPrefix: "webhook", limit: 120, windowMs: 60_000 }));
app.use("/api/webhook", whatsappRouter);
app.use("/api/webhook", metaSocialRouter);
app.use("/widget", widgetRouter);

app.get("/widget.js", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.sendFile(path.join(WIDGET_PATH, "widget.js"));
});

app.use("/chat-widget", allowWidgetIframe, express.static(UI_PATH));

async function startServer() {
  try {
    assertConfig(); // fail-fast on missing/insecure prod env before accepting traffic
    await connectToDb();
    await ensureProductsSeeded();

    app.listen(Number(PORT), BIND_HOST, () => {
      console.log(`Metnmat chatbot running on ${PUBLIC_URL}`);
      console.log(`  Health:    ${PUBLIC_URL}/health`);
      console.log(`  Demo:      ${PUBLIC_URL}/demo`);
      console.log(`  Integrate: ${PUBLIC_URL}/integrate`);
      console.log(`  Widget:    ${PUBLIC_URL}/widget.js`);
      console.log(`  WhatsApp:  POST ${PUBLIC_URL}/api/webhook/meta`);
    });
  } catch (error) {
    console.error("Failed to start server", { error });
    process.exit(1);
  }
}

void startServer();
