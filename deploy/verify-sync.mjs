import { MongoClient } from "mongodb";

const c = new MongoClient(process.env.CHATBOT_MONGODB_URI);
await c.connect();
const col = c.db().collection("products");
const total = await col.countDocuments();
const fuel = await col
  .find({ title: { $regex: "fuel", $options: "i" } })
  .project({ title: 1, category: 1, price: 1, _id: 0 })
  .toArray();
console.log("total products in chatbot DB:", total);
console.log("fuel-cell matches:", JSON.stringify(fuel));
await c.close();

// Ask the LIVE deployed chatbot the question that failed before
const base = "https://metnmat-chatbot-127977052991.asia-south1.run.app";
const s = await fetch(base + "/widget/session", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ siteKey: "metnmat" }),
});
const sj = await s.json();
const t0 = Date.now();
const m = await fetch(base + "/widget/message", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    conversationId: sj.conversationId,
    sessionToken: sj.sessionToken,
    text: "What fuel cell products do you have and their price?",
  }),
});
const mj = await m.json();
const agent = Array.isArray(mj) ? mj[mj.length - 1] : mj;
console.log("\nLIVE BOT reply (" + (Date.now() - t0) + "ms):");
console.log((agent.payload?.text || JSON.stringify(agent)).slice(0, 600));
