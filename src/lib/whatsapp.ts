import WhatsappCloudAPI from 'whatsappcloudapi_wrapper';
import axios, { type AxiosInstance } from 'axios';

import { buildContext, logError } from "../lib/utils";
import { config } from "../config/env";

export interface WhatsappMessageObj {
    from: {
        name: string;
        phone: string;
    };
    type: string;
    message_id: string;
    timestamp: string;
    [key: string]: any;
}

export interface ParsedMessage {
    incomingMessage?: any;
    recipientName?: string;
    wabaid?: string;
    recipientPhone?: number;
    typeOfMsg?: string;
    message_id?: string;
    timestamp?: number;
    isMessage?: boolean;
    messageStatus?: string;
}

export interface FlowData {
    screen: string;
    data: any;
}

export interface SendFlowArgs {
    header?: string;
    body?: string;
    footer?: string;
    flow_id: string;
    flow_cta: string;
    flow_token: string;
    flow_data?: FlowData;
    draft?: boolean;
    recipientPhone: string | number;
}

export const WHATSAPP_API: AxiosInstance = axios.create({
    baseURL: `https://graph.facebook.com/v20.0/${config.whatsapp.phoneNumberId}`,
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.whatsapp.accessToken}`
    }
});

// Constructed LAZILY. The previous `new WhatsappCloudAPI({...})` at module
// scope ran on import, and the wrapper throws `Missing "accessToken"` when the
// token is absent — so an UNCONFIGURED OPTIONAL CHANNEL killed the entire
// process at startup. The server routes import the meta webhook controller,
// which imports this, so the chat widget and every HTTP endpoint went down
// because WhatsApp credentials were not set.
//
// Now the failure is deferred to first use: the app boots and serves without
// WhatsApp configured, and only the WhatsApp paths fail, with a message naming
// the variables to set.
type WhatsappClient = InstanceType<typeof WhatsappCloudAPI>;

let _client: WhatsappClient | undefined;

function whatsappClient(): WhatsappClient {
    if (!_client) {
        if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) {
            throw new Error(
                "WhatsApp is not configured — set Meta_WA_accessToken and " +
                "Meta_WA_SenderPhoneNumberId (and Meta_WA_wabaId) to enable it."
            );
        }
        _client = new WhatsappCloudAPI({
            accessToken: config.whatsapp.accessToken,
            senderPhoneNumberId: config.whatsapp.phoneNumberId,
            WABA_ID: config.whatsapp.wabaId,
        });
    }
    return _client;
}

/** True when the WhatsApp channel can actually be used. */
export const whatsappConfigured = (): boolean =>
    Boolean(config.whatsapp.accessToken && config.whatsapp.phoneNumberId);

// A Proxy so existing call sites (Whatsapp.parseMessage, Whatsapp.sendImage)
// keep working unchanged while construction stays deferred.
export const Whatsapp: WhatsappClient = new Proxy({} as WhatsappClient, {
    get(_target, prop) {
        const value = (whatsappClient() as unknown as Record<string | symbol, unknown>)[prop];
        return typeof value === "function" ? value.bind(whatsappClient()) : value;
    },
});

/** WhatsApp text message body max: 4096 chars. */
const MAX_TEXT_LENGTH = 4096;
/** WhatsApp image caption max: 1024 chars. */
const MAX_CAPTION_LENGTH = 1024;
/** Max length for a single sales message before we split into multiple messages. */
const MAX_SALES_MESSAGE_LENGTH = 4000;

/**
 * Splits text into chunks of at most maxLength chars, breaking at newline or space when possible.
 */
function splitMessageIntoChunks(text: string, maxLength: number): string[] {
    const trimmed = text.trim();
    if (trimmed.length <= maxLength) return [trimmed];

    const chunks: string[] = [];
    let remaining = trimmed;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }
        const slice = remaining.slice(0, maxLength);
        const lastNewline = slice.lastIndexOf("\n");
        const lastSpace = slice.lastIndexOf(" ");
        const breakAt =
            lastNewline >= 0 ? lastNewline + 1 : lastSpace >= 0 ? lastSpace + 1 : maxLength;
        chunks.push(remaining.slice(0, breakAt).trim());
        remaining = remaining.slice(breakAt).trim();
    }

    return chunks;
}

/** Send a plain text message. */
export async function sendText({
    message,
    recipientPhone,
}: {
    message: string;
    recipientPhone: string | number;
}) {
    try {
        const to = String(recipientPhone).replace(/^\+/, "");
        const body = message.slice(0, MAX_TEXT_LENGTH);
        const obj = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
            type: "text",
            text: { body },
        };
        const response = await WHATSAPP_API.post("/messages", obj);
        return response.data;
    } catch (error: any) {
        logError("[sendText]", error);
    }
}

export type SalesReplyPayload = {
    message: string;
    productImageLink: string | null;
    buttons: Array<{ text: string; url: string }> | null;
};

/** Remove any URLs from message text so image/purchase links are never sent in the text body. */
function stripUrlsFromText(text: string): string {
    return text.trim();
}

/**
 * Send the sales agent reply to WhatsApp: image+button, image only, button only, or text.
 * Message text is stripped of any URLs; image is sent via productImageLink, purchase links via buttons.
 */
export async function sendSalesReply(reply: SalesReplyPayload, recipientPhone: string | number) {
    const to = String(recipientPhone).replace(/^\+/, "");
    const fullText = stripUrlsFromText(reply.message.trim());
    const firstButton = reply.buttons?.[0];
    const hasImage = Boolean(reply.productImageLink);

    const chunks = splitMessageIntoChunks(fullText, MAX_SALES_MESSAGE_LENGTH);
    const isMultiPart = chunks.length > 1;

    if (isMultiPart) {
        const [firstChunk, ...restChunks] = chunks;
        if (hasImage && firstButton) {
            try {
                await sendCtaUrlButtonWithImage({
                    message: (firstChunk ?? "").slice(0, MAX_CAPTION_LENGTH),
                    imageUrl: reply.productImageLink!,
                    buttonName: firstButton.text,
                    url: firstButton.url,
                    recipientPhone: to,
                });
            } catch {
                // Image upload failed (CDN blocked by Meta) — fallback to button-only
                console.warn("[sendSalesReply] image upload failed, falling back to CTA button only");
                await sendCtaUrlButton({
                    message: firstChunk ?? "",
                    buttonName: firstButton.text,
                    url: firstButton.url,
                    recipientPhone: to,
                });
            }
        } else if (hasImage) {
            try {
                await sendImage({
                    caption: (firstChunk ?? "").slice(0, MAX_CAPTION_LENGTH),
                    url: reply.productImageLink!,
                    recipientPhone: to,
                });
            } catch {
                // Image upload failed — fallback to plain text
                console.warn("[sendSalesReply] image upload failed, falling back to text");
                await sendText({ message: firstChunk ?? "", recipientPhone: to });
            }
        } else if (firstButton) {
            await sendCtaUrlButton({
                message: firstChunk ?? "",
                buttonName: firstButton.text,
                url: firstButton.url,
                recipientPhone: to,
            });
        } else {
            await sendText({ message: firstChunk ?? "", recipientPhone: to });
        }
        const allButtons = reply.buttons ?? [];
        for (let i = 0; i < restChunks.length; i++) {
            const chunk = restChunks[i];
            await sendText({ message: (chunk ?? "").slice(0, MAX_TEXT_LENGTH), recipientPhone: to });
        }
        if (allButtons.length > 0) {
            const linkLines = allButtons.map((b) => `${b.text}: ${b.url}`).join("\n");
            await sendText({ message: linkLines.slice(0, MAX_TEXT_LENGTH), recipientPhone: to });
        }
        return;
    }

    const text = hasImage ? fullText.slice(0, MAX_CAPTION_LENGTH) : fullText.slice(0, MAX_TEXT_LENGTH);
    if (hasImage && firstButton) {
        try {
            return await sendCtaUrlButtonWithImage({
                message: text,
                imageUrl: reply.productImageLink!,
                buttonName: firstButton.text,
                url: firstButton.url,
                recipientPhone: to,
            });
        } catch {
            // Image upload failed — fallback to CTA button without image
            console.warn("[sendSalesReply] image upload failed, falling back to CTA button only");
            return sendCtaUrlButton({
                message: text.slice(0, MAX_TEXT_LENGTH),
                buttonName: firstButton.text,
                url: firstButton.url,
                recipientPhone: to,
            });
        }
    }
    if (hasImage) {
        try {
            return await sendImage({
                caption: text,
                url: reply.productImageLink!,
                recipientPhone: to,
            });
        } catch {
            // Image upload failed — fallback to plain text
            console.warn("[sendSalesReply] image upload failed, falling back to text");
            return sendText({ message: text.slice(0, MAX_TEXT_LENGTH), recipientPhone: to });
        }
    }
    if (firstButton) {
        return sendCtaUrlButton({
            message: text,
            buttonName: firstButton.text,
            url: firstButton.url,
            recipientPhone: to,
        });
    }
    return sendText({ message: text, recipientPhone: to });
}

export async function sendCtaUrlButton({ buttonName, url, message, recipientPhone }: any) {
    try {
        const obj = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipientPhone,
            type: 'INTERACTIVE',
            interactive: {
                type: 'cta_url',
                body: {
                    text: message.slice(0, 1023),
                },
                action: {
                    name: 'cta_url',
                    parameters: {
                        display_text: buttonName.substring(0, 20),
                        url: url,
                    },
                },
            },
        };

        const response = await WHATSAPP_API.post('/messages', obj);
        return response.data;
    } catch (error: any) {
        logError("[sendCtaUrlButton] ❌ Failed", error);
        throw error;
    }
}

export async function sendCtaUrlButtonWithImage({ buttonName, url, imageUrl, message, recipientPhone }: any) {
    try {
        const obj = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipientPhone,
            type: 'INTERACTIVE',
            interactive: {
                type: 'cta_url',
                body: {
                    text: message.slice(0, 1023),
                },
                header: {
                    type: "image",
                    image: {
                        link: imageUrl
                    }
                },
                action: {
                    name: 'cta_url',
                    parameters: {
                        display_text: buttonName.substring(0, 20),
                        url: url,
                    },
                },
            },
        };

        const response = await WHATSAPP_API.post('/messages', obj);
        return response.data;
    } catch (error: any) {
        logError("[sendCtaUrlButtonWithImage] ❌ Failed", error);
        throw error;
    }
}

export function isMessage(message: any): boolean {
    return message?.isMessage;
}

export function parseMessage(message: WhatsappMessageObj): ParsedMessage {
    return {
        incomingMessage: message,
        recipientName: message.from.name,
        recipientPhone: Number(message.from.phone),
        typeOfMsg: message.type,
        message_id: message.message_id,
        timestamp: Number(`${message.timestamp}000`) + 1e4,
    };
}

export function parseIncoming(body: any): ParsedMessage {
    try {
        const message = Whatsapp.parseMessage(body);

        if (!message.isMessage) {
            return {
                isMessage: false,
                messageStatus: ""
            }
        }

        const {
            incomingMessage,
            recipientName,
            recipientPhone,
            typeOfMsg,
            message_id,
            timestamp,
        } = parseMessage(message.message);

        return {
            incomingMessage,
            recipientName,
            recipientPhone,
            typeOfMsg,
            message_id,
            wabaid: message.WABA_ID,
            timestamp,
            isMessage: message.isMessage
        };
    } catch (err) {
        return {
            isMessage: false
        }
    }
}

export function isMessageRecent(timestamp: number): boolean {
    const currentTimestamp = new Date().getTime();

    return timestamp > currentTimestamp;
}

export async function sendImage({ caption, file_path, url, recipientPhone }: any) {
    try {
        const result = await Whatsapp.sendImage({
            recipientPhone,
            caption: caption.slice(0, 1023),
            file_path,
            url,
        });
        return result;
    } catch (error: any) {
        logError("[sendImage] ❌ Failed", error);
        throw error;
    }
}

function createFlow(
    header: string | undefined,
    body: string | undefined,
    footer: string | undefined,
    flow_id: string,
    flow_cta: string,
    flow_token: string,
    flow_data: FlowData | undefined,
    draft: boolean | undefined,
    recipientPhone: string | number
) {
    const flowObj: any = {
        messaging_product: "whatsapp",
        to: recipientPhone,
        type: "interactive",
        interactive: {
            type: "flow",
            header: {
                type: "text",
                text: header ?? "Hi"
            },
            body: {
                text: body ?? "Body"
            },
            footer: {
                text: footer ?? "\xA9Autowhat"
            },
            action: {
                name: "flow",
                parameters: {
                    flow_message_version: "3",
                    flow_token,
                    flow_id,
                    flow_cta,
                    flow_action: "data_exchange"
                }
            }
        }
    };

    if (draft) {
        flowObj.interactive.action.parameters.mode = "draft";
    }

    if (flow_data) {
        if (!flow_data.screen) {
            throw new Error("Screen Name is required when sending custom flow data");
        }
        flowObj.interactive.action.parameters["flow_action_payload"] = {
            screen: flow_data.screen,
            data: flow_data.data
        };
        delete flowObj.interactive.action.parameters.flow_action;
    }

    return flowObj;
}

export async function sendFlow({
    header,
    body,
    footer,
    flow_id,
    flow_cta,
    flow_token,
    flow_data,
    draft,
    recipientPhone
}: SendFlowArgs) {
    try {
        const flowObj = createFlow(
            header,
            body,
            footer,
            flow_id,
            flow_cta,
            flow_token,
            flow_data,
            draft,
            recipientPhone
        );

        const resp = await WHATSAPP_API.post("/messages", flowObj);
        return resp.data;
    } catch (err: any) {
        logError("[sendFlow]", err);
    }
}
