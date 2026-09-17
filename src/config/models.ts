/**
 * DeepSeek models via the Mastra model router (requires DEEPSEEK_API_KEY).
 *
 * Swapped from OpenAI on 2026-09-17: the OpenAI account has no billing, while
 * the Command Center already runs DeepSeek in production. Mastra reaches
 * DeepSeek through its generic OpenAI-compatible transport (registry entry
 * `https://api.deepseek.com`, key from DEEPSEEK_API_KEY) and passes any model id
 * through, so the ids below are not limited to the two its bundled registry
 * happens to list. Verified against @mastra/core 1.4.0 (bun.lock, production)
 * and 1.8.0.
 *
 * What this bot needs from a model, and what DeepSeek does and does not offer:
 *   - Every structured reply uses `jsonPromptInjection: true` (the schema goes
 *     into the prompt and the JSON is parsed back out of the text), so the bot
 *     never relied on native json_schema output. DeepSeek only has
 *     `json_object`, which is therefore not a gap here.
 *   - Tool calls (product-retriever, tickets, profile) go over the OpenAI-shaped
 *     chat completions API, which DeepSeek supports (non-strict).
 *   - DeepSeek has no embeddings API. The old openai/text-embedding-3-small
 *     model was declared and never called anywhere; it is gone.
 *
 * Ids: `deepseek-flash` is DeepSeek-V4.1-Flash, the current default on
 * DeepSeek's pricing page. The Command Center runs
 * `deepseek-v4-flash-vision-exp` (same pricing, vision-capable); either works
 * for text. Override per environment with DEEPSEEK_MODEL (primary/heavy) and
 * DEEPSEEK_FAST_MODEL (fast), with or without the `deepseek/` prefix.
 */
const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";

/** Mastra model config for one DeepSeek id, honouring an env override. */
function deepseekModel(envVar: string, fallback: string): { id: `deepseek/${string}` } {
  const raw = process.env[envVar]?.trim();
  const id = raw && raw.length > 0 ? raw.replace(/^deepseek\//, "") : fallback;
  return { id: `deepseek/${id}` };
}

export const LLM_MODELS = {
  primary: deepseekModel("DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL),
  heavy: deepseekModel("DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL),
  fast: deepseekModel("DEEPSEEK_FAST_MODEL", DEFAULT_DEEPSEEK_MODEL),
} as const;

/**
 * Passed on every generate() call.
 *
 * DeepSeek's V4 models REASON before answering and bill those tokens against the
 * same max_tokens as the answer. Left on, a short budget returns reasoning and an
 * EMPTY `content`: the Command Center measured this live (max_tokens=5 gave
 * content "" and finish_reason "length") and disables thinking by default. This
 * bot does the same; Mastra forwards `providerOptions.deepseek` into the request
 * body as DeepSeek's `thinking` field. DEEPSEEK_THINKING=on re-enables it, for
 * diagnosis only.
 */
export const DEEPSEEK_PROVIDER_OPTIONS = {
  deepseek: {
    thinking: {
      type: process.env.DEEPSEEK_THINKING?.trim().toLowerCase() === "on" ? "enabled" : "disabled",
    },
  },
};
