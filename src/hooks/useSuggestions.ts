'use client';

/**
 * useSuggestions.ts
 *
 * Orchestration hook for the suggestion refresh cycle.
 *
 * Key invariants maintained:
 *  1. First run always fires once recording starts + segments exist.
 *  2. Interval is strictly gated on isRecording — no wasted calls when idle.
 *  3. No stale closures:
 *     - refreshRef.current always points to the latest `refresh` instance.
 *     - rollingSummary is stored in a ref, not useState, so it never enters
 *       the useCallback dep array and never triggers a stale snapshot.
 *  4. Stable Zustand actions (appendBatch, markRefreshFailed, setIsRefreshing)
 *     are destructured from the store — these are stable function references
 *     and safe to include in dep arrays without causing re-creation churn.
 *  5. Retry / error handling never leaves the system in a permanently blocked
 *     state: isRefreshingRef is always reset in the finally block.
 */

import { useCallback, useEffect, useRef } from 'react';
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

const REFRESH_INTERVAL_MS = 10_000; // polling cadence while recording
const MIN_REFRESH_GAP_MS  = 5_000;  // debounce guard for rapid/manual calls

// ─── Public API ───────────────────────────────────────────────────────────────

export interface UseSuggestionsOptions {
  getSegments: () => TranscriptSegment[];
  // Optional — when absent the route uses the server-side GROQ_API_KEY env var.
  // Do NOT gate the refresh cycle on this being present; transcription works
  // without a client key and suggestions should behave the same way.
  groqApiKey?: string;
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
  groqApiKey = '',
  contextWindowTokens = 600,
  onSuggestionClick,
  isRecording,
}: UseSuggestionsOptions): UseSuggestionsReturn {
  // Destructure only the stable action references from the store.
  // Zustand guarantees these function identities never change across renders,
  // so they are safe in useCallback dep arrays without causing churn.
  const {
    currentBatch,
    isRefreshing,
    lastRefreshError,
    appendBatch,
    markRefreshFailed,
    setIsRefreshing,
  } = useSuggestionStore();

  // ── In-flight / timing refs ────────────────────────────────────────────────
  const isRefreshingRef    = useRef(false);   // synchronous guard (vs async store flag)
  const lastRunRef         = useRef(0);
  const lastSegmentCountRef = useRef(0);
  const hasRunOnceRef      = useRef(false);   // guarantees first run on new session

  // ── Rolling summary — stored as a ref to avoid dep array churn ─────────────
  // If this were useState, `refresh` would depend on `rollingSummary`, causing
  // a new refresh function on every summary update and a stale value read when
  // the closure captures an old copy.
  const rollingSummaryRef = useRef('');
  const lastSummaryAtRef  = useRef<number | null>(null);

  // ── Stable ref to latest refresh — prevents stale closures in setInterval ──
  const refreshRef = useRef<(opts?: { ignoreGap?: boolean }) => Promise<void>>(
    () => Promise.resolve(),
  );

  // ── Core refresh ──────────────────────────────────────────────────────────────

  const refresh = useCallback(
    async (opts?: { ignoreGap?: boolean }) => {
      // Allow empty key — server will fallback to env key
      if (!groqApiKey) {
        console.warn('[suggestions] No client API key — using server fallback');
      }
      if (isRefreshingRef.current) return;
      console.log('[suggestions] refresh fired', {
      isRecording,
      segmentCount: getSegments().length,
      });
      const now = Date.now();
      const gapOk =
        opts?.ignoreGap === true || now - lastRunRef.current >= MIN_REFRESH_GAP_MS;
      if (!gapOk) return;

      const segments = getSegments();
      if (segments.length === 0) {
        markRefreshFailed('No transcript yet');
        return;
      }

      // First-run gate: let the very first call through unconditionally,
      // then require the transcript to have grown before re-running.
      const transcriptChanged = segments.length !== lastSegmentCountRef.current;
      if (!hasRunOnceRef.current) {
        hasRunOnceRef.current = true;
      } else if (!transcriptChanged) {
        return;
      }

      lastSegmentCountRef.current = segments.length;
      lastRunRef.current = now;
      isRefreshingRef.current = true;
      setIsRefreshing(true);

      try {
        // Rolling summary update — uses ref value, writes back to ref.
        // Non-fatal: if the summary call fails we continue with the existing one.
        rollingSummaryRef.current = await maybeRecomputeSummary(
          segments,
          rollingSummaryRef.current,
          lastSummaryAtRef.current,
          groqApiKey,
          (updated, ts) => {
            rollingSummaryRef.current = updated;
            lastSummaryAtRef.current  = ts;
          },
        );

        const context = buildContext(
          segments,
          rollingSummaryRef.current,
          contextWindowTokens,
        );

        const result = await fetchSuggestions({
          anchorWindow:  context.anchorWindow,
          summaryWindow: context.summaryWindow,
          timestamp:     new Date().toISOString(),
          groqApiKey,
        });

        if (result.ok) {
          appendBatch({
            id:                   crypto.randomUUID(),
            timestamp:            new Date().toISOString(),
            batch:                result.batch,
            anchorWindowSnapshot: context.anchorWindowSnapshot,
            refreshFailed:        false,
          });
        } else {
          markRefreshFailed(result.detail);
        }
      } catch (err) {
        markRefreshFailed(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        isRefreshingRef.current = false;
        setIsRefreshing(false);
      }
    },
    // Only primitive/stable deps here — no rollingSummary state variable.
    // groqApiKey and contextWindowTokens change only when the user edits settings.
    // getSegments should be memoized by the caller (useCallback).
    [groqApiKey, contextWindowTokens, getSegments, appendBatch, markRefreshFailed, setIsRefreshing],
  );

  // ── Keep refreshRef in sync (prevents stale closure in setInterval) ──────────

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // ── Polling interval — only active while recording ───────────────────────────

  useEffect(() => {
    if (!isRecording) return;

    const id = setInterval(() => {
      // Always call via ref — captures the latest refresh after any re-creation
      void refreshRef.current();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(id);
  }, [isRecording]);

  // ── Immediate trigger when recording starts ───────────────────────────────────
  // Resets the first-run gate so a new session fires immediately rather than
  // waiting for the first 10-second tick.

  useEffect(() => {
    if (!isRecording) return;

    hasRunOnceRef.current = false;

    // Small delay to let the first transcript chunk arrive
    const id = setTimeout(() => {
      void refreshRef.current({ ignoreGap: true });
    }, 500);

    return () => clearTimeout(id);
  }, [isRecording]);

  // ── Click passthrough ─────────────────────────────────────────────────────────

  const handleSuggestionClick = useCallback(
    (suggestion: Suggestion) => onSuggestionClick(suggestion),
    [onSuggestionClick],
  );

  return {
    currentBatch,
    isRefreshing,
    lastRefreshError,
    manualRefresh: refresh,
    handleSuggestionClick,
  };
}

// ─── Rolling summary helper ───────────────────────────────────────────────────
// Intentionally a module-level async function (not a hook) — it has no React
// dependencies and is easier to test in isolation.

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
          'You are a precise meeting summarizer. ' +
          'Output only the 2–3 sentence summary — no preamble, no labels, no markdown.',
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
    // Summary failure is non-fatal — suggestions still work without compression
  }

  return existingSummary;
}