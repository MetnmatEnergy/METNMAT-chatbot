import { Agent } from "@mastra/core/agent";
import { z } from "zod";

import { LLM_MODELS } from "../../config/models";
import { PRODUCT_CATEGORIES, normalizeProductCategory } from "../tools/product-retriever.tool";

/** Intent labels used for routing user messages */
export const INTENTS = [
    "greeting",
    "catalog_query",
    "product_query",
    "view_issues",
    "create_issue_ticket",
] as const;

export type IntentType = (typeof INTENTS)[number];

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export { PRODUCT_CATEGORIES, normalizeProductCategory };

/** Structured data extracted from the user query (only relevant fields per intent). */
export const intentExtractedDataSchema = z.object({
    productTitle: z.string(),
    productCategory: z.string(),
    ticketId: z.string(),
    phoneNumber: z.string(),
    orderId: z.string(),
    issueSummary: z.string(),
});

export type IntentExtractedData = z.infer<typeof intentExtractedDataSchema>;

export const intentClassifierOutputSchema = z.object({
    intent: z.string(),
    data: intentExtractedDataSchema,
});

export type IntentClassifierOutput = z.infer<typeof intentClassifierOutputSchema>;

export const EMPTY_INTENT_DATA: IntentExtractedData = {
    productTitle: "",
    productCategory: "",
    ticketId: "",
    phoneNumber: "",
    orderId: "",
    issueSummary: "",
};

export const intentClassifierAgent = new Agent({
    id: "intent-classifier-agent",
    name: "Intent Classifier Agent",
    description:
        "Classifies user intent and extracts structured data (product terms, category, ticket id, etc.) from the conversation.",
    model: LLM_MODELS.fast,
    instructions: `
You are an intent classifier and structured data extractor for Metnmat Research & Innovations (metnmat.com) — India's private R&D company for Metallurgy & Materials, electrochemical lab equipment, electrodes, membranes, reactors, and research instruments.

Output ONLY a single valid JSON object: {"intent":"...","data":{...}}

# MANDATORY JSON RULES
1. Output ONLY valid JSON.
2. In 'data', include EVERY field: productTitle, productCategory, ticketId, phoneNumber, orderId, issueSummary.
3. Use "" for fields not applicable. NEVER omit a field.

INTENTS (choose exactly one):

- greeting: Simple greetings ("hi", "hello", "thanks", "bye") with NO active product discussion. Only when FIRST message or NO prior product context.

- catalog_query: User asks for full product range, catalog, or what Metnmat sells. Examples: "what products do you have", "show catalog", "all Metnmat products", "what do you sell", "list your equipment".

- product_query: User asks about a specific product, category, specifications, SKU, price, applications, or how to buy/order. Examples: "Ag/AgCl electrode", "PEM membrane N117", "peristaltic pump", "tell me about reference electrodes", "where to buy", "order link", "specifications for titanium felt".

- view_issues: User wants ticket/complaint status. Examples: "my ticket status", "complaint status", "ticket TKT-123".

- create_issue_ticket: User reports a problem with a product, order, delivery, quality, or wants support. Examples: "report issue", "product damaged", "wrong item delivered".

---

CATEGORY MAPPING (productCategory — use exactly one slug or ""):

- electrodes: reference electrodes, counter electrodes, working electrodes, Ag/AgCl, platinum, gold disk, glassy carbon, titanium felt
- membranes: PEM, AEM, BPM, CEM, proton exchange, anion exchange, N117, N212, Fumasep, Sustainion
- reactor_and_cell: water splitting reactors, electrolyzer cells, electrochemical cells
- equipments: peristaltic pumps, hot press, hydraulic press, temperature controller, triboelectric setup, MEA fabrication
- accessories: nanoparticles, zinc sheet, aluminum sheet, gas sampling bag, lab materials

RULES:
1. catalog_query → leave productTitle and productCategory empty (unless user names one category explicitly — then product_query with that category).
2. product_query with category only → fill productCategory, leave productTitle empty.
3. product_query with specific product → fill productTitle AND productCategory if known.
4. Short follow-ups ("more", "price?", "specs?", "SKU?") → inherit previous product context, keep product_query.
5. "where to buy" / "order" / "contact" → always product_query.
6. Issue flow override: if conversation is in ticket flow, classify as create_issue_ticket.

FINAL OUTPUT:
{"intent":"intent-name","data":{"productTitle":"","productCategory":"","ticketId":"","phoneNumber":"","orderId":"","issueSummary":""}}
`.trim(),
});
