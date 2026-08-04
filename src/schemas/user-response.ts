import { z } from "zod";

export const ButtonSchema = z.object({
    text: z.string().min(2).max(40).describe("Button text (e.g., 'Shop on Metnmat', 'Contact Sales')"),
    url: z.string().describe("The URL the button should open"),
});

export const UserReplySchema = z.object({
    message: z
        .string()
        .max(1000)
        .describe(
            "The main response text. MAX 900 chars (WhatsApp limit is 1024). Be concise. List 2-3 products max. STRICT: No raw URLs, no markdown links [text](url), and no markdown images ![alt](url). Use 'buttons' for links and 'productImageLink' for images."
        ),
    requiresUserResponse: z.boolean().describe(
        "True if the agent expects the user to reply with more information."
    ),
    issueTitle: z
        .string()
        .nullable()
        .describe(
            "Optional short title for the issue. If not provided, one will be generated from the user query."
        ),
    issueDescription: z
        .string()
        .nullable()
        .describe(
            "Optional description for the issue. If not provided, one will be generated from the user query."
        ),
    intent: z.enum([
        "inform",
        "ask_clarification",
        "acknowledge",
        "close",
    ]).describe(
        "The conversational intent of the message."
    ),
    productImageLink: z
        .string()
        .url()
        .nullable()
        .describe(
            "Optional product image URL. Include when showing Metnmat product information."
        ),
    buttons: z
        .array(ButtonSchema)
        .max(3)
        .nullable()
        .describe(
            "Optional array of action buttons (max 3). Use for buying links instead of plain text URLs. Each button should have clear action text. Null or empty if no buttons."
        ),
});

/**
 * Sales reply schema. All fields are required for OpenAI strict response_format.
 */
export const SalesReplySchema = z.object({
    message: z
        .string()
        .max(1000)
        .describe(
            "The main response text. When shop/contact links are available, list them at the end with bold platform headers (e.g., *Shop on Metnmat*: link). Keep descriptions technical and clear. Use real newlines. MAX 1024 for WhatsApp."
        ),
    productImageLink: z
        .string()
        .url()
        .nullable()
        .describe(
            "Set to the product's product_image_link when showing ONE product. This URL is sent as an image message by the system—do NOT paste it into the message text. Null for greeting or when no image. NEVER invent URLs."
        ),
    buttons: z
        .array(ButtonSchema)
        .max(3)
        .nullable()
        .describe(
            "Purchase link buttons for ONE product. Null or empty when greeting or no links. NEVER invent URLs."
        ),
});

export const FormatterOutputSchema = z.object({
    text: z.string().describe("The translated and formatted message text for WhatsApp."),
});

export type Button = z.infer<typeof ButtonSchema>;
export type UserReply = z.infer<typeof UserReplySchema>;
export type SalesReply = z.infer<typeof SalesReplySchema>;
export type FormatterOutput = z.infer<typeof FormatterOutputSchema>;