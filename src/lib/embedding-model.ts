import { ModelRouterEmbeddingModel } from "@mastra/core/llm"

import { config } from "../config/env";

let embeddingModel: ModelRouterEmbeddingModel | undefined

export function getEmbeddingModel() {
  if (!config.groq.apiKey) {
    throw new Error(
      "[embeddingModel] Embeddings are not configured for Groq. Set OPENAI_API_KEY if you enable vector search."
    )
  }

  if (!embeddingModel) {
    embeddingModel = new ModelRouterEmbeddingModel("openai/text-embedding-3-small")
  }

  return embeddingModel
}
