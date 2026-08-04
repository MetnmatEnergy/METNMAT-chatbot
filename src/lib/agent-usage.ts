import { AgentUsageModel } from "../models/agent-usage";

/**
 * Usage shape from Mastra agent.generate() result.usage
 */
export interface AgentUsageInput {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

/**
 * Records token usage for an agent run in the agent_usage collection.
 * Fire-and-forget; logs and swallows errors so the main flow is not affected.
 */
export async function recordAgentUsage(
  agentName: string,
  usage: AgentUsageInput | undefined,
  context?: { userPhone?: string }
): Promise<void> {
  if (!usage) return;

  const inputTokens = Number(usage.inputTokens) || 0;
  const outputTokens = Number(usage.outputTokens) || 0;
  const totalTokens = Number(usage.totalTokens) || inputTokens + outputTokens;

  try {
    await AgentUsageModel.create({
      agentName,
      inputTokens,
      outputTokens,
      totalTokens,
      reasoningTokens: usage.reasoningTokens != null ? Number(usage.reasoningTokens) : undefined,
      cachedInputTokens: usage.cachedInputTokens != null ? Number(usage.cachedInputTokens) : undefined,
      userPhone: context?.userPhone,
    });
  } catch (err) {
    console.error("[recordAgentUsage]", agentName, err);
  }
}
