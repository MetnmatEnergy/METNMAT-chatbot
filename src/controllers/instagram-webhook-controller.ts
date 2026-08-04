import { type Request, type Response } from "express"

import { config } from "../config/env"
import logger from "../lib/logger"
import { processIncomingCustomerMessage } from "./webhook-events-controller"

const INSTAGRAM_MODE = "subscribe"

export const verifyInstagramWebhook = async (req: Request, res: Response) => {
  try {
    const mode = req.query["hub.mode"]
    const token = req.query["hub.verify_token"]
    const challenge = req.query["hub.challenge"]

    if (
      mode &&
      token &&
      mode === INSTAGRAM_MODE &&
      token === config.instagram.verifyToken
    ) {
      logger.info("GET Instagram webhook verification succeeded")
      return res.status(200).send(challenge)
    }

    logger.warn("GET Instagram webhook verification failed")
    return res.sendStatus(403)
  } catch (error) {
    logger.error("Error verifying Instagram webhook", { error })
    return res.sendStatus(500)
  }
}

export const handleInstagramWebhook = async (req: Request, res: Response) => {
  try {
    logger.info("Instagram webhook payload received", {
      rawBody: JSON.stringify(req.body, null, 2),
    })

    const body = req.body

    // Immediately acknowledge receipt to Meta
    res.sendStatus(200)

    if (!body?.entry || !Array.isArray(body.entry)) {
      logger.warn("Instagram webhook received payload without entry array")
      return
    }

    for (const entry of body.entry) {
      const messagingEvents = [
        ...(entry.messaging || []),
        ...(entry.standby || []),
      ]

      for (const event of messagingEvents) {
        const senderId = event?.sender?.id as string | undefined
        const message = event?.message

        if (!senderId || !message) {
          continue
        }

        const text = typeof message.text === "string" ? message.text : undefined
        if (!text) {
          // Ignore non-text messages for now
          continue
        }

        try {
          await processIncomingCustomerMessage({
            platform: "instagram",
            userId: senderId,
            userName: "Instagram User",
            text,
            messageId: message?.mid || message?.id || undefined,
          })
        } catch (err) {
          const error = err as any

          logger.error("Error processing Instagram message", {
            senderId,
            text,
            messageId: message?.mid || message?.id,
            platform: "instagram",
            errorMessage: error?.message,
            errorStack: error?.stack,
            errorResponseStatus: error?.response?.status,
            errorResponseData: error?.response?.data,
          })
        }
      }
    }
  } catch (error) {
    logger.error("Error handling Instagram webhook", { error })
  }
}

export default handleInstagramWebhook


