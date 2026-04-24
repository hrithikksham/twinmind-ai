'use client';

/**
 * useMicRecorder.ts
 *
 * Uses MediaRecorder timeslice (30s) to emit valid audio chunks.
 */

import { useCallback, useRef, useState } from 'react';
import { useTranscriptStore } from '../store/transcriptStore';

const CHUNK_INTERVAL_MS = 30_000;

const PREFERRED_MIME = 'audio/webm;codecs=opus';
const FALLBACK_MIME = 'audio/webm';

export interface UseMicRecorderOptions {
  onChunkTranscribed?: (text: string) => void;
  onError?: (err: Error) => void;
}

export interface UseMicRecorderReturn {
  isRecording: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

export function useMicRecorder({
  onChunkTranscribed,
  onError,
}: UseMicRecorderOptions = {}): UseMicRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const addSegment = useTranscriptStore((s) => s.addSegment);

  // ── Send chunk ─────────────────────────────────

  const dispatchChunk = useCallback(
    async (blob: Blob) => {
      if (!blob || blob.size < 8000) return; // 🔥 critical filter

      try {
        console.log('Sending chunk:', blob.size);

        const formData = new FormData();
        formData.append('file', blob, 'chunk.webm');

        const res = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const msg = await res.text().catch(() => 'unknown error');
          throw new Error(`/api/transcribe ${res.status}: ${msg}`);
        }

        const data = await res.json();
        const text =
          typeof data?.text === 'string' ? data.text.trim() : '';

        if (!text) return;

        addSegment({
          id: crypto.randomUUID(),
          ts: new Date().toISOString(),
          text,
        });

        onChunkTranscribed?.(text);
      } catch (err) {
        onError?.(
          err instanceof Error ? err : new Error(String(err))
        );
      }
    },
    [addSegment, onChunkTranscribed, onError],
  );

  // ── Start recording ─────────────────────────────

  const start = useCallback(async () => {
    if (isRecording) return;

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch (err) {
      onError?.(
        new Error(
          `Microphone access denied: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      );
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported(PREFERRED_MIME)
      ? PREFERRED_MIME
      : FALLBACK_MIME;

    const recorder = new MediaRecorder(stream, { mimeType });

    // ✅ correct: each chunk is already valid
    recorder.ondataavailable = (e) => {
      const blob = e.data;
      void dispatchChunk(blob);
    };

    recorder.start(CHUNK_INTERVAL_MS);

    recorderRef.current = recorder;
    streamRef.current = stream;

    setIsRecording(true);
  }, [isRecording, dispatchChunk, onError]);

  // ── Stop recording ──────────────────────────────

  const stop = useCallback(() => {
    if (!isRecording) return;

    const recorder = recorderRef.current;

    if (recorder && recorder.state !== 'inactive') {
      recorder.requestData(); // flush last chunk
      recorder.stop();
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());

    recorderRef.current = null;
    streamRef.current = null;

    setIsRecording(false);
  }, [isRecording]);

  return { isRecording, start, stop };
}