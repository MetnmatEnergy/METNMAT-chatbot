import { Document, Schema, model, models } from "mongoose";

/**
 * Individual chat messages inside a session
 */
export interface SessionMessage {
    role: "user" | "bot" | "agent" | "system";
    content: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

/**
 * Main session document
 */
export interface SupportSession extends Document {
    sessionId: string;
    userId?: string;
    channel: "web" | "mobile" | "whatsapp" | "slack" | "email";
    status: "active" | "pending" | "escalated" | "closed";

    context?: Record<string, unknown>; // bot memory / extracted entities
    language?: string;

    assignedAgentId?: string;
    escalationReason?: string;

    startedAt: Date;
    lastActivityAt: Date;
    endedAt?: Date;
}


/**
 * Session schema
 */
const SessionSchema = new Schema<SupportSession>(
    {
        sessionId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        userId: {
            type: String,
            index: true,
        },

        channel: {
            type: String,
            enum: ["web", "mobile", "whatsapp", "slack", "email"],
            required: true,
        },

        status: {
            type: String,
            enum: ["active", "pending", "escalated", "closed"],
            default: "active",
            index: true,
        },

        context: {
            type: Schema.Types.Mixed,
        },

        language: {
            type: String,
            default: "en",
        },

        assignedAgentId: {
            type: String,
            index: true,
        },

        escalationReason: {
            type: String,
        },

        startedAt: {
            type: Date,
            default: Date.now,
        },

        lastActivityAt: {
            type: Date,
            default: Date.now,
            index: true,
        },

        endedAt: {
            type: Date,
        },
    },
    {
        timestamps: false,
        versionKey: false,
    }
);

/**
 * Auto-update lastActivityAt on message push
 */
SessionSchema.pre("save", function () {
    this.lastActivityAt = new Date();
});

export const Session =
    models.Session ??
    model<SupportSession>("Session", SessionSchema);