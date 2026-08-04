import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';

export function TypingIndicator() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2.5 w-full items-start"
        >
            <div className="shrink-0 w-8 h-8 rounded-full bg-(--c-surface) border border-(--c-border) text-red-600 flex items-center justify-center shadow-sm">
                <Bot size={16} strokeWidth={2.5} />
            </div>

            <div className="bg-(--c-surface) text-(--c-text) border border-(--c-border) py-3 px-4 rounded-2xl rounded-tl-none shadow-[0_2px_15px_-3px_rgba(0,0,0,0.06)]">
                <div className="flex gap-1 justify-center items-center h-4 w-8">
                    {[0, 1, 2].map((i) => (
                        <motion.div
                            key={i}
                            className="w-1.5 h-1.5 bg-(--c-text-faint) rounded-full"
                            animate={{
                                scale: [1, 1.3, 1],
                                opacity: [0.4, 1, 0.4]
                            }}
                            transition={{
                                duration: 1,
                                repeat: Infinity,
                                delay: i * 0.2,
                                ease: "easeInOut"
                            }}
                        />
                    ))}
                </div>
            </div>
        </motion.div>
    );
}
