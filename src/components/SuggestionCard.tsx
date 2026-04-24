/**
 * SuggestionCard.tsx
 *
 * Single suggestion card. Compact, glanceable.
 * Clicking routes detail_prompt into chat via onSuggestionClick.
 */

import React, { useState } from 'react';
import type { Suggestion, SuggestionType } from '../utils/validators';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SuggestionCardProps {
  suggestion: Suggestion;
  onSuggestionClick: (suggestion: Suggestion) => void;
  /** Dims the card when the batch it belongs to has refreshFailed */
  dimmed?: boolean;
}

// ─── Badge config ─────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<SuggestionType, string> = {
  ANSWER:     'Answer',
  CLARIFY:    'Clarify',
  FACT_CHECK: 'Fact-check',
  INSIGHT:    'Insight',
  QUESTION:   'Question',
  DEFINITION: 'Definition',
  PIVOT:      'Pivot',
};

const TYPE_COLOR: Record<SuggestionType, string> = {
  ANSWER:     '#1a73e8',
  CLARIFY:    '#6f42c1',
  FACT_CHECK: '#c0392b',
  INSIGHT:    '#117a65',
  QUESTION:   '#b45309',
  DEFINITION: '#0d6efd',
  PIVOT:      '#555',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SuggestionCard({
  suggestion,
  onSuggestionClick,
  dimmed = false,
}: SuggestionCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => onSuggestionClick(suggestion)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.card,
        background: hovered ? '#f0f4ff' : '#fff',
        opacity: dimmed ? 0.45 : 1,
      }}
      title={suggestion.concrete_anchor}
    >
      <span
        style={{
          ...styles.badge,
          background: TYPE_COLOR[suggestion.type],
        }}
      >
        {TYPE_LABEL[suggestion.type]}
      </span>
      <span style={styles.preview}>{suggestion.preview}</span>
    </button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  card: {
    display: 'flex' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
    padding: '8px 10px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    cursor: 'pointer',
    textAlign: 'left' as const,
    width: '100%',
    background: '#fff',
    transition: 'background 0.1s, opacity 0.2s',
    fontFamily: 'system-ui, sans-serif',
  },
  badge: {
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    borderRadius: 3,
    padding: '2px 6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    marginTop: 2,
  },
  preview: {
    fontSize: 13,
    color: '#111827',
    lineHeight: 1.45,
  },
} as const;