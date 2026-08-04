import { type Request, type Response } from "express";

import { parseIncoming, sendText } from "../lib/facebook";
import { config } from "../config/env";
import logger from "../lib/logger";
import { processIncomingCustomerMessage } from "./webhook-events-controller";

export const verifyFacebookWebhook = async (req: Request, res: Response) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === config.facebook.verifyToken) {
      logger.info("Facebook webhook verified");
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  } catch (error) {
    logger.error("Facebook verify error", error);
    return res.sendStatus(403);
  }
};

export const handleFacebookWebhook = async (req: Request, res: Response) => {
  res.sendStatus(200);

  try {
    const parsed = parseIncoming(req.body);
    if (!parsed.isMessage || !parsed.senderId || !parsed.messageText) return;

    await processIncomingCustomerMessage({
      platform: "facebook",
      userId: parsed.senderId,
      userName: "Facebook User",
      text: parsed.messageText,
      messageId: parsed.messageId,
    });
  } catch (error) {
    logger.error("Facebook webhook error", error);
    if (parsedSafeSender(req.body)) {
      await sendText(parsedSafeSender(req.body)!, "Sorry, something went wrong. Please try again.").catch(() => {});
    }
  }
};

function parsedSafeSender(body: unknown): string | null {
  try {
    const p = parseIncoming(body as Parameters<typeof parseIncoming>[0]);
    return p.senderId ?? null;
  } catch {
    return null;
  }
}
