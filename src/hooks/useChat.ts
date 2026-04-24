/**
 * useChat.ts
 *
 * Owns chat message state and streaming updates.
 * Calls chatService (pure) — no fetch logic here.
 */

import { useCallback, useRef, useState } from 'react';
import { sendMessage, sendDetailPrompt, capHistory } from '../services/chatService';
import type { ChatTurn } from '../services/chatService';
import type { Suggestion } from '../utils/validators';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** True while this message is still receiving stream tokens */
  streaming: boolean;
}

interface UseChatOptions {
  /** Full current transcript — refreshed per turn (CLAUDE.md §5) */
  getTranscript: () => string;
  groqApiKey: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  sendMessage: (text: string) => void;
  sendSuggestion: (suggestion: Suggestion) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChat({ getTranscript, groqApiKey }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Keep a ref to the current abort controller so we can cancel in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  // ── Core dispatch ──────────────────────────────────────────────────────────

  const dispatch = useCallback(
    (userText: string, isDetailPrompt: boolean) => {
      if (!userText.trim()) return;

      // Cancel any in-flight stream
      abortRef.current?.abort();

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userText,
        streaming: false,
      };

      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
      };

      setMessages((prev) => {
        const capped = capHistory(prev) as ChatMessage[];
        return [...capped, userMsg, assistantMsg];
      });
      setIsLoading(true);

      // Build turn history from current messages (before appending new ones)
      // Cast to ChatTurn[] — role subset is compatible
      const history: ChatTurn[] = messages
        .slice(-10)
        .map(({ role, content }) => ({ role, content }));

      const input = {
        message: userText,
        transcript: getTranscript(),
        history,
        groqApiKey,
        onToken(token: string) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + token } : m,
            ),
          );
        },
        onDone() {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, streaming: false } : m,
            ),
          );
          setIsLoading(false);
        },
        onError(err: Error) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Error: ${err.message}`, streaming: false }
                : m,
            ),
          );
          setIsLoading(false);
        },
      };

      const controller = isDetailPrompt
        ? sendDetailPrompt(input)
        : sendMessage(input);

      abortRef.current = controller;
    },
    [messages, getTranscript, groqApiKey],
  );

  // ── Public API ─────────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(
    (text: string) => dispatch(text, false),
    [dispatch],
  );

  const handleSendSuggestion = useCallback(
    (suggestion: Suggestion) => dispatch(suggestion.detail_prompt, true),
    [dispatch],
  );

  return {
    messages,
    isLoading,
    sendMessage: handleSendMessage,
    sendSuggestion: handleSendSuggestion,
  };
}