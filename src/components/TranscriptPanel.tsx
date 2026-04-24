/**
 * TranscriptPanel.tsx 
 * Left column. Shows the real-time transcript of what the user is saying, with timestamps.
 * The transcript is updated live as the user speaks, and the panel automatically scrolls to show the latest segments.
 * Each segment shows the spoken text and its timestamp, formatted in a human-friendly way.
 * The design is clean and minimal, with a focus on readability and easy scanning of recent speech.
 */

'use client';

import { useEffect, useRef } from 'react';
import type { TranscriptSegment } from '../store/transcriptStore';
import { MicButton } from './MicButton';

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  isRecording: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function TranscriptPanel({
  segments,
  isRecording,
  onStart,
  onStop,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments.length]);

  return (
    <div className="flex flex-col h-full">

      {/* ─── Header with Mic ───────────────────── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">

        <span className="text-[19px] text-blue-800 font-medium tracking-tight">
          Transcript
        </span>

        <MicButton
          isRecording={isRecording}
          onStart={onStart}
          onStop={onStop}
        />
      </div>

      {/* ─── Transcript List ───────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-4">

        {segments.length === 0 ? (
          <div className="text-sm text-gray-400 text-center mt-10">
            Start speaking to see transcript…
          </div>
        ) : (
          segments.map((seg) => (
            <div key={seg.id} className="flex flex-col gap-1">

              <div className="text-[11px] text-gray-400 tabular-nums">
                {formatTime(seg.ts)}
              </div>

              <div className="text-[14px] text-gray-900 leading-relaxed">
                {seg.text}
              </div>

            </div>
          ))
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────

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