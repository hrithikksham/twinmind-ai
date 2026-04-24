/**
 * SuggestionsPanel.tsx
  * Left column. Shows batches of suggestions, grouped by recency.
 * Each batch corresponds to a "refresh" of suggestions, triggered by new transcript segments.
 * Within each batch, suggestions are ordered by relevance score.
 *
 * Each suggestion card shows:
 * - Type (e.g. Question, Insight)
 * - Preview (a single spoken sentence, ideally referencing a specific part of the transcript)
 *
 * Clicking a suggestion sends its full detail prompt to the assistant, which may trigger a follow-up message or action.
 *
 * The prompts for generating suggestions are crafted to elicit specific, actionable insights that can move the conversation forward.
 * They avoid generic advice and instead focus on concrete elements from the recent transcript.
 *
 * The component also handles an "empty state" when no suggestions are available, and indicates when suggestions are being refreshed.
 */

import React from 'react';
import type { StoredBatch } from '../store/suggestionStore';
import type { Suggestion, SuggestionType } from '../utils/validators';

// ─── Props ─────────────────────────────────────────────────────────────

interface SuggestionsPanelProps {
  batches: StoredBatch[];
  isRefreshing: boolean;
  onSuggestionClick: (suggestion: Suggestion) => void;
}

// ─── Type Labels ───────────────────────────────────────────────────────

const TYPE_LABELS: Record<SuggestionType, string> = {
  ANSWER: 'Answer',
  CLARIFY: 'Clarify',
  FACT_CHECK: 'Fact-check',
  INSIGHT: 'Insight',
  QUESTION: 'Question',
  DEFINITION: 'Definition',
  PIVOT: 'Pivot',
};

// ─── Component ─────────────────────────────────────────────────────────

export function SuggestionsPanel({
  batches,
  isRefreshing,
  onSuggestionClick,
}: SuggestionsPanelProps) {
  const ordered = [...batches].reverse();

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-3 gap-4">

      {/* Header */}
      <div className="flex items-center justify-between text-[19px] text-blue-800 font-medium tracking-tight">
        <span>Suggestions</span>

        {isRefreshing && (
          <span className="text-sm text-blue-400 animate-pulse">
            Updating…
          </span>
        )}
      </div>

      {/* Empty State */}
      {ordered.length === 0 && (
        <div className="text-sm text-gray-400 text-center mt-10">
          Waiting for conversation…
        </div>
      )}

      {ordered.map((stored, i) => (
        <BatchBlock
          key={stored.id}
          stored={stored}
          isLatest={i === 0}
          onSuggestionClick={onSuggestionClick}
        />
      ))}
    </div>
  );
}

// ─── Batch Block ───────────────────────────────────────────────────────

interface BatchBlockProps {
  stored: StoredBatch;
  isLatest: boolean;
  onSuggestionClick: (suggestion: Suggestion) => void;
}

function BatchBlock({ stored, isLatest, onSuggestionClick }: BatchBlockProps) {
  const { batch, timestamp, refreshFailed } = stored;

  if (batch.suggestions.length === 0) return null;

  return (
    <div
      className={`flex flex-col gap-3 transition ${
        isLatest ? 'opacity-100' : 'opacity-40'
      }`}
    >
      {/* Meta */}
      <div className="flex items-center text-[11px] text-gray-400">
        <span className="uppercase tracking-wide">
          {batch.inferred_mode.replace('_', ' ')}
        </span>

        <span className="ml-auto">
          {formatTime(timestamp)}
        </span>

        {refreshFailed && (
          <span className="ml-2 text-[10px] text-amber-500">
            stale
          </span>
        )}
      </div>

      {/* Suggestions */}
      {batch.suggestions.map((suggestion, i) => (
        <SuggestionCard
          key={i}
          suggestion={suggestion}
          onClick={() => onSuggestionClick(suggestion)}
        />
      ))}
    </div>
  );
}

// ─── Suggestion Card ───────────────────────────────────────────────────

interface SuggestionCardProps {
  suggestion: Suggestion;
  onClick: () => void;
}

function SuggestionCard({ suggestion, onClick }: SuggestionCardProps) {
  return (
    <button
      onClick={onClick}
      className="
        group w-full text-left
        px-4 py-3 rounded-xl
        bg-white/70 backdrop-blur-md
        hover:bg-white
        border border-transparent
        hover:border-gray-200
        transition-all duration-150
        shadow-sm hover:shadow-md
      "
    >
      {/* Type */}
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
        {TYPE_LABELS[suggestion.type]}
      </div>

      {/* Preview */}
      <div className="text-[14px] leading-relaxed text-gray-900 group-hover:text-black">
        {suggestion.preview}
      </div>
    </button>
  );
}

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