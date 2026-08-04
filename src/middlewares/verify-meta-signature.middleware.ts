import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import logger from "../lib/logger";

/**
 * Verify a Meta webhook's `X-Hub-Signature-256` — an HMAC-SHA256 of the RAW
 * request body using the app secret. This is the only proof a webhook actually
 * came from Meta (the GET verify-token only protects subscription, not POSTs).
 *
 * Requires the raw body to be captured upstream (express.json({ verify })).
 *
 * Rollout-safe: if the secret isn't configured yet, it logs a loud warning and
 * lets the request through, so deploying this can't break the live bot before
 * META_APP_SECRET is set. Once the secret is present, forged POSTs get 401.
 */
export function verifyMetaSignature(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!secret) {
      logger.warn(
        "[webhook] App Secret not set — skipping signature verification (INSECURE). Set META_APP_SECRET.",
      );
      next();
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
      logger.warn("[webhook] invalid X-Hub-Signature-256 — rejecting forged/altered payload");
      res.sendStatus(401);
      return;
    }
    next();
  };
}
