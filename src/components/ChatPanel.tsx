/**
 * ChatPanel.tsx 
 * Right column. Shows the back-and-forth conversation with the assistant.
 * Each message bubble may be from the user or the assistant, and may be streaming (in which case it shows a pulsing cursor).
 * The input box at the bottom allows the user to type and send new messages, which are handled by the parent component.
 * The panel automatically scrolls to the bottom when new messages arrive.
 * The design emphasizes clarity and responsiveness, with distinct styles for user vs assistant messages and a clean input area.  
 */

import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../hooks/useChat';

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
}

export function ChatPanel({ messages, isLoading, onSendMessage }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

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
    <div className="flex flex-col h-full">

      {/* ─── Chat History ───────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">

        {messages.length === 0 && (
          <div className="text-sm text-gray-400 text-center mt-10">
            Click a suggestion or ask something…
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* ─── Input ─────────────────────────────── */}
      <div className="px-4 pb-4 pt-2">

        <div className="
          flex items-end gap-2
          bg-white/80 backdrop-blur-md
          rounded-2xl px-3 py-2
          shadow-sm border border-gray-200
        ">

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask something…"
            rows={1}
            disabled={isLoading}
            className="
              flex-1 resize-none bg-transparent
              text-sm text-gray-900
              outline-none
              placeholder:text-gray-400
              leading-relaxed
            "
          />

          <button
            onClick={submit}
            disabled={isLoading || !input.trim()}
            className={`
              text-sm font-medium px-3 py-1.5 rounded-lg
              transition
              ${
                isLoading || !input.trim()
                  ? 'text-gray-300 cursor-default'
                  : 'text-blue-600 hover:bg-blue-50'
              }
            `}
          >
            Send
          </button>

        </div>

      </div>
    </div>
  );
}

// ─── Message Bubble ─────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`max-w-[75%] px-4 py-2.5 text-[14px] leading-relaxed rounded-2xl
        ${
          isUser
            ? 'ml-auto bg-blue-600 text-white'
            : 'mr-auto bg-gray-100 text-gray-900'
        }
      `}
    >
      {/* Content */}
      {message.content || (message.streaming ? <Cursor /> : null)}

      {/* Streaming cursor */}
      {message.streaming && message.content && <Cursor />}
    </div>
  );
}

// ─── Cursor (streaming feel) ───────────────────────

function Cursor() {
  return (
    <span className="inline-block ml-1 animate-pulse opacity-70">
      ▍
    </span>
  );
}