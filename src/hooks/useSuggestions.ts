'use client';

/**
 * useSuggestions.ts
 *
 * Orchestration hook for the suggestion refresh cycle.
 *
 * FIXES applied:
 * 1. First-run guard was blocking: `segments.length === lastSegmentCountRef.current`
 *    fails to fire on session start because both sides are 0. Fixed with a separate
 *    `hasRunOnce` ref that allows the very first call through unconditionally.
 * 2. Interval ran even when !isRecording if segments existed — wasted API calls.
 *    Fixed: interval strictly gated on isRecording.
 * 3. Stale closure: interval captured the initial `refresh` and never updated.
 *    Fixed: interval calls via `refreshRef.current` which is kept in sync.
 * 4. groqApiKey now flows through to fetchSuggestions (fixes the unauthenticated call path).
 * 5. MIN_REFRESH_GAP guard was blocking the immediate trigger after recording starts.
 *    Fixed: initial trigger bypasses the gap guard via a dedicated `triggerNow` path.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSuggestions } from '../services/suggestionService';
import {
  buildContext,
  shouldRecomputeSummary,
  buildSummaryPrompt,
} from '../services/contextBuilder';
import type { TranscriptSegment } from '../services/contextBuilder';
import { useSuggestionStore } from '../store/suggestionStore';
import type { Suggestion } from '../utils/validators';

// ─── Config ───────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 10_000;  // 10s polling cadence
const MIN_REFRESH_GAP_MS  = 5_000;   // debounce guard for manual/rapid calls

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseSuggestionsOptions {
  getSegments: () => TranscriptSegment[];
  groqApiKey: string;
  contextWindowTokens?: number;
  onSuggestionClick: (suggestion: Suggestion) => void;
  isRecording: boolean;
}

export interface UseSuggestionsReturn {
  currentBatch: ReturnType<typeof useSuggestionStore.getState>['currentBatch'];
  isRefreshing: boolean;
  lastRefreshError: string | null;
  manualRefresh: () => Promise<void>;
  handleSuggestionClick: (suggestion: Suggestion) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSuggestions({
  getSegments,
  groqApiKey,
  contextWindowTokens = 600,
  onSuggestionClick,
  isRecording,
}: UseSuggestionsOptions): UseSuggestionsReturn {
  const store = useSuggestionStore();

  const [rollingSummary, setRollingSummary]   = useState('');
  const lastSummaryAtRef                       = useRef<number | null>(null);
  const isRefreshingRef                        = useRef(false);
  const lastRunRef                             = useRef(0);
  const lastSegmentCountRef                    = useRef(0);
  const hasRunOnceRef                          = useRef(false); // FIX 1: allows first run through
  const refreshRef                             = useRef<(opts?: { ignoreGap?: boolean }) => Promise<void>>(() => Promise.resolve());

  // ── Core refresh ─────────────────────────────────────────────────────────

  const refresh = useCallback(
    async (opts?: { ignoreGap?: boolean }) => {
      if (!groqApiKey) return;
      if (isRefreshingRef.current) return;

      const now = Date.now();

      // FIX 5: allow bypassing MIN_REFRESH_GAP for the immediate trigger on recording start
      const gapOk = opts?.ignoreGap || now - lastRunRef.current >= MIN_REFRESH_GAP_MS;
      if (!gapOk) return;

      const segments = getSegments();
      if (segments.length === 0) return;

      // FIX 1: first run always proceeds; subsequent runs only if transcript changed
      const transcriptChanged = segments.length !== lastSegmentCountRef.current;
      if (!hasRunOnceRef.current) {
        hasRunOnceRef.current = true;           // allow through; mark as run
      } else if (!transcriptChanged) {
        return;                                  // no new content — skip
      }

      lastSegmentCountRef.current = segments.length;
      lastRunRef.current = now;

      isRefreshingRef.current = true;
      store.setIsRefreshing(true);

      try {
        // Rolling summary — lazily recomputed off the critical path
        const currentSummary = await maybeRecomputeSummary(
          segments,
          rollingSummary,
          lastSummaryAtRef.current,
          groqApiKey,
          (updated, ts) => {
            setRollingSummary(updated);
            lastSummaryAtRef.current = ts;
          },
        );

        const context = buildContext(segments, currentSummary, contextWindowTokens);

        const result = await fetchSuggestions({
          anchorWindow: context.anchorWindow,
          summaryWindow: context.summaryWindow,
          timestamp: new Date().toISOString(),
          groqApiKey,                          // FIX 4: forwarded to service → API → route
        });

        if (result.ok) {
          store.appendBatch({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            batch: result.batch,
            anchorWindowSnapshot: context.anchorWindowSnapshot,
            refreshFailed: false,
          });
        } else {
          store.markRefreshFailed(result.detail);
        }
      } catch (err) {
        store.markRefreshFailed(
          err instanceof Error ? err.message : 'Unknown error',
        );
      } finally {
        isRefreshingRef.current = false;
        store.setIsRefreshing(false);
      }
    },
    [groqApiKey, getSegments, contextWindowTokens, rollingSummary, store],
  );

  // ── Keep refreshRef current (avoids stale closures in interval) ───────────

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // ── Interval: strictly gated on isRecording (FIX 2) ──────────────────────

  useEffect(() => {
    if (!isRecording) return;                  // FIX 2: no interval when not recording

    const interval = setInterval(() => {
      void refreshRef.current();               // FIX 3: always calls latest refresh via ref
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isRecording]);

  // ── Immediate trigger when recording starts (FIX 5) ──────────────────────

  useEffect(() => {
    if (!isRecording) return;

    // Reset the first-run gate so a new session always triggers immediately
    hasRunOnceRef.current = false;

    // Small delay lets the first transcript chunk arrive before we check
    const timeout = setTimeout(() => {
      void refreshRef.current({ignoreGap: true}); // Bypass gap guard for the immediate trigger on recording start});
    }, 500);

    return () => clearTimeout(timeout);
  }, [isRecording]);

  // ── Click handler ─────────────────────────────────────────────────────────

  const handleSuggestionClick = useCallback(
    (suggestion: Suggestion) => onSuggestionClick(suggestion),
    [onSuggestionClick],
  );

  return {
    currentBatch:     store.currentBatch,
    isRefreshing:     store.isRefreshing,
    lastRefreshError: store.lastRefreshError,
    manualRefresh:    refresh,
    handleSuggestionClick,
  };
}

// ─── Rolling summary helper ───────────────────────────────────────────────────

async function maybeRecomputeSummary(
  segments: TranscriptSegment[],
  existingSummary: string,
  lastSummaryAt: number | null,
  groqApiKey: string,
  onUpdated: (summary: string, timestamp: number) => void,
): Promise<string> {
  if (!shouldRecomputeSummary(segments, lastSummaryAt)) return existingSummary;

  try {
    const prompt = buildSummaryPrompt(segments, existingSummary);

    const response = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt:
          'You are a precise meeting summarizer. Output only the 2–3 sentence summary — no preamble, no labels, no markdown.',
        userPrompt: prompt,
        groqApiKey,
        maxTokens: 150,
      }),
    });

    if (!response.ok) return existingSummary;

    const data = (await response.json()) as { content?: string };
    if (typeof data.content === 'string' && data.content.trim()) {
      const updated = data.content.trim();
      onUpdated(updated, Date.now());
      return updated;
    }
  } catch {
    // Summary failure is non-fatal — suggestions still work without compressed context
  }

  return existingSummary;
}