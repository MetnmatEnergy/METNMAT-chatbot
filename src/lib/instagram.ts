import axios from "axios"

import { config } from "../config/env"
import logger from "./logger"

const INSTAGRAM_API_URL = "https://graph.facebook.com/v24.0/me/messages"

export async function sendInstagramMessage(userId: string, text: string) {
  try {
    const payload = {
      recipient: {
        id: userId,
      },
      message: {
        text,
      },
      messaging_type: "RESPONSE",
      tag: "ACCOUNT_UPDATE",
    }

    const params = {
      access_token: config.instagram.accessToken,
    }

    await axios.post(INSTAGRAM_API_URL, payload, {
      params,
      timeout: 10_000,
    })

    logger.info("Sent Instagram message", {
      userId,
    })
  } catch (error: any) {
    logger.error("Failed to send Instagram message", {
      error: error?.response?.data || error?.message || error,
      userId,
    })
    throw error
  }
}

