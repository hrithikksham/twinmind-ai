'use client';

/**
 * SuggestionCard.tsx
 *
 * The ONE canonical card component. SuggestionsPanel imports from here.
 * The previous duplicate inside SuggestionsPanel has been removed.
 *
 * Design decisions:
 *  - Hover effects use CSS custom properties + Tailwind variants, not
 *    onMouseEnter/onMouseLeave handlers. This removes imperative style mutation,
 *    avoids creating new function instances on render, and keeps memoization intact.
 *  - TYPE_CONFIG is exported so callers (e.g. a legend component) can reference
 *    it without re-declaring the mapping.
 *  - `dimmed` controls opacity via inline style so the transition is smooth.
 */

import React, { memo, useCallback } from 'react';
import type { Suggestion, SuggestionType } from '../utils/validators';

// ─── Type config (single source of truth) ────────────────────────────────────

export const TYPE_CONFIG: Record<
  SuggestionType,
  { label: string; color: string; bg: string }
> = {
  ANSWER:     { label: 'Answer',     color: '#2563eb', bg: '#eff6ff' },
  CLARIFY:    { label: 'Clarify',    color: '#7c3aed', bg: '#f5f3ff' },
  FACT_CHECK: { label: 'Fact-check', color: '#dc2626', bg: '#fef2f2' },
  INSIGHT:    { label: 'Insight',    color: '#059669', bg: '#ecfdf5' },
  QUESTION:   { label: 'Question',   color: '#d97706', bg: '#fffbeb' },
  DEFINITION: { label: 'Definition', color: '#0284c7', bg: '#f0f9ff' },
  PIVOT:      { label: 'Pivot',      color: '#475569', bg: '#f8fafc' },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  suggestion: Suggestion;
  onSuggestionClick: (s: Suggestion) => void;
  dimmed?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const SuggestionCard = memo(function SuggestionCard({
  suggestion,
  onSuggestionClick,
  dimmed = false,
}: Props) {
  const cfg = TYPE_CONFIG[suggestion.type];

  // Stable click handler — only re-created when suggestion identity changes
  const handleClick = useCallback(() => {
    onSuggestionClick(suggestion);
  }, [suggestion, onSuggestionClick]);

  // CSS custom property carries the accent colour into Tailwind hover classes.
  // This avoids onMouseEnter/onMouseLeave handlers entirely while still
  // achieving a dynamic per-type hover border colour.
  const cssVars = {
    '--accent': cfg.color,
    opacity: dimmed ? 0.5 : 1,
    borderLeft: `3px solid ${cfg.color}`,
  } as React.CSSProperties;

  return (
    <button
      onClick={handleClick}
      style={cssVars}
      className={[
        'group w-full text-left rounded-xl overflow-hidden',
        'border border-gray-200',
        // Hover: border transitions to accent colour via CSS variable
        'hover:border-(--accent)',
        'bg-white',
        // Shadow transitions on hover — pure CSS, no JS
        'shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
        'hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]',
        'transition-all duration-150',
      ].join(' ')}
      title={suggestion.concrete_anchor}
    >
      <div className="px-3.5 py-3">
        {/* Type badge — coloured background + text from config */}
        <span
          className="inline-block text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 mb-1.5"
          style={{ background: cfg.bg, color: cfg.color }}
        >
          {cfg.label}
        </span>

        {/* Preview — the primary glanceable content */}
        <p className="text-[13.5px] leading-relaxed text-gray-800 group-hover:text-gray-900">
          {suggestion.preview}
        </p>

        {/* Anchor quote — grounds the card in the specific transcript moment */}
        {suggestion.concrete_anchor && (
          <p className="mt-1.5 text-[11px] text-gray-400 truncate">
            re: &ldquo;{suggestion.concrete_anchor}&rdquo;
          </p>
        )}
      </div>
    </button>
  );
});