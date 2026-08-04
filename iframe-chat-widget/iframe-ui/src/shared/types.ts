export const SenderType = {
    USER: 'user',
    AGENT: 'agent',
} as const;

export type SenderType = typeof SenderType[keyof typeof SenderType];

export const MessageType = {
    TEXT: 'text',
    IMAGE: 'image',
    BUTTONS: 'buttons', // Text + Buttons
} as const;

export type MessageType = typeof MessageType[keyof typeof MessageType];

export interface TextPayload {
    text: string;
}

export interface ImagePayload {
    text?: string;
    imageUrl: string;
}

export interface ButtonAction {
    label: string;
    action: 'url' | 'call';
    value: string;
}

export interface ButtonsPayload {
    text: string;
    buttons: ButtonAction[];
}

export type MessagePayload = TextPayload | ImagePayload | ButtonsPayload;

/**
 * Delivery state of a message the user sent. Absent on anything the server
 * returned — those are delivered by definition.
 *
 * 'failed' exists so a send that did not land stays on screen with its text
 * intact and a way to retry. Previously a failed send deleted the bubble, and
 * the composer had already been cleared, so the customer's typing was simply
 * gone with no error shown.
 */
export type DeliveryStatus = 'sending' | 'failed';

export interface Message {
    id: string;
    conversationId: string;
    sender: SenderType;
    type: MessageType;
    payload: MessagePayload;
    createdAt: string; // ISO8601
    status?: DeliveryStatus;
}

export interface Visitor {
    id: string;
    createdAt: string;
}

export interface Conversation {
    id: string;
    visitorId?: string;
    visitor?: Visitor;
    siteKey: string;
    createdAt: string;
    messages?: Message[];
}

export interface ClientToServerEvents {
    send_message: (data: { conversationId: string; type: MessageType; payload: MessagePayload }) => void;
    join_conversation: (data: { conversationId: string }) => void;
}

export interface ServerToClientEvents {
    new_message: (message: Message) => void;
}

export interface SessionResponse {
    sessionToken: string;
    conversationId: string;
}

export interface InitWidgetEvent {
    type: 'INIT_WIDGET';
    siteKey: string;
}
