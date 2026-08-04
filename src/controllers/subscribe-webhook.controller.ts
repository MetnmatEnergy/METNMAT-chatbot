import { type Request, type Response } from "express";

import { config } from "../config/env";

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
