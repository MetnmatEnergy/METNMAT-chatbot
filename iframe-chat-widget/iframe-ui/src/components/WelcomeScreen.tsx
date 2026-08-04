import { motion } from 'framer-motion';
import { Boxes, FlaskConical, FileText, Headphones, ArrowRight } from 'lucide-react';

/** One-tap starting points so customers aren't faced with a blank box. */
const SUGGESTIONS = [
    { icon: Boxes, label: 'Browse our products', query: 'What products do you sell?' },
    { icon: FlaskConical, label: 'Explore electrodes', query: 'Tell me about your electrodes' },
    { icon: FileText, label: 'Get a price quote', query: 'How do I get a price quote?' },
    { icon: Headphones, label: 'Talk to our team', query: 'How can I contact your sales team?' },
];

export function WelcomeScreen({ onSelect, disabled }: { onSelect: (text: string) => void; disabled?: boolean }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="min-h-full flex flex-col justify-center px-1 py-4"
        >
            <div className="flex flex-col items-center text-center mb-5">
                <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shadow-lg shadow-red-300/40 mb-3">
                    <FlaskConical className="w-7 h-7 text-white" strokeWidth={2} />
                </div>
                <h2 className="text-(--c-text) font-bold text-lg tracking-tight">Welcome to Metnmat 👋</h2>
                <p className="text-(--c-text-muted) text-sm mt-1.5 leading-relaxed max-w-[19rem]">
                    I'm your lab-equipment specialist. Ask about electrodes, membranes, reactors, specs or pricing — or start with a topic below.
                </p>
            </div>

            <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s, i) => {
                    const Icon = s.icon;
                    return (
                        <motion.button
                            key={i}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 * i + 0.1 }}
                            whileHover={{ x: 2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => onSelect(s.query)}
                            disabled={disabled}
                            className="group flex items-center gap-3 w-full text-left px-3.5 py-3 rounded-xl border border-(--c-border) bg-(--c-surface) hover:border-red-400/70 text-(--c-text) text-sm font-medium transition-all shadow-sm"
                        >
                            <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-(--c-surface-2) group-hover:bg-red-600 group-hover:text-white text-red-600 flex items-center justify-center transition-colors">
                                <Icon size={16} strokeWidth={2.2} />
                            </span>
                            <span className="flex-1">{s.label}</span>
                            <ArrowRight size={16} className="text-(--c-text-faint) group-hover:text-red-600 transition-colors" />
                        </motion.button>
                    );
                })}
            </div>
        </motion.div>
    );
}
