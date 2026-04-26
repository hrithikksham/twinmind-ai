'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranscriptStore } from '../store/transcriptStore';

const RECORD_WINDOW_MS = 10_000; 

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

  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─────────────────────────────────────────────
  // Transcribe one complete blob
  // ─────────────────────────────────────────────
  const dispatchChunk = useCallback(async (blob: Blob) => {
    if (!blob || blob.size === 0) return;

    try {
      console.log('[RECORDER] sending full blob:', blob.size);

      const formData = new FormData();
      formData.append('file', blob, 'chunk.webm');

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => 'unknown');
        throw new Error(`/api/transcribe ${res.status}: ${msg}`);
      }

      const data = await res.json();
      const text = typeof data?.text === 'string' ? data.text.trim() : '';

      if (!text) return;

      useTranscriptStore.getState().addSegment({
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        text,
      });

      console.log('[TRANSCRIPT] added:', text);

      onChunkTranscribed?.(text);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [onChunkTranscribed, onError]);

  // ─────────────────────────────────────────────
  // Record one window → produce valid file
  // ─────────────────────────────────────────────
  const recordOnce = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = MediaRecorder.isTypeSupported(PREFERRED_MIME)
      ? PREFERRED_MIME
      : FALLBACK_MIME;

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      if (chunks.length === 0) return;

      const fullBlob = new Blob(chunks, { type: 'audio/webm' });
      void dispatchChunk(fullBlob);
    };

    recorder.start();

    setTimeout(() => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }

      // loop again if still recording
      if (isRecording) {
        loopRef.current = setTimeout(recordOnce, 0);
      }
    }, RECORD_WINDOW_MS);
  }, [dispatchChunk, isRecording]);

  // ─────────────────────────────────────────────
  // Start
  // ─────────────────────────────────────────────
  const start = useCallback(async () => {
    if (isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      streamRef.current = stream;
      setIsRecording(true);

      recordOnce(); // start loop
    } catch (err) {
      onError?.(
        new Error(
          `Microphone access denied: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      );
    }
  }, [isRecording, recordOnce, onError]);

  // ─────────────────────────────────────────────
  // Stop
  // ─────────────────────────────────────────────
  const stop = useCallback(() => {
    if (!isRecording) return;

    setIsRecording(false);

    if (loopRef.current) {
      clearTimeout(loopRef.current);
      loopRef.current = null;
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [isRecording]);

  return { isRecording, start, stop };
}