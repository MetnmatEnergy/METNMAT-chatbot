/**
 * Shared inbound message pipeline for WhatsApp, widget, Facebook, and Instagram.
 */
import { Intent, type IntentValue } from "../constants/intents";
import {
  getResponseLanguage,
  getResponseLanguageForIssue,
  MATCH_USER_LANGUAGE,
} from "./detect-language";
import {
  createWebhookRequestContext,
  type WebhookRequestContext,
  type WebhookUser,
} from "./request-context";
import { getProfile } from "./user-profile";
import { buildContext, logError, type ConversationContextMessage } from "./utils";
import { type AgentUsageInput, recordAgentUsage } from "./agent-usage";
import { createConversationMessage, Role } from "../models/conversation-messages";
import { mastra } from "../mastra";
import {
  EMPTY_INTENT_DATA,
  intentClassifierOutputSchema,
  normalizeProductCategory,
  type IntentClassifierOutput,
  type IntentExtractedData,
} from "../mastra/agents/intent-classifier.agent";
import {
  type SalesReply,
  SalesReplySchema,
  UserReplySchema,
  FormatterOutputSchema,
  type UserReply,
  type FormatterOutput,
} from "../schemas/user-response";
import { CLARIFY_PROMPT } from "../mastra/prompts/clarify.prompt";
import type { RequestContext } from "@mastra/core/request-context";
import {
  CONTACT_TEXT_BLOCK,
  ensureContactInMessage,
  isContactIntent,
  mergeProductLinks,
  linksForWhatsApp,
} from "./metnmat-contact";

export type ChatChannel = "whatsapp" | "widget" | "facebook" | "instagram";

export type OrchestratorButton = { text: string; url: string };

export type OrchestratorResult = {
  message: string;
  productImageLink: string | null;
  buttons: OrchestratorButton[] | null;
};

const FALLBACK_ERROR_MESSAGE =
  "Sorry, I'm having a bit of trouble right now. Please try again in a moment.";

const RETURNING_USER_THRESHOLD = 1;
const SALES_AGENT_MAX_STEPS = 10;

function formatWhatsAppMessage(text: string): string {
  let msg = text.trim();
  msg = msg.replace(/\\n/g, "\n");
  msg = msg.replace(/\n{3,}/g, "\n\n");
  msg = msg.replace(/^\n+/, "");
  msg = msg.replace(/[ \t]+$/gm, "");
  return msg.trim();
}

async function postProcessLanguageFormatting(
  userMessage: string,
  agentResponse: string
): Promise<string> {
  if (!agentResponse.trim()) return agentResponse;

  // Skip the extra formatter LLM call for English — the sales/issue agents already
  // return well-formatted English, so running it only wastes Groq tokens (TPM budget),
  // adds latency, and (on this free tier) often fails and falls back anyway. Only
  // translate/reformat when the user actually wrote in another language.
  const lang = getResponseLanguage(userMessage);
  if (lang === MATCH_USER_LANGUAGE || lang === "English") {
    return formatWhatsAppMessage(agentResponse);
  }

  try {
    const formatter = mastra.getAgent("language-formatter-agent");
    const result = await formatter.generate(
      [
        {
          role: "user" as const,
          content: `USER MESSAGE:\n${userMessage}\n\nAI RESPONSE TO TRANSLATE AND FORMAT:\n${agentResponse}`,
        },
      ],
      { structuredOutput: { schema: FormatterOutputSchema, jsonPromptInjection: true } }
    );
    recordAgentUsage("language-formatter-agent", result.usage as AgentUsageInput, {}).catch(() => {});
    if (result.object) {
      const { text } = result.object as FormatterOutput;
      return formatWhatsAppMessage(text);
    }
  } catch (err: unknown) {
    logError("[langFormatter]", err);
  }
  return formatWhatsAppMessage(agentResponse);
}

