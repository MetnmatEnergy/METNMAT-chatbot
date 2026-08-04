import { useEffect, useState, useCallback, useRef } from 'react';
import { SenderType, MessageType, type Message } from '../shared/types';

// Hosted on same server, so use relative path
const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Optional allow-list for the embedding page's origin, e.g.
 * VITE_ALLOWED_PARENT_ORIGIN=https://www.metnmat.com
 *
 * Left unset the UI still pins inbound postMessage to window.parent, which is
 * what stops an arbitrary third window driving it. Set it in the deploy env to
 * additionally pin the host, so the widget only answers the site it is for.
 */
const ALLOWED_PARENT_ORIGIN = import.meta.env.VITE_ALLOWED_PARENT_ORIGIN || '';

type Session = { token: string; conversationId: string };
type Stored = { current: Session | null; previous: Session | null };

/**
 * A send runs the whole agent pipeline — intent classification, product
 * retrieval, then the 70b model, up to 10 steps (SALES_AGENT_MAX_STEPS) — so it
 * is legitimately slow. But none of the four fetches here had a timeout at all,
 * so a hung request left the typing indicator spinning forever with no way out.
 * Generous enough not to cut off a real answer, finite enough to fail visibly.
 */
const SEND_TIMEOUT_MS = 60_000;
const SESSION_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(
    url: string,
    init: RequestInit = {},
    timeoutMs = SESSION_TIMEOUT_MS,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

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
    // The session could not be created. Distinct from "not created yet" so the
    // UI can show an error with a retry instead of an endless spinner.
    const [sessionFailed, setSessionFailed] = useState(false);
    // Synchronous in-flight latch — see the note in sendMessage.
    const sendingRef = useRef(false);
    const isConnected = true; // Always "connected" in HTTP mode logic-wise

    const persist = useCallback((data: Stored) => {
        if (!siteKey) return;
        try { localStorage.setItem(`mm-chat-${siteKey}`, JSON.stringify(data)); } catch { /* storage blocked */ }
    }, [siteKey]);

    const createSession = useCallback(async (): Promise<Session | null> => {
        if (!siteKey) return null;
        try {
            const res = await fetchWithTimeout(`${API_URL}/widget/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteKey }),
            });
            // res.ok was never checked. The session route is rate limited to
            // 20/min, and a 429 returns {error:…} — which parses as JSON
            // perfectly well, so this used to hand back
            // {token: undefined, conversationId: "undefined"}. That object is
            // truthy, so it was stored and every later send posted
            // conversationId="undefined" and 401'd forever. One office behind a
            // shared NAT, or a Cloud Run cold start, was enough.
            if (!res.ok) return null;
            const data = await res.json();
            const token = data.sessionToken ?? data.token;
            // Belt and braces: a 200 with a malformed body must not become a
            // session either.
            if (typeof token !== 'string' || !token || data.conversationId == null) return null;
            return { token, conversationId: String(data.conversationId) };
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
            // Only the embedding page may drive this UI. Without the source
            // check any window able to reach this frame could set the siteKey
            // (which scopes the whole session) or push a CART_RESULT, and
            // CART_RESULT appends a message to the transcript — so an unchecked
            // sender could put words in the assistant's mouth.
            //
            // The parent's origin is not known at build time (the widget is
            // embeddable on any approved host), so the sender is pinned to
            // window.parent rather than to a fixed origin. ALLOWED_PARENT_ORIGIN
            // narrows it further when configured.
            if (event.source !== window.parent) return;
            if (ALLOWED_PARENT_ORIGIN && event.origin !== ALLOWED_PARENT_ORIGIN) return;
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
        if (!siteKey || current || sessionFailed) return;

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
            } else {
                // Surface it. This effect cannot retry itself — its own guard
                // reads `current`, which never changed — so without a flag the
                // widget sat on a bare spinner forever with no header and no
                // way to close it from inside.
                setSessionFailed(true);
            }
        })();
    }, [siteKey, current, sessionFailed, createSession, fetchHistory, persist]);

    /** Let the visitor try again after a failed start, without reloading the page. */
    const retrySession = useCallback(() => {
        setSessionFailed(false);
    }, []);

    /**
     * Start a NEW chat: current → previous (older previous is wiped), fresh current.
     *
     * Returns false when it declines, so the caller can ask for confirmation.
     * The rolling-2 model means this is destructive: it overwrites `previous`
     * unconditionally, so two taps used to lose a real conversation for good.
     * For a B2B materials chat the transcript is a selection record.
     */
    const newChat = useCallback(async (opts?: { force?: boolean }) => {
        // Nothing to roll: the current chat is empty, so a "new" chat would just
        // discard the previous one for no gain.
        if (messages.length === 0 && !viewingPrevious) return false;
        // Rolling would destroy a previous chat that still has content.
        if (previous && !opts?.force) return false;

        const s = await createSession();
        if (!s) return false;
        const newPrevious = current; // the chat being left becomes the single "previous"
        setPrevious(newPrevious);
        setCurrent(s);
        setViewingPrevious(false);
        setMessages([]);
        persist({ current: s, previous: newPrevious });
        return true;
    }, [current, previous, messages.length, viewingPrevious, createSession, persist]);

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
        // One send at a time. The quick-reply chips and welcome buttons call
        // this directly, and tapping two is ordinary behaviour — it fired two
        // full agent pipelines, and whichever landed first deleted the other's
        // user bubble (see the id-scoped filter below), so a reply appeared
        // with no visible question.
        //
        // A REF, not the isSending state. Three taps in one tick all read the
        // same pre-render closure, where isSending is still false — a state
        // guard let all three through, which a browser test caught. A ref
        // updates synchronously, so the second tap sees the first.
        if (sendingRef.current) return;
        sendingRef.current = true;

        // Unique per send. Date.now() alone collides when two sends start in
        // the same millisecond.
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimisticMessage: Message = {
            id: tempId,
            conversationId: current.conversationId,
            sender: SenderType.USER,
            type: MessageType.TEXT,
            payload: { text },
            createdAt: new Date().toISOString(),
            status: 'sending',
        };

        setMessages(prev => [...prev, optimisticMessage]);
        setIsSending(true);

        try {
            const res = await fetchWithTimeout(`${API_URL}/widget/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: current.conversationId,
                    text,
                    sessionToken: current.token,
                }),
            }, SEND_TIMEOUT_MS);

            // res.ok was never checked, so a 401 (the token expires after 24h,
            // which any tab left open overnight hits) or a 429 returned a
            // non-array body, the `if` below was skipped, and the bubble sat
            // there marked "Sent" forever — until the NEXT successful send
            // silently deleted it.
            if (!res.ok) throw new Error(`send failed: ${res.status}`);

            const serverMessages = await res.json();
            if (!Array.isArray(serverMessages)) throw new Error('unexpected response shape');

            setMessages(prev => [
                // Only THIS send's optimistic bubble is replaced. The old filter
                // stripped every id starting with "temp-", i.e. anyone else's
                // pending message too.
                ...prev.filter(m => m.id !== tempId),
                ...serverMessages,
            ]);
        } catch (e) {
            console.error('Failed to send', e);
            // Keep the message on screen, with its text, marked failed — the
            // composer has already been cleared (ChatInput clears on submit),
            // so removing the bubble here destroyed what the customer typed.
            setMessages(prev =>
                prev.map(m => (m.id === tempId ? { ...m, status: 'failed' as const } : m)),
            );
        } finally {
            sendingRef.current = false;
            setIsSending(false);
        }
    }, [current, viewingPrevious]);

    /** Re-send a message that failed, reusing its text. */
    const retryMessage = useCallback((id: string) => {
        const failed = messages.find(m => m.id === id && m.status === 'failed');
        if (!failed) return;
        const text = (failed.payload as { text?: string }).text ?? '';
        if (!text) return;
        setMessages(prev => prev.filter(m => m.id !== id));
        void sendMessage(text);
    }, [messages, sendMessage]);

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
        sessionFailed,
        retrySession,
        retryMessage,
    };
}
