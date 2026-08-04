import axios, { type AxiosInstance } from "axios"
import { config } from "../config/env"
import logger from "./logger"

export interface FacebookWebhookEntry {
  id: string
  time: number
  messaging: Array<{
    sender: {
      id: string
    }
    recipient: {
      id: string
    }
    timestamp: number
    message?: {
      mid: string
      text?: string
    }
  }>
}

export interface FacebookWebhookBody {
  object: string
  entry: FacebookWebhookEntry[]
}

export interface ParsedFacebookMessage {
  senderId: string
  messageText: string
  messageId: string
  timestamp: number
  isMessage: boolean
}

export const FACEBOOK_API: AxiosInstance = axios.create({
  baseURL: `https://graph.facebook.com/${config.facebook.graphApiVersion}`,
  headers: {
    "Content-Type": "application/json",
  },
})

/**
 * Parse incoming Facebook Messenger webhook payload
 * Extracts sender PSID, message text, message id, and timestamp
 * Returns a normalized object similar to WhatsApp parsed output
 */
export function parseIncoming(body: FacebookWebhookBody): ParsedFacebookMessage {
  try {
    // Facebook webhook structure
    if (body.object !== "page") {
      return {
        senderId: "",
        messageText: "",
        messageId: "",
        timestamp: 0,
        isMessage: false,
      }
    }

    if (!body.entry || body.entry.length === 0) {
      return {
        senderId: "",
        messageText: "",
        messageId: "",
        timestamp: 0,
        isMessage: false,
      }
    }

    const entry = body.entry[0]
    if (!entry) {
      return {
        senderId: "",
        messageText: "",
        messageId: "",
        timestamp: 0,
        isMessage: false,
      }
    }

    if (!entry.messaging || entry.messaging.length === 0) {
      return {
        senderId: "",
        messageText: "",
        messageId: "",
        timestamp: 0,
        isMessage: false,
      }
    }

    const messaging = entry.messaging[0]
    if (!messaging) {
      return {
        senderId: "",
        messageText: "",
        messageId: "",
        timestamp: 0,
        isMessage: false,
      }
    }

    // Only process text messages
    if (!messaging.message || !messaging.message.text) {
      return {
        senderId: "",
        messageText: "",
        messageId: "",
        timestamp: 0,
        isMessage: false,
      }
    }

    return {
      senderId: messaging.sender.id,
      messageText: messaging.message.text,
      messageId: messaging.message.mid,
      timestamp: messaging.timestamp,
      isMessage: true,
    }
  } catch (err) {
    logger.error("Error parsing Facebook webhook:", err)
    return {
      senderId: "",
      messageText: "",
      messageId: "",
      timestamp: 0,
      isMessage: false,
    }
  }
}

/**
 * Send a text message using Facebook Graph API
 * Uses FACEBOOK_PAGE_ACCESS_TOKEN
 * Handles errors with logging (does not throw)
 */
export async function sendText(recipientId: string, text: string): Promise<void> {
  try {
    const pageAccessToken = config.facebook.pageAccessToken

    if (!pageAccessToken) {
      logger.error("FACEBOOK_PAGE_ACCESS_TOKEN is not configured")
      return
    }

    const response = await FACEBOOK_API.post(
      "/me/messages",
      {
        recipient: {
          id: recipientId,
        },
        message: {
          text: text,
        },
      },
      {
        params: {
          access_token: pageAccessToken,
        },
      }
    )

    logger.info(`Facebook message sent to ${recipientId}: ${text.substring(0, 50)}...`)
    return response.data
  } catch (err: any) {
    logger.error("Error sending Facebook message:", err.response?.data || err.message)
    // Do not throw - handle errors gracefully
  }
}

