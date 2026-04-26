'use client';

/**
 * SuggestionsPanel.tsx
 *
 * Middle column — renders all suggestion batches, latest on top.
 * Pure presentation: no business logic, no API calls, no store access.
 *
 * Architectural notes:
 *  - SuggestionCard is imported from its canonical file. There is NO local
 *    re-implementation here. TYPE_CONFIG lives in SuggestionCard.tsx only.
 *  - BatchBlock is memoised so stale batches don't re-render when a new one
 *    arrives. The key is the stable batch `id`, never the array index.
 *  - The empty state renders when there are zero batches AND we are not
 *    currently refreshing — users never see a permanently blank panel.
 *  - `onSuggestionClick` is passed as a stable prop (memoised by caller);
 *    no inline arrow functions are created here.
 */

import React, { memo, useMemo } from 'react';
import { SuggestionCard } from './SuggestionCard';
import type { StoredBatch } from '../store/suggestionStore';
import type { Suggestion } from '../utils/validators';

// ─── Panel ────────────────────────────────────────────────────────────────────

interface SuggestionsPanelProps {
  batches: StoredBatch[];
  isRefreshing: boolean;
  onSuggestionClick: (suggestion: Suggestion) => void;
}

export function SuggestionsPanel({
  batches,
  isRefreshing,
  onSuggestionClick,
}: SuggestionsPanelProps) {
  // Reverse once per batches-array reference change, not on every render
  const ordered = useMemo(() => [...batches].reverse(), [batches]);

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-3 gap-4">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-gray-500 uppercase tracking-widest">
          Suggestions
        </span>

        {isRefreshing && (
          <span className="flex items-center gap-1.5 text-[11px] text-blue-400">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Updating…
          </span>

        
        )}
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {/* Only shown when there is truly nothing to display AND no refresh in   */}
      {/* progress. This guarantees the panel is never permanently blank.       */}
      {ordered.length === 0 && !isRefreshing && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center mt-10 select-none">
          <div className="text-2xl opacity-30">💬</div>
          <p className="text-[13px] text-gray-400">
            Suggestions appear after the first transcript chunk.
          </p>
        </div>
      )}

      {/* ── Batch list ──────────────────────────────────────────────────────── */}
      {ordered.map((stored, i) => (
        <BatchBlock
          key={stored.id}          // stable id, never array index
          stored={stored}
          isLatest={i === 0}
          onSuggestionClick={onSuggestionClick}
        />
      ))}

    </div>
  );
}

// ─── BatchBlock ───────────────────────────────────────────────────────────────

interface BatchBlockProps {
  stored: StoredBatch;
  isLatest: boolean;
  onSuggestionClick: (suggestion: Suggestion) => void;
}

// memo: prevents re-render when only an unrelated (newer) batch changes
const BatchBlock = memo(function BatchBlock({
  stored,
  isLatest,
  onSuggestionClick,
}: BatchBlockProps) {
  const { batch, timestamp, refreshFailed } = stored;

  // Don't render INSUFFICIENT_CONTEXT batches (suggestions array is empty)
  if (batch.suggestions.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2.5 transition-opacity duration-300"
      style={{ opacity: isLatest ? 1 : 0.4 }}
    >
      {/* ── Batch meta row ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-[11px] text-gray-400">
        <span className="uppercase tracking-wider font-medium">
          {batch.inferred_mode.replace(/_/g, ' ')}
        </span>

        <span className="ml-auto tabular-nums">{formatTime(timestamp)}</span>

        {/* Stale indicator: amber pill, not a full error state */}
        {refreshFailed && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-500 border border-amber-200">
            stale
          </span>
        )}
      </div>

      {/* ── Cards ─────────────────────────────────────────────────────────── */}
      {/* SuggestionCard is the single canonical implementation.              */}
      {/* `dimmed` is forwarded so non-latest cards render at reduced opacity. */}
      {batch.suggestions.map((suggestion, i) => (
        <SuggestionCard
          key={`${suggestion.type}-${i}`}
          suggestion={suggestion}
          onSuggestionClick={onSuggestionClick}
          dimmed={!isLatest}
        />
      ))}
    </div>
  );
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}