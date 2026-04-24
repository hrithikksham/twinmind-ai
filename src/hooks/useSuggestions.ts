/**
 * useSuggestions.ts
 *
 * Orchestration hook. Owns:
 *   - 30s auto-refresh cycle (synchronized with Whisper chunk cadence)
 *   - Rolling summary computation (lazy, every 10 minutes)
 *   - Gate 3 graceful degradation (stale batch on failure)
 *   - Card click routing (fires detail_prompt into chat)
 *
 * Services are pure functions — this hook is the only place with side effects.
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

// Refresh cadence matches Whisper 30s chunk dispatch — by design, not coincidence.
// Decoupling these creates race conditions where suggestions render before the
// transcript they reference has been shown to the user.
const REFRESH_INTERVAL_MS = 30_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseSuggestionsOptions {
  /** Segments from transcriptStore — passed as getter to avoid stale closure */
  getSegments: () => TranscriptSegment[];

  /** Groq API key from settingsStore */
  groqApiKey: string;

  /** Anchor window token budget; user-configurable in settings (default: 600) */
  contextWindowTokens?: number;

  /** Called on card click — routes detail_prompt into the chat engine */
  onSuggestionClick: (suggestion: Suggestion) => void;

  /** Suggestions only auto-refresh while mic recording is active */
  isRecording: boolean;
}

export interface UseSuggestionsReturn {
  currentBatch: ReturnType<typeof useSuggestionStore.getState>['currentBatch'];
  isRefreshing: boolean;
  lastRefreshError: string | null;
  /** Trigger a refresh outside the 30s cycle (e.g., manual refresh button) */
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

  // Rolling summary state — lives in hook, not store.
  // Not needed for export (anchor_window_snapshot handles QA); just for prompt context.
  const [rollingSummary, setRollingSummary] = useState('');
  const lastSummaryAtRef = useRef<number | null>(null);

  // Guard against overlapping refresh calls
  const isRefreshingRef = useRef(false);

  // ── Core refresh ───────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    if (!groqApiKey) return;

    const segments = getSegments();
    if (segments.length === 0) return;

    isRefreshingRef.current = true;
    store.setIsRefreshing(true);

    try {
      // Step 1: Lazily recompute rolling summary if 10 minutes have elapsed.
      // This runs async but does not block the suggestion call — it updates
      // the summary for the NEXT refresh cycle if it takes time.
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

      // Step 2: Assemble two-window context (anchor verbatim + summary compressed)
      const context = buildContext(segments, currentSummary, contextWindowTokens);

      // Step 3: Call suggestion service (Gates 1 + 2 + retry handled inside)
      const result = await fetchSuggestions({
        anchorWindow: context.anchorWindow,
        summaryWindow: context.summaryWindow,
        timestamp: new Date().toISOString(),
        contextWindowTokens,
        groqApiKey,
      });

      // Step 4: Gate 3 — graceful degradation
      if (result.ok) {
        store.appendBatch({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          batch: result.batch,
          anchorWindowSnapshot: context.anchorWindowSnapshot,
          refreshFailed: false,
        });
      } else {
        // Previous batch stays visible with stale indicator.
        // A blank panel is worse than a stale one — never empty the panel.
        store.markRefreshFailed(result.detail);
      }
    } catch (err) {
      store.markRefreshFailed(err instanceof Error ? err.message : 'Unknown error during refresh');
    } finally {
      isRefreshingRef.current = false;
      store.setIsRefreshing(false);
    }
  }, [groqApiKey, contextWindowTokens, getSegments, rollingSummary, store]);

  // ── 30s auto-refresh cycle ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isRecording, refresh]);

  // ── Card click ─────────────────────────────────────────────────────────────

  const handleSuggestionClick = useCallback(
    (suggestion: Suggestion) => {
      // detail_prompt was pre-generated inside the suggestion prompt at zero marginal cost.
      // Routing it directly to chat eliminates ~1s of re-reasoning on every click.
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

// ─── Rolling summary helper ───────────────────────────────────────────────────
// Runs off the critical path. Failure is non-fatal — suggestions still work,
// just without compressed earlier context.

async function maybeRecomputeSummary(
  segments: TranscriptSegment[],
  existingSummary: string,
  lastSummaryAt: number | null,
  groqApiKey: string,
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
        groqApiKey,
        maxTokens: 150,
      }),
    });

    if (!response.ok) return existingSummary;

    const data: unknown = await response.json();
    if (
      data !== null &&
      typeof data === 'object' &&
      'content' in data &&
      typeof (data as Record<string, unknown>).content === 'string'
    ) {
      const updated = ((data as Record<string, unknown>).content as string).trim();
      if (updated.length > 0) {
        onUpdated(updated, Date.now());
        return updated;
      }
    }
  } catch {
    // Summary failure is intentionally swallowed — not worth surfacing to user
  }

  return existingSummary;
}