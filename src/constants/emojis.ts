/**
 * Allowed emojis for agent replies (WhatsApp). Use only these to keep tone consistent and avoid odd characters.
 */
export const ALLOWED_EMOJIS = [
  "👋", // wave
  "🙏", // namaste / thanks
  "😊", // smile
  "✨", // sparkle
  "🌾", // grain / natural
  "🛒", // cart
  "📦", // package
  "❤️", // heart
  "👍", // thumbs up
  "🌟", // star
] as const;

export type AllowedEmoji = (typeof ALLOWED_EMOJIS)[number];

/** Single line for instructions: "Use only these emojis if you use any: ..." */
export const ALLOWED_EMOJIS_INSTRUCTION = `Use only these emojis if you use any (do not use any other emoji): ${ALLOWED_EMOJIS.join(" ")}. Use at most 1–2 per message; keep it subtle.`;
