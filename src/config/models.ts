/** Groq models via Mastra model router (requires GROQ_API_KEY). */
export const LLM_MODELS = {
  // 70b-versatile is the default: 8b-instant does NOT support native json_schema
  // structured output and frequently emits malformed tool calls, which breaks the
  // product-retriever (shopping companion) flows. 70b handles both reliably.
  // Free-tier caveat: 70b has a 100k tokens/DAY cap — upgrade Groq before launch.
  primary: "groq/llama-3.3-70b-versatile",
  heavy: "groq/llama-3.3-70b-versatile",
  fast: "groq/llama-3.1-8b-instant",
} as const;
