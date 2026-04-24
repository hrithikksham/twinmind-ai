'use client';

import { useEffect, useRef } from 'react';
import type { TranscriptSegment } from '../store/transcriptStore';

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
}

export function TranscriptPanel({ segments }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new segment
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments.length]);

  return (
    <div style={styles.panel}>
      <div style={styles.header}>Transcript</div>

      <div style={styles.list}>
        {segments.length === 0 ? (
          <p style={styles.empty}>
            Transcript will appear here once recording starts.
          </p>
        ) : (
          segments.map((seg) => (
            <div key={seg.id} style={styles.segment}>
              <span style={styles.ts}>{formatTime(seg.ts)}</span>
              <span style={styles.text}>{seg.text}</span>
            </div>
          ))
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────

function formatTime(iso: string): string {
  const date = new Date(iso);
  return isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
}

// ─── Styles ─────────────────────────────────────────

const styles = {
  panel: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    height: '100%',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    padding: '10px 8px 6px',
    borderBottom: '1px solid #e5e7eb',
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 10,
  },
  empty: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center' as const,
    marginTop: 24,
  },
  segment: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 2,
  },
  ts: {
    fontSize: 10,
    color: '#9ca3af',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  text: {
    fontSize: 13,
    color: '#111827',
    lineHeight: 1.5,
  },
} as const;