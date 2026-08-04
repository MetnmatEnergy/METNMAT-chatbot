import { useEffect, useState, useCallback } from 'react';
import { SenderType, MessageType, type Message } from '../shared/types';

// Hosted on same server, so use relative path
const API_URL = import.meta.env.VITE_API_URL || '';

type Session = { token: string; conversationId: string };
type Stored = { current: Session | null; previous: Session | null };

/**
 * Rolling 2-session model: at most ONE current + ONE previous chat are kept.
 * "New chat" rolls the current into the previous slot (wiping the older previous),
 * and starts a fresh current. The previous chat can be viewed read-only.
 */
export function useChat() {
    const [siteKey, setSiteKey] = useState<string | null>(null);
    const [current, setCurrent] = useState<Session | null>(null);
    const [previous, setPrevious] = useState<Session | null>(null);
    const [viewingPrevious, setViewingPrevious] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isSending, setIsSending] = useState(false);
    const isConnected = true; // Always "connected" in HTTP mode logic-wise

    const persist = useCallback((data: Stored) => {
        if (!siteKey) return;
        try { localStorage.setItem(`mm-chat-${siteKey}`, JSON.stringify(data)); } catch { /* storage blocked */ }
    }, [siteKey]);

    const createSession = useCallback(async (): Promise<Session | null> => {
        if (!siteKey) return null;
        try {
            const res = await fetch(`${API_URL}/widget/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteKey }),
            });
            const data = await res.json();
            return { token: data.sessionToken ?? data.token, conversationId: String(data.conversationId) };
        } catch (e) {
            console.error('createSession failed', e);
            return null;
        }
    }, [siteKey]);

    /** Returns the conversation's messages, or null if the session is invalid/expired. */
    const fetchHistory = useCallback(async (s: Session): Promise<Message[] | null> => {
        try {
            const res = await fetch(
                `${API_URL}/widget/messages?conversationId=${encodeURIComponent(s.conversationId)}&sessionToken=${encodeURIComponent(s.token)}`
            );
            if (!res.ok) return null;
            const h = await res.json();
            return Array.isArray(h) ? h : [];
        } catch {
            return null;
        }
    }, []);

    // 1. Listen for INIT + theme from the parent; announce readiness.
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (event.data?.type === 'INIT_WIDGET' && event.data?.siteKey) {
                setSiteKey(event.data.siteKey);
            }
            const t = event.data?.type;
            if ((t === 'INIT_WIDGET' || t === 'THEME_CHANGE') && event.data?.theme) {
                document.documentElement.classList.toggle('dark', event.data.theme === 'dark');
            }
            // Host site confirms an Add-to-cart action → show it inline in the chat.
            if (t === 'CART_RESULT') {
                const ok = !!event.data.ok;
                const name = event.data.name || 'Item';
                setMessages(prev => [...prev, {
                    id: `cart-${Date.now()}`,
                    conversationId: '',
                    sender: SenderType.AGENT,
                    type: MessageType.BUTTONS,
                    payload: ok
                        ? {
                            text: `✅ ${name} has been added to your cart.`,
                            buttons: [
                                { label: 'View cart', action: 'url', value: 'https://www.metnmat.com/cart' },
                                { label: 'Checkout', action: 'url', value: 'https://www.metnmat.com/checkout' },
                            ],
                          }
                        : {
                            text: `Sorry, I couldn't add that to the cart${event.data.error ? ` (${event.data.error})` : ''}. You can open the product page and add it from there.`,
                            buttons: [{ label: 'Browse the shop', action: 'url', value: 'https://www.metnmat.com/shop' }],
                          },
                    createdAt: new Date().toISOString(),
                } as Message]);
            }
        };
        window.addEventListener('message', handler);
        window.parent.postMessage({ type: 'WIDGET_READY' }, '*');
        return () => window.removeEventListener('message', handler);
    }, []);

    // 2. Restore the current session (survives reloads) or create a fresh one.
    useEffect(() => {
        if (!siteKey || current) return;

        let stored: Stored | null = null;
        try { stored = JSON.parse(localStorage.getItem(`mm-chat-${siteKey}`) || 'null'); } catch { stored = null; }
        const prev = stored?.previous ?? null;

        (async () => {
            if (stored?.current?.token && stored?.current?.conversationId) {
                const hist = await fetchHistory(stored.current);
                if (hist !== null) {
                    setCurrent(stored.current);
                    setPrevious(prev);
                    setMessages(hist);
                    return;
                }
            }
            // No valid current → make one (keep any valid previous).
            const s = await createSession();
            if (s) {
                setCurrent(s);
                setPrevious(prev);
                setMessages([]);
                persist({ current: s, previous: prev });
            }
        })();
    }, [siteKey, current, createSession, fetchHistory, persist]);

    /** Start a NEW chat: current → previous (older previous is wiped), fresh current. */
    const newChat = useCallback(async () => {
        const s = await createSession();
        if (!s) return;
        const newPrevious = current; // the chat being left becomes the single "previous"
        setPrevious(newPrevious);
        setCurrent(s);
        setViewingPrevious(false);
        setMessages([]);
        persist({ current: s, previous: newPrevious });
    }, [current, createSession, persist]);

    /** View the previous chat (read-only). */
    const viewPrevious = useCallback(async () => {
        if (!previous) return;
        setViewingPrevious(true);
        const hist = await fetchHistory(previous);
        setMessages(hist ?? []);
    }, [previous, fetchHistory]);

    /** Return to the current chat. */
    const backToCurrent = useCallback(async () => {
        setViewingPrevious(false);
        if (!current) { setMessages([]); return; }
        const hist = await fetchHistory(current);
        setMessages(hist ?? []);
    }, [current, fetchHistory]);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || !current || viewingPrevious) return;

        const optimisticMessage: Message = {
            id: `temp-${Date.now()}`,
            conversationId: current.conversationId,
            sender: SenderType.USER,
            type: MessageType.TEXT,
            payload: { text },
            createdAt: new Date().toISOString(),
        };

        setMessages(prev => [...prev, optimisticMessage]);
        setIsSending(true);

        try {
            const res = await fetch(`${API_URL}/widget/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: current.conversationId,
                    text,
                    sessionToken: current.token,
                }),
            });

            const serverMessages = await res.json();
            if (Array.isArray(serverMessages)) {
                setMessages(prev => {
                    const filtered = prev.filter(m => !m.id.startsWith('temp-'));
                    return [...filtered, ...serverMessages];
                });
            }
        } catch (e) {
            console.error('Failed to send', e);
            setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
        } finally {
            setIsSending(false);
        }
    }, [current, viewingPrevious]);

    return {
        siteKey,
        messages,
        sendMessage,
        isConnected,
        isSending,
        isLoading: !siteKey || (!current && !!siteKey),
        viewingPrevious,
        hasPrevious: !!previous,
        newChat,
        viewPrevious,
        backToCurrent,
    };
}
