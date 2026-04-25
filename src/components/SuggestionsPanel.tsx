'use client';

/**
 * SuggestionsPanel.tsx
 *
 * Middle column. Renders suggestion batches, latest on top.
 * Display only — no business logic.
 */

import React, { memo, useCallback, useMemo } from 'react';
import type { StoredBatch } from '../store/suggestionStore';
import type { Suggestion, SuggestionType } from '../utils/validators';

// ─── Props ─────────────────────────────────────────────────────────────

interface SuggestionsPanelProps {
  batches: StoredBatch[];
  isRefreshing: boolean;
  onSuggestionClick: (suggestion: Suggestion) => void;
}

// ─── Type config ────────────────────────────────────────────────────────
// Color = left-border accent + badge tint. Kept subtle so it aids
// scanning without competing with the suggestion text.

const TYPE_CONFIG: Record<SuggestionType, { label: string; color: string; bg: string }> = {
  ANSWER:     { label: 'Answer',     color: '#2563eb', bg: '#eff6ff' },
  CLARIFY:    { label: 'Clarify',    color: '#7c3aed', bg: '#f5f3ff' },
  FACT_CHECK: { label: 'Fact-check', color: '#dc2626', bg: '#fef2f2' },
  INSIGHT:    { label: 'Insight',    color: '#059669', bg: '#ecfdf5' },
  QUESTION:   { label: 'Question',   color: '#d97706', bg: '#fffbeb' },
  DEFINITION: { label: 'Definition', color: '#0284c7', bg: '#f0f9ff' },
  PIVOT:      { label: 'Pivot',      color: '#475569', bg: '#f8fafc' },
};

// ─── Panel ──────────────────────────────────────────────────────────────

export function SuggestionsPanel({
  batches,
  isRefreshing,
  onSuggestionClick,
}: SuggestionsPanelProps) {
  // BUG FIX + PERF: memoize the reversed array — avoids recreating on every render
  const ordered = useMemo(() => [...batches].reverse(), [batches]);

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-3 gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-gray-500 uppercase tracking-widest">
          Suggestions
        </span>

        {/* PERF: Refreshing indicator — only mounts the element when needed */}
        {isRefreshing && (
          <span className="flex items-center gap-1.5 text-[11px] text-blue-400">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Updating…
          </span>
        )}
      </div>

      {/* Empty state */}
      {ordered.length === 0 && !isRefreshing && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center mt-10 select-none">
          <div className="text-2xl opacity-30">💬</div>
          <p className="text-[13px] text-gray-400">
            Suggestions appear after the first transcript chunk.
          </p>
        </div>
      )}

      {ordered.map((stored, i) => (
        <BatchBlock
          key={stored.id}                        // BUG FIX: stable id, not index
          stored={stored}
          isLatest={i === 0}
          onSuggestionClick={onSuggestionClick}
        />
      ))}
    </div>
  );
}

// ─── BatchBlock ─────────────────────────────────────────────────────────

interface BatchBlockProps {
  stored: StoredBatch;
  isLatest: boolean;
  onSuggestionClick: (suggestion: Suggestion) => void;
}

// PERF: memo prevents re-render when only an unrelated batch changes
const BatchBlock = memo(function BatchBlock({
  stored,
  isLatest,
  onSuggestionClick,
}: BatchBlockProps) {
  const { batch, timestamp, refreshFailed } = stored;

  if (batch.suggestions.length === 0) {
    return null; // Don't render empty batches
  }

  return (
    <div
      className="flex flex-col gap-2.5 transition-opacity duration-300"
      style={{ opacity: isLatest ? 1 : 0.4 }}
    >
      {/* Batch meta row */}
      <div className="flex items-center gap-2 text-[11px] text-gray-400">
        <span className="uppercase tracking-wider font-medium">
          {batch.inferred_mode.replace(/_/g, ' ')}   
        </span>

        <span className="ml-auto tabular-nums">{formatTime(timestamp)}</span>

        {/* UX: stale indicator — amber pill, not bare text */}
        {refreshFailed && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-500 border border-amber-200">
            stale
          </span>
        )}
      </div>

      {batch.suggestions.map((suggestion, i) => (
        <SuggestionCard
          key={`${suggestion.type}-${i}`}              // PERF: more stable than pure index
          suggestion={suggestion}
          onSuggestionClick={onSuggestionClick}        // PERF: pass stable ref, not inline arrow
        />
      ))}
    </div>
  );
});

// ─── SuggestionCard ─────────────────────────────────────────────────────

interface SuggestionCardProps {
  suggestion: Suggestion;
  onSuggestionClick: (suggestion: Suggestion) => void;
}

// PERF: memo + useCallback avoids re-render cascade when parent re-renders
const SuggestionCard = memo(function SuggestionCard({
  suggestion,
  onSuggestionClick,
}: SuggestionCardProps) {
  const cfg = TYPE_CONFIG[suggestion.type];

  // PERF: stable click handler per card instance
  const handleClick = useCallback(
    () => onSuggestionClick(suggestion),
    [suggestion, onSuggestionClick],
  );

  return (
    <button
      onClick={handleClick}
      className="group w-full text-left rounded-xl border transition-all duration-150 overflow-hidden"
      style={{
        background: '#fff',
        borderColor: '#e5e7eb',
        // UX: colored left border = instant type recognition without reading the badge
        borderLeft: `3px solid ${cfg.color}`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow =
          '0 4px 12px rgba(0,0,0,0.08)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = cfg.color;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow =
          '0 1px 2px rgba(0,0,0,0.04)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
      }}
    >
      <div className="px-3.5 py-3">
        {/* Type badge */}
        <span
          className="inline-block text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 mb-1.5"
          style={{ background: cfg.bg, color: cfg.color }}
        >
          {cfg.label}
        </span>

        {/* Preview — main readable content */}
        <p className="text-[13.5px] leading-relaxed text-gray-800 group-hover:text-gray-900">
          {suggestion.preview}
        </p>

        {/* UX: anchor quote — grounding context so user knows what triggered the card */}
        {suggestion.concrete_anchor && (
          <p className="mt-1.5 text-[11px] text-gray-400 truncate">
            re: &ldquo;{suggestion.concrete_anchor}&rdquo;
          </p>
        )}
      </div>
    </button>
  );
});

// ─── Helpers ───────────────────────────────────────────────────────────

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