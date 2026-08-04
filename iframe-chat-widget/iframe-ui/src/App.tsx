import { useRef, useEffect } from 'react';
import { useChat } from './hooks/useChat';
import { ChatHeader } from './components/ChatHeader';
import { MessageBubble } from './components/MessageBubble';
import { ChatInput } from './components/ChatInput';
import { TypingIndicator } from './components/TypingIndicator';
import { WelcomeScreen } from './components/WelcomeScreen';
import { QuickReplies } from './components/QuickReplies';
import { Loader2, History, ArrowLeft } from 'lucide-react';
import './App.css';

function App() {
  const {
    messages, sendMessage, isLoading, isConnected, isSending,
    viewingPrevious, hasPrevious, newChat, viewPrevious, backToCurrent,
  } = useChat();
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-(--c-app)">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-red-500" size={32} strokeWidth={1.5} />
          <p className="text-sm font-medium text-(--c-text-faint)">Loading chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-(--c-app) overflow-hidden font-sans selection:bg-red-100 selection:text-red-900">
      <ChatHeader
        onClose={() => window.parent.postMessage({ type: 'CLOSE_WIDGET' }, '*')}
        onNewChat={newChat}
      />

      {/* Previous-chat controls (rolling 2-session model) */}
      {viewingPrevious ? (
        <div className="flex items-center justify-between px-4 py-2 bg-(--c-surface-2) border-b border-(--c-border)">
          <span className="text-[11px] font-semibold text-(--c-text-muted) flex items-center gap-1.5">
            <History size={13} /> Viewing your previous chat
          </span>
          <button onClick={backToCurrent} className="text-[11px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1">
            <ArrowLeft size={13} /> Back to current
          </button>
        </div>
      ) : (
        hasPrevious && (
          <button
            onClick={viewPrevious}
            className="w-full px-4 py-2 bg-(--c-surface-2) border-b border-(--c-border) text-[11px] font-semibold text-(--c-text-muted) hover:text-red-600 flex items-center justify-center gap-1.5 transition-colors"
          >
            <History size={13} /> View previous chat
          </button>
        )
      )}

      {/* Connection Status Banner */}
      {!isConnected && (
        <div className="bg-amber-50 text-amber-700 text-[10px] font-semibold text-center py-1.5 uppercase tracking-wider border-b border-amber-100/50">
          Connection lost. Reconnecting...
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.length === 0 && !viewingPrevious ? (
          <WelcomeScreen onSelect={sendMessage} />
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-8">
            <p className="text-(--c-text-muted) text-xs">This chat has no messages.</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble
              key={i}
              message={msg}
              isLast={i === messages.length - 1}
            />
          ))
        )}

        {isSending && <TypingIndicator />}

        <div ref={endRef} className="h-4" />
      </main>

      {viewingPrevious ? (
        <div className="px-4 py-3 bg-(--c-surface) border-t border-(--c-border) text-center text-xs text-(--c-text-muted) font-medium">
          You're viewing a past conversation.{' '}
          <button onClick={newChat} className="text-red-600 font-bold hover:text-red-700">Start a new chat</button> to send a message.
        </div>
      ) : (
        <>
          {messages.length > 0 && <QuickReplies onSelect={sendMessage} />}
          <ChatInput onSend={sendMessage} />
        </>
      )}

      {/* Subtle branding footer */}
      <footer className="bg-(--c-surface) px-4 py-2 text-center border-t border-(--c-border)">
        <p className="text-[10px] font-medium text-(--c-text-faint) uppercase tracking-widest">
          Powered by <span className="text-(--c-text-muted) font-bold">METNMAT</span>
        </p>
      </footer>
    </div>
  );
}

export default App;