function normalizeClassification(obj: unknown): IntentClassifierOutput {
  if (!obj || typeof obj !== "object") return { intent: Intent.GREETING, data: EMPTY_INTENT_DATA };
  const o = obj as IntentClassifierOutput;
  return {
    intent: o.intent || Intent.GREETING,
    data: {
      productTitle: o.data?.productTitle || "",
      productCategory: o.data?.productCategory || "",
      ticketId: o.data?.ticketId || "",
      phoneNumber: o.data?.phoneNumber || "",
      orderId: o.data?.orderId || "",
      issueSummary: o.data?.issueSummary || "",
    },
  };
}

async function classifyIntent(
  messages: ConversationContextMessage[],
  context?: { userPhone?: string }
): Promise<IntentClassifierOutput> {
  const agent = mastra.getAgent("intent-classifier-agent");
  try {
    // The classifier runs on the FAST (8b) model, which does NOT support Groq's native
    // json_schema response format — so the schema must be prompt-injected. Parse
    // failures fall back to "greeting", which still routes to the sales agent.
    const result = await agent.generate(messages as never, {
      structuredOutput: { schema: intentClassifierOutputSchema, jsonPromptInjection: true },
    });
    recordAgentUsage("intent-classifier-agent", result.usage as AgentUsageInput, context).catch(() => {});
    return normalizeClassification(result.object);
  } catch (err: unknown) {
    logError("[classifyIntent]", err);
    return { intent: Intent.GREETING, data: EMPTY_INTENT_DATA };
  }
}

function mapPurchaseLinks(links: Array<{ platform: string; link: string }>, channel: ChatChannel): OrchestratorButton[] {
  const merged = mergeProductLinks(links);
  const filtered = channel === "whatsapp" ? linksForWhatsApp(merged) : merged;
  return filtered.map((l) => ({ text: l.platform, url: l.link }));
}

function injectLinksInText(message: string, buttons: OrchestratorButton[]): string {
  if (message.includes("http") || message.includes("7872686501") || message.includes("@metnmat")) {
    return message;
  }
  const linksText = buttons.map((b) => `*${b.text}*: ${b.url}`).join("\n");
  return `${message.trim()}\n\n${linksText}`;
}

async function handleIssueIntent(
  messages: ConversationContextMessage[],
  user: WebhookUser,
  originalText: string,
  requestContext: RequestContext<WebhookRequestContext>
): Promise<OrchestratorResult> {
  try {
    const agent = mastra.getAgent("issue-creation-agent");
    const result = await agent.generate(messages as never, {
      requestContext,
      structuredOutput: { schema: UserReplySchema, jsonPromptInjection: true },
    });
    recordAgentUsage("issue-creation-agent", result.usage as AgentUsageInput, { userPhone: user.phone }).catch(() => {});
    const msg = (result.object as UserReply)?.message ?? "";
    const formatted = msg ? await postProcessLanguageFormatting(originalText, msg) : FALLBACK_ERROR_MESSAGE;
    return { message: formatted, productImageLink: null, buttons: null };
  } catch (err: unknown) {
    logError("[handleIssueIntent]", err);
    return { message: FALLBACK_ERROR_MESSAGE, productImageLink: null, buttons: null };
  }
}

