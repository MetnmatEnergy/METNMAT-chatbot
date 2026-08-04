import { Router } from 'express';
import { createSession, createAgentSession, getConversations, getMessages, sendMessage } from '../controllers/widget/widget-controller';
import { requireAgentKey } from '../middlewares/require-agent-key.middleware';
import { rateLimit } from '../lib/rate-limit';

const router = Router();

// Throttle the unauthenticated, LLM-driving endpoints (Groq/WhatsApp cost + DoS).
const sessionLimiter = rateLimit({ keyPrefix: 'widget-session', limit: 20, windowMs: 60_000 });
const messageLimiter = rateLimit({ keyPrefix: 'widget-message', limit: 20, windowMs: 60_000 });

router.post('/session', sessionLimiter, createSession);
// Agent-only: minting an agent token and listing ALL conversations now require
// the AGENT_API_KEY (x-agent-key). Previously both were fully unauthenticated.
router.post('/session/agent', requireAgentKey, createAgentSession);
router.get('/conversations', requireAgentKey, getConversations);
router.post('/message', messageLimiter, sendMessage);
router.get('/messages', getMessages);

export default router;
