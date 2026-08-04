import { ConversationMessageModel } from "../models/conversation-messages";

/** Single message in the format expected by Mastra agent conversation context */
export interface ConversationContextMessage {
  id: string;
  role: string;
  content: string;
  createdAt?: number;
}

/** Last 20 messages within a 24-hour session window. */
const CONTEXT_MESSAGE_LIMIT = 20;
const ID_SLICE_LENGTH = 6;
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Normalize phone for DB query: match with or without leading + so we get the full thread. */
function phoneVariants(phone: string): string[] {
  const normalized = (phone ?? "").trim().replace(/^\+/, "");
  if (!normalized) return [];
  return [normalized, `+${normalized}`];
}

/**
 * Builds recent conversation context for a user by phone number.
 * Returns the last CONTEXT_MESSAGE_LIMIT messages in chronological order for agent consumption.
 * Queries with both phone formats (+X and X) so no messages are missed.
 */
export async function buildContext(phone: string): Promise<ConversationContextMessage[]> {
  const variants = phoneVariants(phone);
  if (variants.length === 0) return [];
  const sessionStart = new Date(Date.now() - SESSION_WINDOW_MS);
  const messages = await ConversationMessageModel.find(
    { "user.phone": { $in: variants }, createdAt: { $gte: sessionStart } },
    { _id: 1, content: 1, role: 1, messageId: 1 }
  )
    .sort({ createdAt: -1 })
    .limit(CONTEXT_MESSAGE_LIMIT)
    .lean();

  return messages
    .map((msg) => ({
      id: msg.messageId || String(msg._id),
      role: msg.role,
      content: msg.content?.text ?? "",
      createdAt: (msg as any).createdAt ? new Date((msg as any).createdAt).getTime() : Date.now(),
    }))
    .reverse();
}

/** 
 * Robust error logger that handles Axios errors (with response details) and generic errors.
 */
export function logError(prefix: string, err: any) {
  if (err?.isAxiosError || (err?.response && err?.config)) {
    console.error(`${prefix}: AxiosError [${err?.response?.status} ${err?.response?.statusText}]`, {
      message: err.message,
      url: err.config?.url,
      method: err.config?.method?.toUpperCase(),
      data: err.config?.data,
      response: err.response?.data,
    });
  } else {
    console.error(`${prefix}:`, err);
  }
}