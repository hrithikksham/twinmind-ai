/**
 * settingsStore.ts
 *
 * Persisted settings. No business logic — state and setters only.
 * Persists to localStorage via zustand/middleware persist.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_ANCHOR_TOKENS } from '../services/contextBuilder';

// ─── Shape ────────────────────────────────────────────────────────────────────

export interface SettingsState {
  /** Groq API key — set by user if not using server-side env var */
  apiKey: string;

  /** Override for the suggestion system prompt (empty = use default) */
  suggestionPromptOverride: string;

  /** Override for the chat system prompt (empty = use default) */
  chatPromptOverride: string;

  /** Anchor window token budget for context builder (CLAUDE.md §3.2) */
  contextWindowTokens: number;
}

interface SettingsActions {
  setApiKey: (key: string) => void;
  setSuggestionPromptOverride: (prompt: string) => void;
  setChatPromptOverride: (prompt: string) => void;
  setContextWindowTokens: (tokens: number) => void;
  resetToDefaults: () => void;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: SettingsState = {
  apiKey: '',
  suggestionPromptOverride: '',
  chatPromptOverride: '',
  contextWindowTokens: DEFAULT_ANCHOR_TOKENS,
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setApiKey(key) {
        set({ apiKey: key });
      },
      setSuggestionPromptOverride(prompt) {
        set({ suggestionPromptOverride: prompt });
      },
      setChatPromptOverride(prompt) {
        set({ chatPromptOverride: prompt });
      },
      setContextWindowTokens(tokens) {
        set({ contextWindowTokens: tokens });
      },
      resetToDefaults() {
        set(DEFAULTS);
      },
    }),
    {
      name: 'twinmind-settings', // localStorage key
      // Only persist state fields, not action functions
      partialize: (state) => ({
        apiKey: state.apiKey,
        suggestionPromptOverride: state.suggestionPromptOverride,
        chatPromptOverride: state.chatPromptOverride,
        contextWindowTokens: state.contextWindowTokens,
      }),
    },
  ),
);