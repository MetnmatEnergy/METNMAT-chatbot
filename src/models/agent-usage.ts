import mongoose, { type Document, type Model, Schema } from "mongoose";

/**
 * Token usage as returned by Mastra/LLM (agent.generate result.usage).
 */
export interface AgentUsageDoc {
  agentName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  /** Optional: user phone for request context */
  userPhone?: string;
}

export type AgentUsageDocument = AgentUsageDoc & Document;

const AgentUsageSchema = new Schema<AgentUsageDocument>(
  {
    agentName: { type: String, required: true },
    inputTokens: { type: Number, required: true },
    outputTokens: { type: Number, required: true },
    totalTokens: { type: Number, required: true },
    reasoningTokens: { type: Number },
    cachedInputTokens: { type: Number },
    userPhone: { type: String },
  },
  { collection: "agent_usage", timestamps: true }
);

AgentUsageSchema.index({ agentName: 1 });
AgentUsageSchema.index({ createdAt: -1 });

export const AgentUsageModel: Model<AgentUsageDocument> =
  (mongoose.models?.AgentUsage as Model<AgentUsageDocument>) ??
  mongoose.model<AgentUsageDocument>("AgentUsage", AgentUsageSchema);
