import { type Request, type Response } from "express";

import { config } from "../config/env";
import { processCustomerMessage } from "../lib/chat-orchestrator";
import { logError } from "../lib/utils";
import { sendSalesReply, sendText } from "../lib/whatsapp";

const MODE = "subscribe";

export const subscribeWebhookController = async (req: Request, res: Response) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token && mode === MODE && token === config.whatsapp.verifyToken) {
      console.log("WhatsApp webhook verified");
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  } catch {
    return res.sendStatus(500);
  }
};

/** Main WhatsApp webhook — uses shared chat orchestrator. */
export async function metaWebhookController(req: Request, res: Response): Promise<void> {
  try {
    const message = res.locals.message;

    if (!message || message?.type !== "text_message") {
      res.sendStatus(200);
      return;
    }

    const phone = message?.from?.phone;
    if (!phone) {
      res.sendStatus(200);
      return;
    }

    const text = message.text.body as string;

    try {
      const result = await processCustomerMessage({
        userId: phone,
        userName: message.from.name,
        text,
        messageId: message.message_id,
        channel: "whatsapp",
      });

      await sendSalesReply(
        {
          message: result.message,
          productImageLink: result.productImageLink,
          buttons: result.buttons,
        },
        phone
      );
    } catch (err: unknown) {
      logError("[whatsapp]", err);
      await sendText({
        message: "Sorry, I'm having a bit of trouble right now. Please try again in a moment.",
        recipientPhone: phone,
      }).catch(() => {});
    }

    res.sendStatus(200);
  } catch (error: unknown) {
    logError("[whatsapp] top-level", error);
    if (!res.headersSent) res.sendStatus(200);
  }
}
