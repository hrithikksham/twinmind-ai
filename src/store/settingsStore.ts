/**
 * settingsStore.ts
 *
 * Persisted settings. No business logic — state and setters only.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_ANCHOR_TOKENS } from '../services/contextBuilder';

// ─── Shape ─────────────────────────────────────────

export interface SettingsState {
  /** Groq API key — used across mic, chat, suggestions */
  groqApiKey: string;

  suggestionPromptOverride: string;
  chatPromptOverride: string;

  contextWindowTokens: number;
}

interface SettingsActions {
  setGroqApiKey: (key: string) => void;
  setSuggestionPromptOverride: (prompt: string) => void;
  setChatPromptOverride: (prompt: string) => void;
  setContextWindowTokens: (tokens: number) => void;
  resetToDefaults: () => void;
}

// ─── Defaults ──────────────────────────────────────

const DEFAULTS: SettingsState = {
  groqApiKey: '',
  suggestionPromptOverride: '',
  chatPromptOverride: '',
  contextWindowTokens: DEFAULT_ANCHOR_TOKENS,
};

// ─── Store ─────────────────────────────────────────

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setGroqApiKey(key) {
        set({ groqApiKey: key });
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
      name: 'twinmind-settings',

      partialize: (state) => ({
        groqApiKey: state.groqApiKey,
        suggestionPromptOverride: state.suggestionPromptOverride,
        chatPromptOverride: state.chatPromptOverride,
        contextWindowTokens: state.contextWindowTokens,
      }),
    },
  ),
);