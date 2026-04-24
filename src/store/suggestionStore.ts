/**
 * suggestionStore.ts
 *
 * Zustand store for suggestion state.
 * Holds ALL batches for the session (for export/QA).
 * Business logic lives in useSuggestions hook — this is pure state.
 */

import { create } from 'zustand';
import type { SuggestionBatch } from '../utils/validators';

export interface StoredBatch {
  id: string;
  timestamp: string; // ISO — when this batch was generated
  batch: SuggestionBatch;
  anchorWindowSnapshot: string; // exact anchor text sent to model (for QA export)
  refreshFailed: boolean; // true if last refresh failed and this is a stale fallback
}

interface SuggestionState {
  // All batches in this session — append-only, used for export/audit
  allBatches: StoredBatch[];

  // The batch currently displayed in the suggestion panel
  currentBatch: StoredBatch | null;

  // Whether a suggestion refresh is in-flight
  isRefreshing: boolean;

  // Error detail from last failed refresh (shown as indicator, not full error)
  lastRefreshError: string | null;
}

interface SuggestionActions {
  appendBatch: (batch: StoredBatch) => void;
  setCurrentBatch: (batch: StoredBatch) => void;
  markRefreshFailed: (reason: string) => void;
  setIsRefreshing: (value: boolean) => void;
  clearSession: () => void;
}

const initialState: SuggestionState = {
  allBatches: [],
  currentBatch: null,
  isRefreshing: false,
  lastRefreshError: null,
};

export const useSuggestionStore = create<SuggestionState & SuggestionActions>((set) => ({
  ...initialState,

  appendBatch(batch) {
    set((state) => ({
      allBatches: [...state.allBatches, batch],
      currentBatch: batch,
      lastRefreshError: null,
    }));
  },

  setCurrentBatch(batch) {
    set({ currentBatch: batch });
  },

  markRefreshFailed(reason) {
    // Keep current batch visible with stale indicator — do NOT clear it
    set((state) => ({
      currentBatch: state.currentBatch
        ? { ...state.currentBatch, refreshFailed: true }
        : null,
      lastRefreshError: reason,
      isRefreshing: false,
    }));
  },

  setIsRefreshing(value) {
    set({ isRefreshing: value });
  },

  clearSession() {
    set(initialState);
  },
}));