import mongoose, {
    Schema,
    model,
    type Document,
    type Model,
} from "mongoose";

const { models } = mongoose;

/**
 * WhatsApp user metadata
 */
export interface WhatsAppUserInfo {
    phoneNumber: string;          // verified session identity (E.164 phone, or widget-<conversation>)
    contactPhone?: string;        // a number the customer typed in chat; unverified, contact hint only
    name?: string;                // WhatsApp profile name (if available)
    whatsappId?: string;          // Platform-specific user ID
}

/**
 * Issue Ticket domain type
 */
export interface IssueTicket {
    ticketId: string;
    title: string;
    description: string;
    sourceQuery: string;

    orderId?: string;

    user: WhatsAppUserInfo;

    status: "open" | "in_progress" | "resolved" | "closed";
    priority: "low" | "medium" | "high";
    natureOfIssue: string;

    createdAt: Date;
}

/**
 * Mongoose document type
 */
export type IssueTicketDocument = IssueTicket & Document;

/**
 * Schema
 */
const IssueTicketSchema = new Schema<IssueTicketDocument>(
    {
        ticketId: {
            type: String,
            required: true,
            index: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
        },

        description: {
            type: String,
            required: true,
        },

        sourceQuery: {
            type: String,
            required: true,
        },

        user: {
            phoneNumber: {
                type: String,
                required: true,
                index: true,
            },
            name: {
                type: String,
            },
            // A number the customer TYPED in chat (unverified, may be anyone's).
            // `phoneNumber` above is the verified session identity; only that one
            // is ever used to look tickets up.
            contactPhone: {
                type: String,
            },
            whatsappId: {
                type: String,
                index: true,
            },
        },

        orderId: {
            type: String,
        },

        status: {
            type: String,
            enum: ["open", "in_progress", "resolved", "closed"],
            default: "open",
            index: true,
        },

        priority: {
            type: String,
            enum: ["low", "medium", "high"],
            default: "medium",
        },

        natureOfIssue: {
            type: String,
            required: true,
            index: true,
        },
    },
    {
        collection: "issues",
        timestamps: true,
    }
);

/**
 * Model export (hot-reload safe)
 */
export const IssueTicketModel: Model<IssueTicketDocument> =
    mongoose.models?.IssueTicket ??
    model<IssueTicketDocument>("IssueTicket", IssueTicketSchema);
