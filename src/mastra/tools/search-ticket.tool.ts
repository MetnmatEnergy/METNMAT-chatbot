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

export const searchTicketsByUserTool = createTool({
    id: "search-tickets-by-user",
    description: `
Retrieves all issue tickets created by a user using their phone number.
Use this tool ONLY when the user asks about:
    - their previous complaints
    - open or past tickets
    - issue history
    - "my tickets" or "my complaints"
`,

    inputSchema: z.object({
        phoneNumber: z
            .string()
            .min(5)
            .describe(
                "The user's phone number (as shared by the user) used to look up their tickets."
            ),
    }),

    execute: async ({ phoneNumber }) => {
        console.log("[search-tickets-by-user] input:", phoneNumber);
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
