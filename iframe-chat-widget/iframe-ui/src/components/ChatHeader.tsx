import { X, PenSquare } from 'lucide-react';

interface ChatHeaderProps {
    onClose: () => void;
    onNewChat: () => void;
}

export function ChatHeader({ onClose, onNewChat }: ChatHeaderProps) {
    return (
        <header className="bg-(--c-surface) backdrop-blur-md px-5 py-4 border-b border-(--c-border) flex justify-between items-center sticky top-0 z-20 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-3">
                <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shadow-lg shadow-red-200/60 ring-4 ring-red-50 dark:ring-red-500/10">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                    </div>
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-(--c-surface) rounded-full"></div>
                </div>

                <div className="flex flex-col">
                    <h1 className="font-bold text-(--c-text) text-base tracking-tight leading-none mb-1">Metnmat Support</h1>
                    <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        <p className="text-[11px] text-(--c-text-muted) font-medium tracking-wide">Online · replies in seconds</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-1">
                <button
                    onClick={onNewChat}
                    className="p-2 text-(--c-text-faint) hover:text-red-600 hover:bg-(--c-surface-2) rounded-xl transition-all active:scale-90"
                    aria-label="New chat"
                    title="New chat"
                >
                    <PenSquare size={19} strokeWidth={2.3} />
                </button>
                <button
                    onClick={onClose}
                    className="p-2 text-(--c-text-faint) hover:text-(--c-text) hover:bg-(--c-surface-2) rounded-xl transition-all active:scale-90"
                    aria-label="Close chat"
                    title="Close"
                >
                    <X size={20} strokeWidth={2.5} />
                </button>
            </div>
        </header>
    );
}
