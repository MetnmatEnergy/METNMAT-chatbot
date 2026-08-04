import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { IssueTicketModel } from "../../models/issue-ticket";
import connectToDb from "../../lib/connect-to-db";

export const createIssueTicketTool = createTool({
    id: "create-issue-ticket",
    description: `
Creates a new issue ticket. Call this when you have: (1) nature of issue (Quality, Missing Item, Damaged, Expired, Delivery, Refund/Replacement) and (2) a brief description from the user. Use user.phoneNumber and user.name from the conversation context. orderId can be null if they said they bought offline or don't have one.
    `,

    inputSchema: z.object({
        userQuery: z
            .string()
            .min(1)
            .describe(
                "The original message from the user describing the issue or request. This text is stored exactly as provided for reference and audit purposes."
            ),

        user: z.object({
            name: z
                .string()
                .describe(
                    "The user's name, if provided by the user during the conversation."
                ),

            phoneNumber: z
                .string()
                .describe(
                    "The user's phone number as shared by the user. This is used to associate the ticket with the customer."
                ),
        }),

        orderId: z
            .string()
            .nullable()
            .describe(
                "The order ID related to the issue, if the user has provided one. Leave null if no order ID is available."
            ),

        issueTitle: z
            .string()
            .nullable()
            .describe(
                "A short, clear summary of the issue. Use only when a concise title can be confidently derived from confirmed information."
            ),

        issueDescription: z
            .string()
            .nullable()
            .describe(
                "A brief factual description of the issue based on confirmed details from the user. Do not include assumptions or unverified information."
            ),

        natureOfIssue: z
            .enum(["Quality", "Missing Item", "Damaged", "Expired", "Delivery", "Refund/Replacement"])
            .describe(
                "The verified and confirmed nature of the issue. You ARE FORBIDDEN from calling this tool if you only have a vague report like 'issue' or 'problem'."
            ),

        priority: z
            .enum(["low", "medium", "high"])
            .nullable()
            .describe(
                "The urgency level of the issue. Use only when the priority is obvious from the issue details; otherwise leave null."
            ),
    }),

    execute: async ({ user, userQuery, issueDescription, issueTitle, orderId, priority, natureOfIssue }) => {
        try {
            const normalizedQuery = userQuery.trim();

            await connectToDb();

            console.log("[create-issue-ticket] data:", { user, userQuery, issueDescription, issueTitle, orderId, priority, natureOfIssue })

            const u = user as { name?: string; phoneNumber?: string; phone?: string };
            const userPhone = (u.phoneNumber ?? u.phone ?? "").trim();

            // VALIDATION: Check if nature of issue is confirmed
            if (!natureOfIssue || natureOfIssue.trim() === "") {
                throw new Error("Cannot create ticket: Nature of issue must be confirmed (Quality, Damaged, Expired, Missing, Delivery, or Refund/Replacement)");
            }

            const ticketUser = {
                phoneNumber: u.phoneNumber ?? u.phone ?? userPhone,
                name: u.name,
            };
            const ticket = await IssueTicketModel.create({
                ticketId: generateTicketId(),
                title: issueTitle || `${natureOfIssue}: ${normalizedQuery}`,
                user: ticketUser,
                description: issueDescription || normalizedQuery,
                sourceQuery: normalizedQuery,
                natureOfIssue,
                orderId: orderId || "",
                priority: priority ?? "medium",
                status: "open",
            });

            console.log("[create-issue-ticket] ticket created:", ticket.ticketId);

            return {
                ticketId: ticket.ticketId,
                title: ticket.title,
                status: ticket.status,
                priority: ticket.priority,
                createdAt: ticket.createdAt,
            };
        } catch (error) {
            console.error("[create-issue-ticket] Failed to create ticket:", error);
            throw error;
        }
    },
});

export function generateTicketId(): string {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const datePart = `${yyyy}${mm}${dd}`;

    // 6-char random uppercase alphanumeric
    const randomPart = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    return `TKT-${datePart}-${randomPart}`;
}
