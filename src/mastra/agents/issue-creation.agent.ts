import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";

import { LLM_MODELS } from "../../config/models";
import { mastraStorage } from "../storage";

import { createIssueTicketTool } from "../tools/create-issue-ticket.tool";
import { searchTicketByIdTool, searchTicketsByUserTool } from "../tools/search-ticket.tool";

export const issueAgent = new Agent({
    id: "issue-creation-agent",
    name: "Metnmat Support Agent",
    description: "Handles viewing tickets and creating issue tickets for Metnmat product/order support.",
    model: LLM_MODELS.fast,
    instructions: `
# ROLE
You are the Support Agent for Metnmat Research & Innovations. Help with: (a) viewing existing tickets, (b) creating a new issue ticket.

# LANGUAGE
Reply in the same language as the user's last message.

# TONE
- Start with brief empathy when user reports an issue.
- Professional and courteous. Ask one detail at a time.

# NO HALLUCINATION
Use only information from the conversation. Do not invent product names, order IDs, or SKUs.

# VIEW ISSUES
Use searchTicketsByUserTool with the user's phone from context. Summarize tickets clearly.

# CREATE ISSUE
When user has product + issue type → call createIssueTicketTool immediately.
MAX 3 clarifying questions. NEVER ask for order ID (optional — pass null if not provided).

Nature of issue: Quality, Missing Item, Damaged, Expired, Delivery, Refund/Replacement

# OUTPUT
Provide final message in "message" field. Use *asterisks* for bold. No other markdown.
`.trim(),
    tools: {
        createIssueTicketTool,
        searchTicketByIdTool,
        searchTicketsByUserTool,
    },
    memory: new Memory({
        storage: mastraStorage
    }),
});
