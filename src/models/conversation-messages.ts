import mongoose, {
    Schema,
    type Document,
    type Model,
} from "mongoose";

/**
 * Who sent the message
 */
export enum Role {
    USER = "user",
    ASSISTANT = "assistant",
    SYSTEM = "system",
}

/**
 * Message content structure
 * (supports plain text today, extensible tomorrow)
 */
export interface MessageContent {
    text: string;
}

/**
 * Core message interface
 */
export interface ConversationMessage {
    messageId: string;            // Unique message ID (UUID / WhatsApp ID)
    conversationId?: string;       // One conversation per user/session

    role: Role;       // user | assistant | system
    content: MessageContent;

    user: {
        phone: string;        // WhatsApp number (E.164)
        name?: string;              // User name (if available)
    };
}

/**
 * Mongoose document type
 */
export type ConversationMessageDocument =
    ConversationMessage & Document;

/**
 * Schema definition
 */
const ConversationMessageSchema =
    new Schema<ConversationMessageDocument>(
        {
            messageId: {
                type: String,
                required: true,
            },

            conversationId: {
                type: String,
            },

            role: {
                type: String,
                enum: ["user", "assistant", "system"],
                required: true,
            },

            content: {
                text: {
                    type: String,
                    required: true,
                },
            },

            user: {
                phone: {
                    type: String,
                    required: true,
                },
                name: {
                    type: String,
                },
            },
        },
        {
            collection: "conversation_messages",
            timestamps: true,
        }
    );


export const createConversationMessage = async (message: ConversationMessage) => {
    const newMessage = new ConversationMessageModel(message);
    await newMessage.save();
    return newMessage;
};

/**
 * Hot-reload safe export (ESM)
 */
export const ConversationMessageModel: Model<ConversationMessageDocument> =
    mongoose.models?.ConversationMessage ??
    mongoose.model<ConversationMessageDocument>(
        "ConversationMessage",
        ConversationMessageSchema
    );
