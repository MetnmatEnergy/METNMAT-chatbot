import { ModelRouterEmbeddingModel } from "@mastra/core/llm"

import { config } from "../config/env";

let embeddingModel: ModelRouterEmbeddingModel | undefined

export function getEmbeddingModel() {
  // Was gated on config.groq.apiKey while instantiating an OPENAI embedding
  // model — so with a Groq key and no OpenAI key this passed the check and then
  // failed inside the router. Its own message said "Set OPENAI_API_KEY", which
  // is the key it always actually needed.
  if (!config.openai.apiKey) {
    throw new Error(
      "[embeddingModel] OPENAI_API_KEY is not set — required for vector search embeddings."
    )
  }

  if (!embeddingModel) {
    embeddingModel = new ModelRouterEmbeddingModel("openai/text-embedding-3-small")
  }

  return embeddingModel
}
