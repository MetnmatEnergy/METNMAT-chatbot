import puppeteer from "puppeteer-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:4700";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});

const setMode = (m) => fetch(`${BASE}/__mode/${m}`).then((r) => r.json());
const stats = () => fetch(`${BASE}/__stats`).then((r) => r.json());

async function openChat() {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 800 });
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  const frame = page.frames().find((f) => f.url().includes("/chat-widget"));
  return { page, frame };
}

const text = (frame) => frame.evaluate(() => document.body.innerText);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  (ok ? pass++ : fail++), console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

// ── H1: a 429 on session must surface an error with a retry, not a forever spinner
console.log("\nH1 — session failure");
await setMode("session429");
{
  const { page, frame } = await openChat();
  await new Promise((r) => setTimeout(r, 1500));
  const t = await text(frame);
  check("shows an error, not a spinner", /unavailable/i.test(t), t.split("\n")[0]?.slice(0, 60));
  check("offers a retry", /try again/i.test(t));
  check("offers a way out", /close/i.test(t));
  check("does not say 'Loading chat'", !/loading chat/i.test(t));

  // recovering: flip the API healthy and press Try again
  await setMode("ok");
  await frame.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /try again/i.test(b.textContent))?.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  const t2 = await text(frame);
  check("retry recovers into a working chat", !/unavailable/i.test(t2));
  await page.close();
}

// ── H5: a 401 on send must keep the message, mark it, and offer retry
console.log("\nH5 — send failure");
await setMode("ok");
{
  const { page, frame } = await openChat();
  await setMode("send401");
  await frame.evaluate(() => {
    const ta = document.querySelector("textarea");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, "does this survive a 401");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await frame.evaluate(() => {
    const form = document.querySelector("form");
    if (form) form.requestSubmit();
    else [...document.querySelectorAll("button")].pop()?.click();
  });
  await new Promise((r) => setTimeout(r, 2500));
  const t = await text(frame);
  check("the typed message is still on screen", /does this survive a 401/.test(t));
  check("it is marked as not sent", /not sent/i.test(t));
  check("a retry is offered", /retry/i.test(t));
  check("it is NOT falsely marked Sent", !/• Sent/i.test(t) || /not sent/i.test(t));
  await page.close();
}

// ── H2: two rapid chip taps must not fire two pipelines
console.log("\nH2 — concurrent sends");
await setMode("ok");
{
  const { page, frame } = await openChat();
  await setMode("ok");
  await fetch(`${BASE}/__mode/ok`);
  const before = (await stats()).sendCount;
  // Tap two welcome chips as fast as the DOM allows.
  await frame.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim().length > 8);
    btns[0]?.click();
    btns[1]?.click();
    btns[2]?.click();
  });
  await new Promise((r) => setTimeout(r, 3000));
  const after = (await stats()).sendCount;
  check("only one request reached the server", after - before === 1, `sent ${after - before}`);
  const t = await text(frame);
  const orphanReply = /reply \d/.test(t);
  check("the reply has its question above it", !orphanReply || t.indexOf("reply") > 40);
  await page.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
