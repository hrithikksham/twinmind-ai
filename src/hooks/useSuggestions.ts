'use client';

/**
 * useSuggestions.ts — FIXED (stable + efficient)
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

const REFRESH_INTERVAL_MS = 10000; // 10s
const MIN_REFRESH_GAP_MS = 5000;   // prevent spam

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

  const lastRunRef = useRef(0);
  const lastSegmentCountRef = useRef(0);

  // ── Core refresh ────────────────────────────────

  const refresh = useCallback(async () => {
    const now = Date.now();

    // 🚫 prevent spam
    if (isRefreshingRef.current) return;
    if (now - lastRunRef.current < MIN_REFRESH_GAP_MS) return;

    const segments = getSegments();
    if (segments.length === 0) return;

    // 🚫 only run if transcript changed
    if (segments.length === lastSegmentCountRef.current) return;

    lastSegmentCountRef.current = segments.length;
    lastRunRef.current = now;

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
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      isRefreshingRef.current = false;
      store.setIsRefreshing(false);
    }
  }, [getSegments, contextWindowTokens, rollingSummary, store]);

  // ── Controlled interval (NO spam) ───────────────

  useEffect(() => {
    if (!isRecording && getSegments().length === 0) return;

    const interval = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isRecording]); // ✅ FIXED

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
          'You are a precise meeting summarizer. Output only the summary.',
        userPrompt: prompt,
        maxTokens: 150,
      }),
    });

    if (!response.ok) return existingSummary;

    const data = (await response.json()) as { content?: string };

    return typeof data.content === 'string'
      ? data.content
      : existingSummary;

  } catch {
    return existingSummary;
  }
}