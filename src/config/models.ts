/** OpenAI models via the Mastra model router (requires OPENAI_API_KEY). */
export const LLM_MODELS = {
  // Structured output is the binding constraint, not raw quality. The
  // product-retriever (shopping companion) flows depend on native json_schema
  // support: the previous fast model, groq/llama-3.1-8b-instant, did NOT support
  // it and emitted malformed tool calls, which broke those flows. Both models
  // below support structured outputs, so `fast` is now safe to use in the same
  // paths as `primary` — which was not true before.
  primary: "openai/gpt-4o",
  heavy: "openai/gpt-4o",
  fast: "openai/gpt-4o-mini",
} as const;
