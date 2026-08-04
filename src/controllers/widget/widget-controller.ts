import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { WidgetVisitor } from '../../models/widget/WidgetVisitor';
import { WidgetConversation } from '../../models/widget/WidgetConversation';
import { WidgetMessage } from '../../models/widget/WidgetMessage';
import { SenderType, MessageType } from '../../types/widget-types';
import connectToDb from '../../lib/connect-to-db';
import { processCustomerMessage } from '../../lib/chat-orchestrator';
import { config } from '../../config/env';

const JWT_SECRET = config.app.jwtSecret;

function verifySessionToken(token: string): { conversationId: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { conversationId?: string };
    if (!payload?.conversationId) return null;
    return { conversationId: payload.conversationId };
  } catch {
    return null;
  }
}

export const createSession = async (req: Request, res: Response) => {
    try {
        const { siteKey } = req.body;
        if (!siteKey) {
            res.status(400).json({ error: 'siteKey is required' });
            return;
        }

        await connectToDb();

        const visitor = new WidgetVisitor();
        await visitor.save();

        const conversation = new WidgetConversation({
            siteKey,
            visitor: visitor._id,
        });
        await conversation.save();

        const payload = {
            conversationId: conversation._id.toString(),
            visitorId: visitor._id.toString(),
            siteKey,
            role: 'user',
        };

        const sessionToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

        res.json({
            sessionToken,
            token: sessionToken,
            conversationId: conversation._id.toString(),
        });
    } catch (error) {
        console.error('Create Session Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const createAgentSession = async (_req: Request, res: Response) => {
    try {
        const payload = { id: 'agent-1', role: 'agent', name: 'Metnmat Support' };
        const sessionToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
        res.json({ sessionToken });
    } catch (error) {
        console.error('Agent Login Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getConversations = async (_req: Request, res: Response) => {
    try {
        await connectToDb();
        const conversations = await WidgetConversation.find()
            .sort({ createdAt: -1 })
            .populate('visitor')
            .limit(50)
            .lean();
        res.json(conversations);
    } catch {
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
};

export const getMessages = async (req: Request, res: Response) => {
    try {
        const conversationId = (req.query.conversationId as string) || '';
        const sessionToken =
            (req.query.sessionToken as string) || (req.headers['x-session-token'] as string) || '';

        if (!conversationId) {
            res.status(400).json({ error: 'conversationId is required' });
            return;
        }

        // Require a valid token bound to this conversation (prevents reading others' chats).
        const verified = sessionToken ? verifySessionToken(sessionToken) : null;
        if (!verified || verified.conversationId !== conversationId) {
            res.status(401).json({ error: 'Invalid session' });
            return;
        }

        await connectToDb();
        const messages = await WidgetMessage.find({ conversation: conversationId })
            .sort({ createdAt: 1 })
            .limit(200)
            .lean();

        res.json(messages.map((m) => ({ ...m, id: m._id })));
    } catch (error) {
        console.error('Get Messages Error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
};

export const sendMessage = async (req: Request, res: Response) => {
    try {
        const { conversationId, text, sessionToken } = req.body;

        if (!conversationId || !text?.trim()) {
            res.status(400).json({ error: 'conversationId and text are required' });
            return;
        }

        // Token is MANDATORY (mirror getMessages) — without this, omitting the
        // token bypassed the per-conversation ownership check and let anyone post
        // into / drive the LLM on arbitrary conversations.
        const verified = sessionToken ? verifySessionToken(sessionToken) : null;
        if (!verified || verified.conversationId !== conversationId) {
            res.status(401).json({ error: 'Invalid session' });
            return;
        }

        await connectToDb();

        const userMsg = await WidgetMessage.create({
            conversation: conversationId,
            sender: SenderType.USER,
            type: MessageType.TEXT,
            payload: { text },
        });

        let finalPayload: Record<string, unknown> = { text: "I'm sorry, I couldn't process that." };
        let messageType: MessageType = MessageType.TEXT;

        try {
            const userId = `widget-${conversationId}`;
            const result = await processCustomerMessage({
                userId,
                userName: 'Web Visitor',
                text: text.trim(),
                messageId: userMsg._id.toString(),
                channel: 'widget',
            });

            finalPayload = { text: result.message };

            if (result.productImageLink) {
                finalPayload.imageUrl = result.productImageLink;
                messageType = MessageType.IMAGE;
            }

            if (result.buttons?.length) {
                finalPayload.buttons = result.buttons.map((b) => ({
                    label: b.text,
                    action: b.url.startsWith('tel:')
                        ? 'call'
                        : b.url.startsWith('mailto:')
                          ? 'email'
                          : b.url.startsWith('cart:')
                            ? 'add_to_cart'
                            : 'url',
                    // cart:<SKU> → the SKU itself; the widget adds it to the site cart.
                    value: b.url.startsWith('cart:') ? b.url.slice(5) : b.url,
                }));
                messageType = MessageType.BUTTONS;
            }
        } catch (aiError) {
            console.error('AI Generation Error:', aiError);
            finalPayload = {
                text: 'Sorry, I am having trouble right now. Please call +91-7872686501 or email contact@metnmat.com.',
            };
        }

        const agentMsg = await WidgetMessage.create({
            conversation: conversationId,
            sender: SenderType.AGENT,
            type: messageType,
            payload: finalPayload,
        });

        res.json([
            { ...userMsg.toObject(), id: userMsg._id },
            { ...agentMsg.toObject(), id: agentMsg._id },
        ]);
    } catch (error) {
        console.error('Send Message Error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
};
