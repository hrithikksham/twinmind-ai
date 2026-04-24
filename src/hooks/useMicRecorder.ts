/**
 * useMicRecorder.ts
 *
 * MediaRecorder lifecycle + 30s chunk dispatch.
 * Sends each chunk to /api/transcribe and appends the result to transcriptStore.
 *
 * Chunk cadence (30s) is intentionally synchronized with the suggestion refresh
 * cycle — one new transcript chunk triggers one suggestion refresh. (CLAUDE.md §7)
 */

import { useCallback, useRef, useState } from 'react';
import { useTranscriptStore } from '../store/transcriptStore';

// ─── Config ───────────────────────────────────────────────────────────────────

// Must match Whisper chunk cadence and suggestion refresh interval (CLAUDE.md §7)
const CHUNK_INTERVAL_MS = 30_000;

// Smallest viable audio format for Groq Whisper — opus inside webm
const PREFERRED_MIME = 'audio/webm;codecs=opus';
const FALLBACK_MIME  = 'audio/webm';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseMicRecorderOptions {
  groqApiKey: string;
  /** Called after each chunk is successfully transcribed */
  onChunkTranscribed?: (text: string) => void;
  /** Called on any recording or transcription error */
  onError?: (err: Error) => void;
}

export interface UseMicRecorderReturn {
  isRecording: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMicRecorder({
  groqApiKey,
  onChunkTranscribed,
  onError,
}: UseMicRecorderOptions): UseMicRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);

  const recorderRef  = useRef<MediaRecorder | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const addSegment = useTranscriptStore((s) => s.addSegment);

  // ── Chunk handler ──────────────────────────────────────────────────────────

  const dispatchChunk = useCallback(
    async (blob: Blob) => {
      if (blob.size === 0) return;

      try {
        const formData = new FormData();
        formData.append('audio', blob, 'chunk.webm');
        formData.append('groqApiKey', groqApiKey);

        const res = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const msg = await res.text().catch(() => 'unknown error');
          throw new Error(`/api/transcribe ${res.status}: ${msg}`);
        }

        const data: unknown = await res.json();
        const text =
          data !== null &&
          typeof data === 'object' &&
          'text' in data &&
          typeof (data as Record<string, unknown>).text === 'string'
            ? ((data as Record<string, unknown>).text as string).trim()
            : '';

        if (!text) return; // silence / empty chunk — skip

        const segment = {
          id: crypto.randomUUID(),
          ts: new Date().toISOString(),
          text,
        };

        addSegment(segment);
        onChunkTranscribed?.(text);
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [groqApiKey, addSegment, onChunkTranscribed, onError],
  );

  // ── Start ──────────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (isRecording) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      onError?.(new Error(`Microphone access denied: ${err instanceof Error ? err.message : String(err)}`));
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported(PREFERRED_MIME)
      ? PREFERRED_MIME
      : FALLBACK_MIME;

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Each 30s slice: collect accumulated chunks, dispatch, reset
    const flush = () => {
      if (chunks.length === 0) return;
      const blob = new Blob(chunks.splice(0), { type: mimeType });
      void dispatchChunk(blob);
    };

    recorder.start();

    // timeslice is NOT used — we collect chunks manually so the flush boundary
    // is always exactly 30s, not split across MediaRecorder's internal buffering
    intervalRef.current = setInterval(flush, CHUNK_INTERVAL_MS);

    recorderRef.current = recorder;
    streamRef.current   = stream;
    setIsRecording(true);
  }, [isRecording, dispatchChunk, onError]);

  // ── Stop ───────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    if (!isRecording) return;

    // Clear interval before stopping recorder to prevent a flush race
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      // Collect any remaining audio before stopping
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) void dispatchChunk(e.data);
      };
      recorder.requestData(); // flush buffered audio
      recorder.stop();
    }

    // Release mic
    streamRef.current?.getTracks().forEach((t) => t.stop());

    recorderRef.current = null;
    streamRef.current   = null;
    setIsRecording(false);
  }, [isRecording, dispatchChunk]);

  return { isRecording, start, stop };
}