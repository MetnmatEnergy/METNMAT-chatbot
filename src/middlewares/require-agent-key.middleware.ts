import { type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { config } from "../config/env";

/**
 * Gate agent/staff-only endpoints (mint an agent token, list all conversations)
 * behind the AGENT_API_KEY presented as `x-agent-key`. Without the key set, the
 * endpoint is DISABLED (fail closed), far safer than the previous wide-open
 * access that let anyone dump customer chats or mint an agent-role token.
 *
 * Constant-time compare: a plain `!==` returns as soon as the first byte
 * differs, which leaks the matching-prefix length through response timing.
 */
export function requireAgentKey(req: Request, res: Response, next: NextFunction): void {
  const key = config.app.agentApiKey;
  if (!key) {
    res.status(503).json({ error: "Agent access is not configured." });
    return;
  }
  const provided = Buffer.from(req.header("x-agent-key") || "");
  const expected = Buffer.from(key);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
