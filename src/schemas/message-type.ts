import { z } from "zod";

export const MessageTypeSchema = z.enum([
    "greeting",
    "general_question",
    "product_query",
    "issue_report",
    "order_issue",
    "feedback",
]);

export type MessageType = z.infer<typeof MessageTypeSchema>;
