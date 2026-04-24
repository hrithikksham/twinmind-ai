'use client';

/**
 * useSuggestions.ts
 *
 * Orchestration hook.
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

// 🔥 faster refresh for better UX
const REFRESH_INTERVAL_MS = 10_000;

export interface UseSuggestionsOptions {
  getSegments: () => TranscriptSegment[];
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

export function useSuggestions({
  getSegments,
  contextWindowTokens = 600,
  onSuggestionClick,
  isRecording,
}: UseSuggestionsOptions): UseSuggestionsReturn {
  const store = useSuggestionStore();

  const [rollingSummary, setRollingSummary] = useState('');
  const lastSummaryAtRef = useRef<number | null>(null);
  const isRefreshingRef = useRef(false);

  // ── Core refresh ────────────────────────────────

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) return;

    const segments = getSegments();

    // ✅ allow refresh even after recording stops
    if (segments.length === 0) return;

    isRefreshingRef.current = true;
    store.setIsRefreshing(true);

    try {
      const currentSummary = await maybeRecomputeSummary(
        segments,
        rollingSummary,
        lastSummaryAtRef.current,
        (updated, ts) => {
          setRollingSummary(updated);
          lastSummaryAtRef.current = ts;
        },
      );

      const context = buildContext(
        segments,
        currentSummary,
        contextWindowTokens,
      );

      const result = await fetchSuggestions({
        anchorWindow: context.anchorWindow,
        summaryWindow: context.summaryWindow,
        timestamp: new Date().toISOString(),
        contextWindowTokens,
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
        err instanceof Error ? err.message : 'Unknown error during refresh',
      );
    } finally {
      isRefreshingRef.current = false;
      store.setIsRefreshing(false);
    }
  }, [getSegments, contextWindowTokens, rollingSummary, store]);

  // ── Auto refresh loop ───────────────────────────

  useEffect(() => {
    // ✅ allow running even if recording stopped (as long as transcript exists)
    if (!isRecording && getSegments().length === 0) return;

    const interval = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isRecording, refresh, getSegments]);

  // ── 🔥 Immediate trigger after transcript update ──

  useEffect(() => {
    const segments = getSegments();

    if (segments.length > 0 && !isRefreshingRef.current) {
      void refresh(); // 🔥 critical fix
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollingSummary]); // avoids infinite loop

  // ── Click handler ───────────────────────────────

  const handleSuggestionClick = useCallback(
    (suggestion: Suggestion) => {
      onSuggestionClick(suggestion);
    },
    [onSuggestionClick],
  );

  return {
    currentBatch: store.currentBatch,
    isRefreshing: store.isRefreshing,
    lastRefreshError: store.lastRefreshError,
    manualRefresh: refresh,
    handleSuggestionClick,
  };
}

// ─── Summary helper ───────────────────────────────

async function maybeRecomputeSummary(
  segments: TranscriptSegment[],
  existingSummary: string,
  lastSummaryAt: number | null,
  onUpdated: (summary: string, timestamp: number) => void,
): Promise<string> {
  if (!shouldRecomputeSummary(segments, lastSummaryAt)) {
    return existingSummary;
  }

  try {
    const prompt = buildSummaryPrompt(segments, existingSummary);

    const response = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt:
          'You are a precise meeting summarizer. Output only the 2–3 sentence summary — no preamble, no labels, no markdown.',
        userPrompt: prompt,
        maxTokens: 150,
      }),
    });

    if (!response.ok) return existingSummary;

    const data = (await response.json()) as { content?: string };

    // ✅ safe return
    return typeof data.content === 'string'
      ? data.content
      : existingSummary;

  } catch {
    // silent fail
  }

  return existingSummary;
}