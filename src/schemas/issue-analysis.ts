import { z } from "zod";

export const IssueAnalysisSchema = z.object({
    messageDraft: z
        .string()
        .describe(
            "The internal draft response for the customer. Should be factual and follow the user's language/script."
        ),
    requiresUserResponse: z
        .boolean()
        .describe("True if we need more information from the user before proceeding."),
    ticketCreated: z
        .boolean()
        .describe("True if a business ticket was created during this turn."),
    ticketId: z
        .string()
        .nullable()
        .describe("The ID of the created ticket, if any."),
    natureOfIssue: z
        .enum(["Quality", "Missing Item", "Damaged", "Expired", "Delivery", "Refund/Replacement"])
        .nullable()
        .describe("The confirmed nature of the issue. MUST be null if not explicitly confirmed."),
    productIdentified: z
        .string()
        .nullable()
        .describe("The specific Metnmat product name identified or verified."),
});

export type IssueAnalysis = z.infer<typeof IssueAnalysisSchema>;
