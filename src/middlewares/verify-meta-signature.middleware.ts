import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import logger from "../lib/logger";

/**
 * Verify a Meta webhook's `X-Hub-Signature-256`: an HMAC-SHA256 of the RAW
 * request body using the app secret. This is the only proof a webhook actually
 * came from Meta (the GET verify-token only protects subscription, not POSTs).
 *
 * Requires the raw body to be captured upstream (express.json({ verify })).
 *
 * FAILS CLOSED. The previous version let every POST through when the secret was
 * not configured, "so deploying this can't break the live bot before
 * META_APP_SECRET is set". In production the secret was a placeholder, which
 * the secret fetcher drops, so the app saw "" and the Instagram and Facebook
 * endpoints accepted unsigned bodies from anyone (verified 2026-09-17: an empty
 * JSON POST returned 200). Each such body runs the full LLM pipeline and is
 * written into the conversation history of whatever user id the caller names.
 * A channel that is not configured must be a channel that is switched off.
 */
const PLACEHOLDERS = new Set(["", "SET_ME", "PLACEHOLDER_SET_ME", "CHANGE_ME"]);

export function verifyMetaSignature(secret: string) {
  const configured = typeof secret === "string" && !PLACEHOLDERS.has(secret.trim());
  let warned = false;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!configured) {
      if (!warned) {
        warned = true;
        logger.warn(
          "[webhook] App Secret not set: rejecting every inbound POST on this route (fail closed). Set META_APP_SECRET / FACEBOOK_APP_SECRET / INSTAGRAM_APP_SECRET before enabling the channel.",
        );
      }
      res.sendStatus(401);
      return;
    }
    const signature = req.header("x-hub-signature-256") || "";
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!signature || !raw) {
      res.sendStatus(401);
      return;
    }
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      logger.warn("[webhook] invalid X-Hub-Signature-256: rejecting forged/altered payload");
      res.sendStatus(401);
      return;
    }
    next();
  };
}
