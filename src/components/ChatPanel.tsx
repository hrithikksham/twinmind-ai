/**
 * ChatPanel.tsx
 *
 * Right column. Chat history + input box.
 * Streams assistant tokens as they arrive — no full-message wait.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../hooks/useChat';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChatPanel({ messages, isLoading, onSendMessage }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on every new token
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    onSendMessage(text);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div style={styles.panel}>
      {/* History */}
      <div style={styles.history}>
        {messages.length === 0 && (
          <p style={styles.empty}>Click a suggestion or ask a question.</p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={styles.inputRow}>
        <textarea
          style={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question…"
          rows={2}
          disabled={isLoading}
        />
        <button
          style={{
            ...styles.sendBtn,
            opacity: isLoading || !input.trim() ? 0.45 : 1,
            cursor: isLoading || !input.trim() ? 'default' : 'pointer',
          }}
          onClick={submit}
          disabled={isLoading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        ...styles.bubble,
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        background: isUser ? '#1a73e8' : '#f3f4f6',
        color: isUser ? '#fff' : '#111827',
        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
      }}
    >
      {message.content || (message.streaming ? <span style={styles.cursor}>▍</span> : null)}
      {message.streaming && message.content && (
        <span style={styles.cursor}>▍</span>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  panel: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    height: '100%',
    fontFamily: 'system-ui, sans-serif',
  },
  history: {
    flex: 1,
    overflowY: 'auto' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 8,
    padding: '12px 8px',
  },
  empty: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center' as const,
    marginTop: 24,
  },
  bubble: {
    maxWidth: '80%',
    padding: '8px 12px',
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  cursor: {
    display: 'inline-block' as const,
    animation: 'blink 0.8s step-end infinite',
    opacity: 0.7,
    marginLeft: 1,
  },
  inputRow: {
    display: 'flex' as const,
    gap: 6,
    padding: '8px',
    borderTop: '1px solid #e5e7eb',
    alignItems: 'flex-end' as const,
  },
  textarea: {
    flex: 1,
    resize: 'none' as const,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1.4,
    outline: 'none',
  },
  sendBtn: {
    padding: '7px 16px',
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    height: 34,
  },
} as const;