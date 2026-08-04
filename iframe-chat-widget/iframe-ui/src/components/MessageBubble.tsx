import { motion } from 'framer-motion';
import { SenderType, type Message } from '../shared/types';
import { cn, formatTime } from '../lib/utils'; // Ensure utils exists or fix imports
import { Bot, User, ShoppingCart } from 'lucide-react';

interface MessageBubbleProps {
    message: Message;
    isLast?: boolean; // Optional if not used logic-wise yet
}

/** Ask the parent page (widget loader) to change the page — always in the SAME tab. */
function requestNavigate(url: string) {
    try {
        window.parent.postMessage({ type: 'NAVIGATE', url }, '*');
    } catch {
        // Fallback (parent unreachable): still navigate same-tab, never a new tab.
        try { (window.top || window).location.href = url; } catch { /* navigation blocked */ }
    }
}

/** Ask the host site to add a product (by SKU) to the shop cart. */
function requestAddToCart(sku: string) {
    try {
        window.parent.postMessage({ type: 'ADD_TO_CART', sku }, '*');
    } catch { /* parent unreachable */ }
}

const URL_SPLIT = /(https?:\/\/[^\s<>"')]+)/g;

/** Turn raw URLs in message text into clickable links that navigate via the parent. */
function linkify(text: string, isUser: boolean) {
    if (!text) return text;
    return text.split(URL_SPLIT).map((part, i) => {
        if (/^https?:\/\//.test(part)) {
            const trail = part.match(/[.,;:!?)]+$/)?.[0] ?? '';
            const url = trail ? part.slice(0, part.length - trail.length) : part;
            return (
                <span key={i}>
                    <a
                        href={url}
                        onClick={(e) => { e.preventDefault(); requestNavigate(url); }}
                        className={cn(
                            'font-semibold underline decoration-1 underline-offset-2 break-all cursor-pointer',
                            isUser ? 'text-white' : 'text-red-600 hover:text-red-700'
                        )}
                    >
                        {url}
                    </a>
                    {trail}
                </span>
            );
        }
        return <span key={i}>{part}</span>;
    });
}

export function MessageBubble({ message }: MessageBubbleProps) {
    const isUser = message.sender === SenderType.USER;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={cn(
                "flex gap-2.5 w-full",
                isUser ? "flex-row-reverse" : "flex-row"
            )}
        >
            {/* Avatar */}
            <div className={cn(
                "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm select-none",
                isUser
                    ? "bg-red-600 text-white"
                    : "bg-(--c-surface) border border-(--c-border) text-red-600"
            )}>
                {isUser ? <User size={14} strokeWidth={2.5} /> : <Bot size={16} strokeWidth={2.5} />}
            </div>

            <div className={cn(
                "flex flex-col max-w-[85%]",
                isUser ? "items-end" : "items-start"
            )}>
                {/* Bubble content */}
                <div className={cn(
                    "py-3 px-4 text-sm leading-relaxed break-words w-full",
                    isUser
                        ? "bg-(--primary) text-white rounded-2xl rounded-tr-none shadow-(--button-shadow)"
                        : "bg-(--c-surface) text-(--c-text) border border-(--c-border) rounded-2xl rounded-tl-none overflow-hidden shadow-(--card-shadow)"
                )}>
                    {/* Render Image if exists in payload */}
                    {(message.payload as any).imageUrl && (
                        <div className="mb-3 -mx-4 -mt-3 overflow-hidden border-b border-(--c-border) group">
                            <img
                                src={(message.payload as any).imageUrl}
                                alt="Product"
                                className="w-full h-auto object-cover max-h-52 hover:scale-105 transition-transform duration-700 ease-out"
                            />
                        </div>
                    )}

                    <p className={cn(
                        "whitespace-pre-wrap font-medium leading-relaxed tracking-tight",
                        isUser ? "text-white" : "text-(--c-text)"
                    )}>
                        {linkify((message.payload as any).text, isUser)}
                    </p>

                    {/* Render Buttons if they exist in the payload */}
                    {(message.payload as any).buttons && (message.payload as any).buttons.length > 0 && (
                        <div className="mt-4 flex flex-col gap-2.5">
                            {(message.payload as any).buttons.map((btn: any, idx: number) => {
                                const isCart = btn.action === 'add_to_cart';
                                const href = btn.value;
                                return (
                                <motion.a
                                    whileHover={{ y: -2, scale: 1.01 }}
                                    whileTap={{ scale: 0.98 }}
                                    key={idx}
                                    href={isCart ? '#' : href}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (isCart) requestAddToCart(href);
                                        else requestNavigate(href);
                                    }}
                                    className={cn(
                                        "flex items-center justify-center gap-2 w-full py-2.5 px-4 font-bold rounded-xl transition-all active:scale-[0.98] text-center no-underline cursor-pointer",
                                        isCart
                                            ? "border border-(--primary) bg-(--c-surface) text-(--primary) hover:bg-(--primary) hover:text-white"
                                            : "bg-(--primary) hover:bg-(--primary-dark) text-white shadow-(--button-shadow) border border-transparent"
                                    )}
                                >
                                    {isCart && <ShoppingCart size={15} strokeWidth={2.5} />}
                                    {btn.label}
                                </motion.a>
                            );})}
                        </div>
                    )}
                </div>

                {/* Time */}
                <span className="text-[10px] text-(--c-text-faint) mt-1.5 px-1 font-semibold opacity-70 flex items-center gap-1 uppercase tracking-tighter">
                    {formatTime(message.createdAt)}
                    {isUser && <span className="text-red-500 font-bold">• Sent</span>}
                </span>
            </div>
        </motion.div>
    );
}
