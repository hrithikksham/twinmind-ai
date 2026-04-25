'use client';

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

const REFRESH_INTERVAL_MS = 10_000;
const MIN_REFRESH_GAP_MS  = 5_000;

export interface UseSuggestionsOptions {
  getSegments: () => TranscriptSegment[];
  groqApiKey: string;                          // FIX 1: restored
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
  groqApiKey,                                  // FIX 1: restored
  contextWindowTokens = 600,
  onSuggestionClick,
  isRecording,
}: UseSuggestionsOptions): UseSuggestionsReturn {
  const store = useSuggestionStore();

  const [rollingSummary, setRollingSummary] = useState('');
  const lastSummaryAtRef     = useRef<number | null>(null);
  const isRefreshingRef      = useRef(false);
  const lastRunRef           = useRef(0);
  const lastSegmentCountRef  = useRef(0);

  // FIX 2: keep a ref to the latest refresh so the interval never holds a stale closure
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // ── Core refresh ─────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!groqApiKey) return;                   // FIX 1: guard restored

    const now = Date.now();
    if (isRefreshingRef.current) return;
    if (now - lastRunRef.current < MIN_REFRESH_GAP_MS) return;

    const segments = getSegments();
    if (segments.length === 0) return;
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
        groqApiKey,                            // FIX 1: restored
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
        contextWindowTokens,
        groqApiKey,                            // FIX 1: restored
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
  }, [groqApiKey, getSegments, contextWindowTokens, rollingSummary, store]);

  // FIX 2: keep the ref in sync with the latest refresh function
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // ── Interval — calls via ref so it never holds a stale closure ───────────

  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      void refreshRef.current();               // FIX 2: always calls latest refresh
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isRecording]);                           // dep array stays minimal and correct

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
  groqApiKey: string,                          // FIX 1: restored
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
          'You are a precise meeting summarizer. Output only the summary.',
        userPrompt: prompt,
        groqApiKey,                            // FIX 1: restored
        maxTokens: 150,
      }),
    });

    if (!response.ok) return existingSummary;

    const data = (await response.json()) as { content?: string };
    if (typeof data.content === 'string' && data.content.trim().length > 0) {
      const updated = data.content.trim();
      onUpdated(updated, Date.now());
      return updated;
    }
  } catch {
    // summary failure is non-fatal
  }

  return existingSummary;
}
