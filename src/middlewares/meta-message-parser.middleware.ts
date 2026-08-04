import { type Request, type Response, type NextFunction } from "express";

import connectToDb from "../lib/connect-to-db";
import { isMessageRecent, Whatsapp } from "../lib/whatsapp";
import logger from "../lib/logger";

// ── Enhancement 1: Message deduplication ──────────────────────────────────────
// In-memory set of recently processed message IDs. Cleared every 60 seconds.
const processedMessageIds = new Set<string>();
setInterval(() => processedMessageIds.clear(), 60_000);

// ── Enhancement 2: Limits ──────────────────────────────────────────────────────
const MAX_MESSAGE_LENGTH = 800;

/**
 * Parses the incoming webhook body into a normalized message object.
 * Handles two formats:
 *  1. Raw Meta webhook (has `object` + `entry`) — passed through whatsappcloudapi_wrapper
 *  2. Pre-parsed whatsappcloudapi_wrapper result (has `isMessage` field) — used directly
 */
function parseIncomingWebhook(body: any): any {
    if (body?.object === "whatsapp_business_account" || Array.isArray(body?.entry)) {
        return Whatsapp.parseMessage(body);
    }
    if (typeof body?.isMessage === "boolean") {
        return body;
    }
    return body;
}

export const metaMessageParserMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const message = Whatsapp.parseMessage(req.body);
        // const message = req.body;

        // Not a user message (delivery receipt, status notification, etc.) — ack and skip
        if (!message?.isMessage) {
            return res.sendStatus(200);
        }

        // ── Enhancement 1: Deduplication ──────────────────────────────────────
        const messageId: string | undefined = message.message?.message_id;
        if (messageId) {
            if (processedMessageIds.has(messageId)) {
                logger.warn("[middleware] duplicate message_id — skipping", { messageId });
                return res.sendStatus(200);
            }
            processedMessageIds.add(messageId);
        }

        // ── Enhancement 2: Input validation ────────────────────────────────────
        const messageType: string | undefined = message.message?.type;
        const messageText: string | undefined = message.message?.text?.body;

        if (messageType !== "text_message") {
            logger.info("[middleware] non-text message — skipping", { type: messageType });
            // We can't easily send a reply here without the Whatsapp client — delegated to controller
            return res.sendStatus(200);
        }

        if (!messageText || messageText.trim().length === 0) {
            logger.info("[middleware] empty message body — skipping");
            return res.sendStatus(200);
        }

        if (messageText.trim().length > MAX_MESSAGE_LENGTH) {
            logger.warn("[middleware] message too long — skipping", { length: messageText.length });
            // Long spam: acknowledge but skip AI pipeline
            return res.sendStatus(200);
        }

        // ── Timestamp freshness check (5-minute window) ─────────────────────────
        // const ts = Number(message.message.timestamp) * 1000;
        // const adjusted = ts + 300_000;
        //
        // if (!isMessageRecent(adjusted)) {
        //     logger.warn("[middleware] stale message — skipping", { ts });
        //     return res.sendStatus(200);
        // }

        res.locals.message = message.message;
        res.locals.user = {
            name: message.message.from?.name,
            phone: message.message.from?.phone,
        };

        await connectToDb();
        next();
    } catch (error) {
        console.log("error", error);
        // logger.error("[middleware] error parsing webhook", { error, body: JSON.stringify(req.body) });
        return res.sendStatus(200);
    }
};