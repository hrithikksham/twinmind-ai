// src/store/chatStore.ts

import { create } from 'zustand';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type ChatStore = {
  messages: ChatMessage[];
  isLoading: boolean;

  addUserMessage: (content: string) => void;
  startAssistantMessage: () => string;
  appendToAssistantMessage: (id: string, chunk: string) => void;

  setLoading: (loading: boolean) => void;
  clearChat: () => void;
};

function generateId() {
  return Math.random().toString(36).slice(2);
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isLoading: false,

  addUserMessage: (content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: generateId(),
          role: 'user',
          content,
        },
      ],
    })),

  startAssistantMessage: () => {
    const id = generateId();

    set((state) => ({
      messages: [
        ...state.messages,
        {
          id,
          role: 'assistant',
          content: '',
        },
      ],
    }));

    return id;
  },

  appendToAssistantMessage: (id, chunk) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id
          ? { ...msg, content: msg.content + chunk }
          : msg
      ),
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  clearChat: () => set({ messages: [] }),
}));