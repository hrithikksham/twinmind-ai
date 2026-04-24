/**
 * transcriptStore.ts
 *
 * Append-only store for transcript segments.
 * No mutation of past entries — ever.
 * No business logic — state only.
 */

import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TranscriptSegment {
  id: string;    // stable unique identifier (e.g. crypto.randomUUID())
  ts: string;    // ISO 8601 timestamp of when this segment was transcribed
  text: string;  // raw transcript text from Whisper
}

interface TranscriptState {
  segments: TranscriptSegment[];
}

interface TranscriptActions {
  /** Append a new segment. Past segments are never mutated. */
  addSegment: (segment: TranscriptSegment) => void;
  /** Reset for a new session. */
  clearTranscript: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTranscriptStore = create<TranscriptState & TranscriptActions>((set) => ({
  segments: [],

  addSegment(segment) {
    set((state) => ({
      segments: [...state.segments, segment],
    }));
  },

  clearTranscript() {
    set({ segments: [] });
  },
}));