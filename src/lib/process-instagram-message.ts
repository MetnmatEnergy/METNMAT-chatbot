import { mastra } from "../mastra"
import logger from "./logger"
import { sendInstagramMessage } from "./instagram"

interface NormalizedInstagramMessage {
  channel: "instagram"
  userId: string
  text: string
}

export async function processInstagramMessage(
  message: NormalizedInstagramMessage
) {
  const { userId, text, channel } = message

  if (!text || !text.trim()) {
    logger.info("Ignored non-text Instagram message", {
      userId,
      channel,
    })
    return
  }

  try {
    const agent = mastra.getAgent("customerCommunicationAgent")

    logger.info("Processing Instagram message", {
      channel,
      userId,
    })

    const response = await agent.generate(text)

    const reply =
      typeof response.outputText === "string"
        ? response.outputText
        : String(response.outputText ?? "").trim()

    if (!reply) {
      logger.warn("Empty response from customerCommunicationAgent for Instagram", {
        userId,
      })
      return
    }

    await sendInstagramMessage(userId, reply)
  } catch (error) {
    logger.error("Error in processInstagramMessage", {
      error,
      userId,
      channel,
    })
  }
}


