/**
 * contextBuilder.ts
 *
 * Single source of truth for what gets sent to the model.
 * Both suggestionService and chatService call this — no duplication.
 *
 * Strategy: Two-window approach
 *   Anchor window  — last ~600 tokens of raw verbatim transcript (recency signal)
 *   Summary window — LLM-compressed summary of everything before anchor (continuity signal)
 *
 * Why: Sending the full transcript costs tokens + latency and dilutes recency signal.
 *      Truncating at a fixed window drops early context (person's name, agenda, problem).
 *      Compress old context, preserve recent context verbatim.
 */

export interface TranscriptSegment {
  id: string;
  ts: string; // ISO timestamp
  text: string;
}

export interface BuiltContext {
  anchorWindow: string; // Verbatim recent transcript, formatted for prompt injection
  summaryWindow: string; // Rolling summary of pre-anchor transcript (empty if not yet computed)
  anchorWindowSnapshot: string; // Raw anchor text for audit/export logging
  tokenEstimate: number; // Rough estimate of total context tokens
}

// ─── Token budget constants ───────────────────────────────────────────────────

// Default anchor window token budget (user-configurable via settings)
export const DEFAULT_ANCHOR_TOKENS = 600;

// Rough chars-per-token estimate for English prose
const CHARS_PER_TOKEN = 4;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds the two-window context from a full transcript segment array.
 *
 * @param segments     Full append-only transcript array from transcriptStore
 * @param summary      Rolling summary string (empty string if not yet computed)
 * @param maxTokens    Anchor window token budget (default: 600)
 */
export function buildContext(
  segments: TranscriptSegment[],
  summary: string,
  maxTokens: number = DEFAULT_ANCHOR_TOKENS,
): BuiltContext {
  if (segments.length === 0) {
    return {
      anchorWindow: '',
      summaryWindow: summary,
      anchorWindowSnapshot: '',
      tokenEstimate: estimateTokens(summary),
    };
  }

  const maxChars = maxTokens * CHARS_PER_TOKEN;

  // Slice from the end of the transcript until we've consumed the token budget.
  // We walk backwards to preserve recency: most recent segments are included first.
  const anchorSegments: TranscriptSegment[] = [];
  let charCount = 0;

  for (let i = segments.length - 1; i >= 0; i--) {
    const segText = formatSegment(segments[i]);
    charCount += segText.length;
    if (charCount > maxChars) break;
    anchorSegments.unshift(segments[i]);
  }

  const anchorWindow = anchorSegments.map(formatSegment).join('\n');
  const summaryWindow = summary;

  return {
    anchorWindow,
    summaryWindow,
    anchorWindowSnapshot: anchorWindow, // stored verbatim for QA export
    tokenEstimate: estimateTokens(anchorWindow) + estimateTokens(summaryWindow),
  };
}

/**
 * Determines whether a rolling summary should be (re)computed.
 *
 * Rules from CLAUDE.md §3.2:
 *   - First summary: after 10 minutes of transcript content
 *   - Subsequent summaries: every 10 minutes of new content
 *
 * @param segments         Full transcript segment array
 * @param lastSummaryAt    Timestamp (ms) when the last summary was generated, or null
 */
export function shouldRecomputeSummary(
  segments: TranscriptSegment[],
  lastSummaryAt: number | null,
): boolean {
  if (segments.length === 0) return false;

  const firstTs = Date.parse(segments[0].ts);
  const lastTs = Date.parse(segments[segments.length - 1].ts);
  const totalDurationMs = lastTs - firstTs;

  const TEN_MINUTES_MS = 10 * 60 * 1000;

  if (lastSummaryAt === null) {
    // Generate first summary once we have 10 minutes of transcript
    return totalDurationMs >= TEN_MINUTES_MS;
  }

  // Regenerate every 10 minutes of new content since last summary
  return Date.now() - lastSummaryAt >= TEN_MINUTES_MS;
}

/**
 * Builds the prompt text for the rolling summary generation call.
 * This is a cheap API call — one sentence out.
 *
 * @param segments       All segments NOT yet covered by the existing summary
 * @param existingSummary Previous summary (empty if first time)
 */
export function buildSummaryPrompt(
  segments: TranscriptSegment[],
  existingSummary: string,
): string {
  const transcript = segments.map(formatSegment).join('\n');

  if (!existingSummary) {
    return (
      `Summarize the following meeting transcript in 2–3 sentences. ` +
      `Capture: main topic, key participants (if named), key decisions or claims made. ` +
      `Be specific — include proper nouns, numbers, and decisions verbatim.\n\n` +
      `Transcript:\n${transcript}`
    );
  }

  return (
    `You have an existing summary of a meeting so far:\n"${existingSummary}"\n\n` +
    `New transcript content has arrived:\n${transcript}\n\n` +
    `Update the summary to incorporate the new content. Keep it to 2–3 sentences. ` +
    `Preserve specific details (names, numbers, decisions). Do not drop earlier key points unless superseded.`
  );
}

/**
 * Segments that fall outside the anchor window (i.e., pre-anchor content).
 * Used to determine which segments to summarize.
 */
export function getPreAnchorSegments(
  segments: TranscriptSegment[],
  anchorWindow: string,
): TranscriptSegment[] {
  if (segments.length === 0 || !anchorWindow) return [];

  // Find where the anchor window starts by matching the first anchor segment
  const anchorLines = anchorWindow.split('\n').filter(Boolean);
  if (anchorLines.length === 0) return segments;

  // The anchor window contains the last N segments. Return everything before.
  // We find the first segment IN the anchor, then return everything before it.
  for (let i = 0; i < segments.length; i++) {
    const formatted = formatSegment(segments[i]);
    if (anchorWindow.includes(formatted.trim())) {
      return segments.slice(0, i);
    }
  }

  return segments; // Anchor didn't match — return all (shouldn't happen)
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function formatSegment(segment: TranscriptSegment): string {
  return `[${segment.ts}] ${segment.text}`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}