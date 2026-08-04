import { processCustomerMessage } from "../lib/chat-orchestrator";
import { sendText as sendFacebookText } from "../lib/facebook";
import { sendInstagramMessage } from "../lib/instagram";
import logger from "../lib/logger";
import connectToDb from "../lib/connect-to-db";

export type IncomingPlatform = "facebook" | "instagram";

export type IncomingCustomerMessage = {
  platform: IncomingPlatform;
  userId: string;
  userName?: string;
  text: string;
  messageId?: string;
};

/** Unified handler for Facebook Messenger and Instagram DMs. */
export async function processIncomingCustomerMessage(msg: IncomingCustomerMessage): Promise<void> {
  const { platform, userId, userName, text, messageId } = msg;

  await connectToDb();

  const result = await processCustomerMessage({
    userId,
    userName: userName ?? `${platform} User`,
    text,
    messageId: messageId ?? `${platform}-${Date.now()}`,
    channel: platform,
  });

  const outbound = result.message;

  if (platform === "facebook") {
    await sendFacebookText(userId, outbound);
  } else {
    await sendInstagramMessage(userId, outbound);
  }

  logger.info(`${platform} reply sent`, { userId, preview: outbound.slice(0, 80) });
}
