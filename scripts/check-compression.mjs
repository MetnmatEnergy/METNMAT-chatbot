/**
 * Verifies the compression middleware actually compresses the real chat bundle,
 * mounted exactly as server.ts mounts it: compression() first, then the statics.
 *
 * Uses node:http directly rather than fetch. undici transparently decompresses
 * and injects its own accept-encoding, so fetch cannot measure wire bytes or
 * test the identity case — an earlier version of this script reported a false
 * failure for exactly that reason.
 *
 * Deliberately does NOT boot the real service: that calls assertConfig(),
 * connectToDb() and ensureProductsSeeded() against the production MongoDB
 * before it listens.
 */
import express from "express";
import compression from "compression";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";

const ROOT = "C:/Users/ritik/OneDrive/Desktop/Metnmat-customer-agent-main";
const UI_PATH = path.join(ROOT, "iframe-chat-widget/iframe-ui/dist");
const WIDGET_PATH = path.join(ROOT, "iframe-chat-widget/widget/dist");

const mount = (app) => {
  app.use(express.static(WIDGET_PATH));
  app.use("/chat-widget", express.static(UI_PATH));
  return app;
};

const withC = express();
withC.use(compression());
mount(withC);

const withoutC = mount(express()); // control: identical minus the one line

const listen = (app, port) => new Promise((r) => { const s = app.listen(port, () => r(s)); });
const a = await listen(withC, 4810);
const b = await listen(withoutC, 4811);

/** Raw request: counts the bytes that actually cross the socket. */
const probe = (port, url, acceptEncoding) =>
  new Promise((resolve) => {
    const req = http.request(
      { host: "localhost", port, path: url, headers: { "accept-encoding": acceptEncoding } },
      (res) => {
        let bytes = 0;
        res.on("data", (c) => (bytes += c.length));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            encoding: res.headers["content-encoding"] || "none",
            wire: bytes,
            type: res.headers["content-type"],
          }),
        );
      },
    );
    req.end();
  });

const bundle = fs.readdirSync(path.join(UI_PATH, "assets")).find((f) => f.endsWith(".js"));
const targets = [`/chat-widget/assets/${bundle}`, "/widget.js"];

let failures = 0;
for (const url of targets) {
  const before = await probe(4811, url, "gzip, br");
  const gzip = await probe(4810, url, "gzip");
  const identity = await probe(4810, url, "identity");

  const saved = before.wire - gzip.wire;
  const pct = Math.round((saved / before.wire) * 100);

  console.log(`\n${url}`);
  console.log(`  before (no middleware)      : ${before.encoding.padEnd(8)} ${before.wire} bytes`);
  console.log(`  after  (accept gzip)        : ${gzip.encoding.padEnd(8)} ${gzip.wire} bytes`);
  console.log(`  saved                       : ${saved} bytes (${pct}%)`);
  console.log(`  client sending 'identity'   : ${identity.encoding} @ ${identity.wire} bytes`);

  const ok =
    gzip.encoding !== "none" &&
    gzip.wire < before.wire &&
    identity.encoding === "none" &&
    identity.wire === before.wire;
  if (!ok) failures++;
  console.log(`  RESULT: ${ok ? "PASS" : "FAIL"}`);
}

a.close();
b.close();
console.log(`\n${failures ? `${failures} FAILED` : "all passed"}`);
process.exit(failures ? 1 : 0);
