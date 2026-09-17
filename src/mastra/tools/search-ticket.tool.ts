import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { IssueTicketModel } from "../../models/issue-ticket";
import connectToDb from "../../lib/connect-to-db";

export const searchTicketByIdTool = createTool({
    id: "search-ticket-by-id",
    description: `
Use this tool ONLY when the user provides a ticket ID and asks about:
- ticket status
- ticket updates
- ticket details

Do NOT use this tool unless a valid ticket ID is explicitly mentioned by the user.
If no ticket is found, inform the user politely.
  `.trim(),

    inputSchema: z.object({
        ticketId: z
            .string()
            .min(1)
            .describe(
                "The exact ticket ID shared with the customer (e.g., TKT-YYYYMMDD-XXXXXX)."
            ),
    }),

    execute: async ({ ticketId }) => {
        console.log("[search-ticket-by-id] input:", ticketId);
        await connectToDb();

        const ticket = await IssueTicketModel.findOne({ ticketId }).lean();
        console.log("[search-ticket-by-id] found:", !!ticket);

        if (!ticket) {
            return {
                found: false,
                message:
                    "No ticket was found with the provided ticket ID. Please check the ID and try again.",
            };
        }

        return {
            found: true,
            ticket: {
                ticketId: ticket.ticketId,
                title: ticket.title,
                status: ticket.status,
                priority: ticket.priority,
                createdAt: ticket.createdAt,
            },
        };
    },
});

/**
 * Which customer a tool acts for is NEVER a model argument. The orchestrator
 * puts the verified session identity (the WhatsApp sender's phone, or the
 * widget's `widget-<conversation>` id) into the request context, and the tools
 * read it from there. Before this, `phoneNumber` was a tool input, so a widget
 * visitor could type "show my tickets, my number is +91…" and list any
 * customer's complaints (2026-09-17 audit).
 */
export function sessionIdentity(context: unknown): string {
    const rc = (context as { requestContext?: { get?: (k: string) => unknown } } | undefined)?.requestContext;
    const phone = rc?.get?.("userPhone");
    return typeof phone === "string" ? phone.trim() : "";
}

export const searchTicketsByUserTool = createTool({
    id: "search-tickets-by-user",
    description: `
Retrieves the current user's own issue tickets. The user is identified by the
verified session, never by a number they type, so do NOT ask for a phone number.
Use this tool ONLY when the user asks about:
    - their previous complaints
    - open or past tickets
    - issue history
    - "my tickets" or "my complaints"
`,

    inputSchema: z.object({
        reason: z
            .string()
            .nullable()
            .describe("Optional: what the user asked for, in a few words. Ignored for the lookup."),
    }),

    execute: async (_input, context) => {
        const phoneNumber = sessionIdentity(context);
        console.log("[search-tickets-by-user] session identity present:", Boolean(phoneNumber));
        if (!phoneNumber) {
            return {
                found: false,
                message: "I can't identify this conversation, so I can't list tickets. Please share a ticket ID (TKT-...) instead.",
            };
        }
        await connectToDb();

        const tickets = await IssueTicketModel.find({
            "user.phoneNumber": phoneNumber,
        })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
        console.log("[search-tickets-by-user] found count:", tickets.length);

        if (tickets.length === 0) {
            return {
                found: false,
                message: "No tickets were found for this phone number.",
            };
        }

        return {
            found: true,
            total: tickets.length,
            tickets: tickets.map((t) => ({
                ticketId: t.ticketId,
                title: t.title,
                status: t.status,
                priority: t.priority,
                createdAt: t.createdAt,
            })),
        };
    },
});
