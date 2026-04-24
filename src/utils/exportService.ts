/**
 * exportService.ts
 *
 * Serialises the full session (transcript + suggestion batches + chat) to JSON
 * and triggers a browser file download.
 *
 * Export format is the QA harness (CLAUDE.md §10):
 * every batch includes inferred_mode + anchor_window_snapshot so reviewers
 * can replay what context the model saw and what it chose to surface.
 */

import type { TranscriptSegment } from '../store/transcriptStore';
import type { StoredBatch } from '../store/suggestionStore';
import type { ChatMessage } from '../hooks/useChat';
import { formatForFilename, nowISO } from './time';

// ─── Export shape ─────────────────────────────────────────────────────────────

export interface SessionExport {
  exportedAt: string;
  transcript: TranscriptSegment[];
  suggestionBatches: SuggestionBatchExport[];
  chat: ChatExport[];
}

interface SuggestionBatchExport {
  id: string;
  timestamp: string;
  inferred_mode: string;
  user_need: string;
  anchor_window_snapshot: string;
  refreshFailed: boolean;
  suggestions: {
    type: string;
    preview: string;
    detail_prompt: string;
    concrete_anchor: string;
  }[];
}

interface ChatExport {
  id: string;
  role: string;
  content: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds the session export object and triggers a JSON file download.
 */
export function exportSession(
  transcript: TranscriptSegment[],
  batches: StoredBatch[],
  chatMessages: ChatMessage[],
): void {
  const payload: SessionExport = {
    exportedAt: nowISO(),
    transcript,
    suggestionBatches: batches.map(toSuggestionBatchExport),
    chat: chatMessages.map(({ id, role, content }) => ({ id, role, content })),
  };

  const json = JSON.stringify(payload, null, 2);
  const filename = buildFilename(transcript);

  triggerDownload(json, filename);
}

// ─── Filename builder ─────────────────────────────────────────────────────────

/**
 * Produces a safe, unique filename from session start time.
 * e.g. "twinmind-session_2026-04-24_14-32-07.json"
 */
export function buildFilename(transcript: TranscriptSegment[]): string {
  const startIso = transcript.length > 0 ? transcript[0].ts : nowISO();
  const safe = formatForFilename(startIso);
  return `twinmind-session_${safe}.json`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSuggestionBatchExport(stored: StoredBatch): SuggestionBatchExport {
  return {
    id: stored.id,
    timestamp: stored.timestamp,
    inferred_mode: stored.batch.inferred_mode,
    user_need: stored.batch.inferred_mode !== 'INSUFFICIENT_CONTEXT'
      ? stored.batch.user_need
      : stored.batch.user_need,
    anchor_window_snapshot: stored.anchorWindowSnapshot,
    refreshFailed: stored.refreshFailed,
    suggestions: stored.batch.suggestions.map((s) => ({
      type: s.type,
      preview: s.preview,
      detail_prompt: s.detail_prompt,
      concrete_anchor: s.concrete_anchor,
    })),
  };
}

function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');

  a.href     = url;
  a.download = filename;
  a.click();

  // Release object URL after the browser has had time to initiate the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}