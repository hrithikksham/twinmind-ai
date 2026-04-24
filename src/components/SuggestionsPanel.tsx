/**
 * SuggestionsPanel.tsx
 *
 * Middle column. Renders all suggestion batches for the session, latest on top.
 * No business logic — display only.
 *
 * Clicking a card calls onSuggestionClick(suggestion), which routes detail_prompt
 * into the chat engine (wired in the parent / useSuggestions hook).
 */

import React from 'react';
import type { StoredBatch } from '../store/suggestionStore';
import type { Suggestion, SuggestionType } from '../utils/validators';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SuggestionsPanelProps {
  batches: StoredBatch[];
  isRefreshing: boolean;
  onSuggestionClick: (suggestion: Suggestion) => void;
}

// ─── Type badge config ────────────────────────────────────────────────────────
// Each type gets a short label and a neutral background so badges are scannable
// without being distracting mid-conversation.

const TYPE_LABELS: Record<SuggestionType, string> = {
  ANSWER:     'Answer',
  CLARIFY:    'Clarify',
  FACT_CHECK: 'Fact-check',
  INSIGHT:    'Insight',
  QUESTION:   'Question',
  DEFINITION: 'Definition',
  PIVOT:      'Pivot',
};

const TYPE_COLORS: Record<SuggestionType, string> = {
  ANSWER:     '#1a73e8',
  CLARIFY:    '#6f42c1',
  FACT_CHECK: '#c0392b',
  INSIGHT:    '#117a65',
  QUESTION:   '#b45309',
  DEFINITION: '#0d6efd',
  PIVOT:      '#555',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SuggestionsPanel({
  batches,
  isRefreshing,
  onSuggestionClick,
}: SuggestionsPanelProps) {
  // Latest batch first
  const ordered = [...batches].reverse();

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Suggestions</span>
        {isRefreshing && <span style={styles.refreshingDot} title="Refreshing…" />}
      </div>

      {ordered.length === 0 && (
        <p style={styles.empty}>Waiting for transcript…</p>
      )}

      {ordered.map((stored, batchIndex) => (
        <BatchBlock
          key={stored.id}
          stored={stored}
          isLatest={batchIndex === 0}
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

function BatchBlock({ stored, isLatest, onSuggestionClick }: BatchBlockProps) {
  const { batch, timestamp, refreshFailed } = stored;

  // Sparse context — nothing to show
  if (batch.suggestions.length === 0) return null;

  return (
    <div style={{
      ...styles.batch,
      opacity: isLatest ? 1 : 0.45,          // age previous batches visually
    }}>
      <div style={styles.batchMeta}>
        <span style={styles.mode}>{batch.inferred_mode.replace('_', ' ')}</span>
        <span style={styles.timestamp}>{formatTime(timestamp)}</span>
        {refreshFailed && (
          <span style={styles.staleLabel} title="Last refresh failed — showing previous batch">
            stale
          </span>
        )}
      </div>

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

// ─── SuggestionCard ───────────────────────────────────────────────────────────

interface SuggestionCardProps {
  suggestion: Suggestion;
  onClick: () => void;
}

function SuggestionCard({ suggestion, onClick }: SuggestionCardProps) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.card,
        background: hovered ? '#f0f4ff' : '#fff',
      }}
    >
      <span
        style={{
          ...styles.badge,
          background: TYPE_COLORS[suggestion.type],
        }}
      >
        {TYPE_LABELS[suggestion.type]}
      </span>
      <span style={styles.preview}>{suggestion.preview}</span>
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  panel: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 12,
    padding: '12px 8px',
    overflowY: 'auto' as const,
    height: '100%',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingBottom: 4,
    borderBottom: '1px solid #e5e7eb',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  refreshingDot: {
    display: 'inline-block' as const,
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#3b82f6',
    animation: 'pulse 1s infinite',
  },
  empty: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center' as const,
    marginTop: 24,
  },
  batch: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 6,
    transition: 'opacity 0.2s',
  },
  batchMeta: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingBottom: 2,
  },
  mode: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  timestamp: {
    fontSize: 11,
    color: '#9ca3af',
    marginLeft: 'auto' as const,
  },
  staleLabel: {
    fontSize: 10,
    color: '#b45309',
    background: '#fef3c7',
    borderRadius: 3,
    padding: '1px 5px',
    fontWeight: 600,
  },
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
    transition: 'background 0.1s',
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
    marginTop: 1,
  },
  preview: {
    fontSize: 13,
    color: '#111827',
    lineHeight: 1.45,
  },
} as const;


