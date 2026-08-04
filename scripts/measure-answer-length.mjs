/**
 * Measures how long the chatbot's answers actually are.
 *
 * Answer length is a product decision, so it needs a number rather than an
 * impression. Run this before and after any change to the sales agent's prompt.
 *
 *   node scripts/measure-answer-length.mjs                        # production
 *   node scripts/measure-answer-length.mjs http://localhost:3001  # local
 *
 * It creates one real widget session and sends a few realistic turns, so it
 * costs a little Groq quota (the 70b model is on a 100k-token/day free tier —
 * see src/config/models.ts). Keep the question list short.
 *
 * Response shape, verified against production:
 *   [ { sender: "user"|"agent", type: "text"|"buttons", payload: { text } } ]
 */
const API = process.argv[2] || "https://chat.metnmat.com";

const QUESTIONS = [
  "what reference electrodes do you have",
  "tell me about the Ag/AgCl electrode",
  "where can I buy it",
];

/**
 * Recorded on 2026-08-04 against production, BEFORE the brevity rules were added
 * to src/mastra/agents/sales.agent.ts. Compare against these.
 *   overview question   574 chars / 78 words / 4 lines
 *   "tell me about X"  1042 chars / 151 words / 10 lines / 4 bullets
 *   average            564 chars / 81 words
 */
const BASELINE = { chars: 564, words: 81 };

const session = await (
  await fetch(`${API}/widget/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteKey: "metnmat-main" }),
  })
).json();

if (!session.token) {
  console.error("no session token:", JSON.stringify(session).slice(0, 200));
  process.exit(1);
}

const countWords = (t) => (t.trim().match(/\S+/g) || []).length;
let chars = 0;
let words = 0;
let answered = 0;

for (const q of QUESTIONS) {
  const res = await fetch(`${API}/widget/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionToken: session.token,
      conversationId: session.conversationId,
      text: q,
    }),
  });
  if (!res.ok) {
    console.log(`\nQ: ${q}\n   HTTP ${res.status}`);
    continue;
  }

  const body = await res.json();
  const msgs = Array.isArray(body) ? body : body.messages || [];
  const answer = msgs
    .filter((m) => m.sender === "agent")
    .map((m) => (m.payload && m.payload.text) || "")
    .join("\n");

  chars += answer.length;
  words += countWords(answer);
  answered++;

  console.log(`\nQ: ${q}`);
  console.log(
    `   ${answer.length} chars, ${countWords(answer)} words, ` +
      `${answer.split("\n").filter(Boolean).length} lines, ` +
      `${(answer.match(/•/g) || []).length} bullets, ` +
      `${(answer.match(/\*[^*\n]+\*/g) || []).length} asterisk-bold runs`,
  );
  console.log(
    answer
      .split("\n")
      .filter(Boolean)
      .slice(0, 5)
      .map((l) => "   | " + l.slice(0, 92))
      .join("\n"),
  );
}

if (answered) {
  const avgChars = Math.round(chars / answered);
  const avgWords = Math.round(words / answered);
  const delta = Math.round(((avgChars - BASELINE.chars) / BASELINE.chars) * 100);
  console.log(`\nAVERAGE over ${answered}: ${avgChars} chars, ${avgWords} words`);
  console.log(`BASELINE (pre-brevity): ${BASELINE.chars} chars, ${BASELINE.words} words`);
  console.log(`CHANGE: ${delta > 0 ? "+" : ""}${delta}% characters`);
}
