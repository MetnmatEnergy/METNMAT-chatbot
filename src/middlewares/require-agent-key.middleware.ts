import { type Request, type Response, type NextFunction } from "express";
import { config } from "../config/env";

/**
 * Gate agent/staff-only endpoints (mint an agent token, list all conversations)
 * behind the AGENT_API_KEY presented as `x-agent-key`. Without the key set, the
 * endpoint is DISABLED (fail closed) — far safer than the previous wide-open
 * access that let anyone dump customer chats or mint an agent-role token.
 */
export function requireAgentKey(req: Request, res: Response, next: NextFunction): void {
  const key = config.app.agentApiKey;
  if (!key) {
    res.status(503).json({ error: "Agent access is not configured." });
    return;
  }
  if (req.header("x-agent-key") !== key) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
