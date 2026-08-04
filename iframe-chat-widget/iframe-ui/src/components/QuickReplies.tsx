/** Decision-oriented follow-ups shown above the input once a conversation is underway. */
const FOLLOWUPS = [
    { label: 'Compare options', q: 'Can you compare the best options for my needs?' },
    { label: 'Help me choose', q: 'Help me choose the right product for my application' },
    { label: 'See specifications', q: 'Show me the detailed specifications' },
    { label: 'Request a quote', q: 'I would like to request a quote' },
    { label: 'Talk to an engineer', q: 'I would like to talk to an engineer' },
];

export function QuickReplies({ onSelect }: { onSelect: (text: string) => void }) {
    return (
        <div
            className="px-4 pt-2.5 pb-0.5 flex gap-2 overflow-x-auto"
            style={{ scrollbarWidth: 'none' }}
        >
            {FOLLOWUPS.map((f, i) => (
                <button
                    key={i}
                    onClick={() => onSelect(f.q)}
                    className="flex-shrink-0 whitespace-nowrap text-xs font-semibold px-3 py-1.5 rounded-full border border-(--c-border) bg-(--c-surface) text-(--c-text-muted) hover:border-red-400 hover:text-red-600 transition-colors"
                >
                    {f.label}
                </button>
            ))}
        </div>
    );
}
