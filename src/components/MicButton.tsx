/**
 * MicButton.tsx
 *
 * Single button — starts and stops recording.
 * Recording state is driven entirely by useMicRecorder; no local state here.
 */

import React from 'react';

// ─── Props ────────────────────────────────────────────────────────────────────

interface MicButtonProps {
  isRecording: boolean;
  onStart: () => void;
  onStop: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MicButton({ isRecording, onStart, onStop }: MicButtonProps) {
  return (
    <button
      onClick={isRecording ? onStop : onStart}
      style={{
        ...styles.btn,
        background: isRecording ? '#dc2626' : '#1a73e8',
      }}
      title={isRecording ? 'Stop recording' : 'Start recording'}
      aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      aria-pressed={isRecording}
    >
      {isRecording ? '⏹ Stop' : '🎙 Record'}
    </button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  btn: {
    padding: '8px 18px',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
} as const;