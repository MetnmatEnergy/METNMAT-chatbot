import { useState, useRef, useEffect } from 'react';
import { SendHorizonal } from 'lucide-react';

interface ChatInputProps {
    onSend: (text: string) => void;
}

export function ChatInput({ onSend }: ChatInputProps) {
    const [value, setValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = () => {
        if (!value.trim()) return;
        onSend(value);
        setValue('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Auto-resize
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
        }
    }, [value]);

    return (
        <div className="p-4 bg-(--c-surface) border-t border-(--c-border)">
            <div className="flex items-end gap-2 bg-(--c-surface-2) border border-(--c-border) rounded-2xl px-2.5 py-2.5 focus-within:ring-4 focus-within:ring-red-100/50 focus-within:border-red-400 transition-all">

                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about products, specs, or pricing…"
                    className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 py-2 px-2.5 text-sm text-(--c-text) placeholder:text-(--c-text-faint) leading-snug font-medium"
                    rows={1}
                    style={{ minHeight: '40px' }}
                />

                <button
                    onClick={handleSend}
                    disabled={!value.trim()}
                    className="mb-1 p-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-0 disabled:pointer-events-none transition-all shadow-md shadow-red-200/60 active:scale-90 shrink-0"
                >
                    <SendHorizonal size={20} strokeWidth={2.5} />
                </button>
            </div>
        </div>
    );
}