async function handleSalesIntent(
  messages: ConversationContextMessage[],
  intent: IntentValue,
  extractedData: IntentExtractedData,
  requestContext: RequestContext<WebhookRequestContext>,
  channel: ChatChannel
): Promise<OrchestratorResult | undefined> {
  const agent = mastra.getAgent("sales-agent");
  try {
    const hint = `SYSTEM HINT: Title="${extractedData.productTitle}", Category="${extractedData.productCategory}". Use product-retriever for EXACT specs, SKU, and links.`;
    (requestContext as RequestContext<WebhookRequestContext> & { set: (k: string, v: string) => void }).set("systemHint", hint);

    // No structuredOutput on the sales path on purpose:
    //  - Groq rejects native response_format alongside tools ("json mode cannot be
    //    combined with tool/function calling").
    //  - Prompt-injected JSON + tools is unreliable: the 70B model sometimes emits a
    //    tool-call object as its FINAL text, which then fails schema validation.
    // The message is simply the model's natural-language text; the productImageLink
    // and buttons are derived from the product-retriever tool results below.
    const result = await agent.generate(messages as never, {
      requestContext,
      maxSteps: SALES_AGENT_MAX_STEPS,
    });

    const replyText = (result.text || "").trim();
    if (!replyText) return undefined;

    const reply: SalesReply = { message: replyText, productImageLink: null, buttons: [] };
    let toolProduct: Record<string, unknown> | null = null;

    // Pick up the product-retriever result regardless of classified intent — the
    // classifier (fast model) sometimes mislabels product questions as greetings,
    // but if the agent actually retrieved a single product we still want the
    // shopping actions for it. Mastra step shapes vary across versions, so check
    // both `output` and `toolResults` shapes.
    type RetrieverOut = { found?: boolean; total?: number; products?: Record<string, unknown>[] };
    // Specific match only (≤4 results = a product question, not a category listing):
    // we don't want "Add to cart" pointing at the first item of a 12-product list.
    const pick = (o?: RetrieverOut) => {
      if (!o?.found || !o.products?.length) return null;
      const total = typeof o.total === "number" ? o.total : o.products.length;
      return total <= 4 ? (o.products[0] ?? null) : null;
    };
    if (result.steps) {
      // Step shape (Mastra 1.x): steps[].toolResults[] = { payload: { toolName, result } }
      outer: for (const step of result.steps) {
        const s = step as {
          output?: RetrieverOut;
          toolResults?: Array<{ result?: RetrieverOut; payload?: { result?: RetrieverOut } }>;
        };
        toolProduct = pick(s.output);
        if (toolProduct) break;
        for (const tr of s.toolResults ?? []) {
          toolProduct = pick(tr?.payload?.result ?? tr?.result);
          if (toolProduct) break outer;
        }
      }
    }
    void intent;

    if (toolProduct) {
      if (!reply.productImageLink && toolProduct.product_image_link) {
        reply.productImageLink = String(toolProduct.product_image_link);
      }
    }

    // Shopping-companion actions: when ONE product was identified, give the
    // customer direct purchase actions — view the product on the site, add it
    // straight to the site cart (cart:<SKU> is translated by the widget), or
    // jump to the quote form. WhatsApp can't deep-link the cart, so it keeps
    // the standard https links only.
    const sku = toolProduct?.sku ? String(toolProduct.sku) : "";
    if (sku && channel === "widget") {
      reply.buttons = [
        { text: "View product", url: `https://www.metnmat.com/search?q=${encodeURIComponent(sku)}` },
        { text: "Add to cart", url: `cart:${sku}` },
        { text: "Request a quote", url: "https://www.metnmat.com/quote" },
      ];
    } else if (!reply.buttons?.length && toolProduct?.product_purchase_link) {
      reply.buttons = mapPurchaseLinks(toolProduct.product_purchase_link as Array<{ platform: string; link: string }>, channel);
    } else if (reply.buttons?.length) {
      reply.buttons = mapPurchaseLinks(
        reply.buttons.map((b) => ({ platform: b.text, link: b.url })),
        channel
      );
    } else {
      reply.buttons = mapPurchaseLinks([], channel);
    }

    if (reply.buttons.length && !reply.message.includes("http")) {
      reply.message = injectLinksInText(reply.message, reply.buttons);
    }

    return {
      message: reply.message,
      productImageLink: reply.productImageLink ?? null,
      buttons: reply.buttons.length ? reply.buttons : null,
    };
  } catch (err: unknown) {
    logError("[handleSalesIntent]", err);
    return undefined;
  }
}

export type ProcessCustomerMessageInput = {
  userId: string;
  userName?: string;
  text: string;
  messageId: string;
  channel?: ChatChannel;
};

/** Core pipeline: classify → agent → format → structured reply. */
export async function processCustomerMessage(input: ProcessCustomerMessageInput): Promise<OrchestratorResult> {
  const { userId, userName, text, messageId, channel = "whatsapp" } = input;
  const user: WebhookUser = { phone: userId, name: userName };

  const [history, profile] = await Promise.all([buildContext(userId), getProfile(userId)]);

  const context: ConversationContextMessage[] = [
    ...history,
    { id: messageId, role: Role.USER, content: text },
  ];

  createConversationMessage({
    messageId,
    role: Role.USER,
    content: { text },
    user: { phone: userId, name: userName },
  }).catch((err) => logError("[orchestrator] save user msg", err));

  if (isContactIntent(text)) {
    const contactResult: OrchestratorResult = {
      message: ensureContactInMessage(
        `Hi! You can reach *Metnmat* sales and support through any of the channels below. We help with lab equipment, electrodes, membranes, and custom R&D solutions.`
      ),
      productImageLink: null,
      buttons: mapPurchaseLinks([], channel),
    };
    await saveAssistantMessage(userId, userName, contactResult.message);
    return contactResult;
  }

  let preferredLanguage = getResponseLanguage(text);
  if (preferredLanguage === MATCH_USER_LANGUAGE && profile?.preferredLanguage) {
    const stored = profile.preferredLanguage.toLowerCase();
    if (stored === "hinglish") preferredLanguage = "Hinglish";
    else if (stored === "hindi") preferredLanguage = "Hindi";
  }

  const classification = await classifyIntent(context, { userPhone: userId });
  const { intent, data: rawData } = classification;

  const data: IntentExtractedData = {
    productTitle: String(rawData.productTitle || ""),
    productCategory: normalizeProductCategory(rawData.productCategory) ?? "",
    ticketId: String(rawData.ticketId || ""),
    phoneNumber: String(rawData.phoneNumber || ""),
    orderId: String(rawData.orderId || ""),
    issueSummary: String(rawData.issueSummary || ""),
  };

  const requestContext = createWebhookRequestContext(
    user,
    intent,
    preferredLanguage,
    profile as Parameters<typeof createWebhookRequestContext>[3],
    context.length > RETURNING_USER_THRESHOLD
  );

  let result: OrchestratorResult;

  if (intent === Intent.GREETING || intent === Intent.PRODUCT_QUERY || intent === Intent.CATALOG_QUERY) {
    const sales = await handleSalesIntent(context, intent, data, requestContext, channel);
    if (sales) {
      sales.message = await postProcessLanguageFormatting(text, sales.message);
      if (sales.buttons?.length && !sales.message.includes("http") && !sales.message.includes("7872686501")) {
        sales.message = injectLinksInText(sales.message, sales.buttons);
      }
      result = sales;
    } else {
      result = { message: FALLBACK_ERROR_MESSAGE, productImageLink: null, buttons: mapPurchaseLinks([], channel) };
    }
  } else if (intent === Intent.VIEW_ISSUES || intent === Intent.CREATE_ISSUE_TICKET) {
    void getResponseLanguageForIssue(text);
    result = await handleIssueIntent(context, user, text, requestContext);
  } else {
    const clarifyResult = await mastra.getAgent("sales-agent").generate(
      [...context, { id: "clarify", role: "system", content: CLARIFY_PROMPT }] as never,
      { requestContext, structuredOutput: { schema: SalesReplySchema, jsonPromptInjection: true } }
    );
    const reply = (clarifyResult.object as SalesReply) ?? { message: clarifyResult.text ?? "", productImageLink: null, buttons: null };
    const msg = await postProcessLanguageFormatting(text, reply.message);
    result = {
      message: msg,
      productImageLink: reply.productImageLink ?? null,
      buttons: mapPurchaseLinks([], channel),
    };
  }

  await saveAssistantMessage(userId, userName, result.message);
  return result;
}

async function saveAssistantMessage(userId: string, userName: string | undefined, text: string) {
  await createConversationMessage({
    messageId: `assistant-${Date.now()}`,
    role: Role.ASSISTANT,
    content: { text },
    user: { phone: userId, name: userName },
  }).catch((err) => logError("[orchestrator] save assistant msg", err));
}

export { CONTACT_TEXT_BLOCK };
