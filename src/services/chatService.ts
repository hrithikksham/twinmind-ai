/**
 * chatService.ts
 *
 * Pure async service — no store access, no side effects.
 * Receives all context as arguments, streams tokens via callback.
 *
 * Two entry points:
 *   sendMessage()      — user-typed message
 *   sendDetailPrompt() — suggestion card clicked (routes detail_prompt)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant';

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export interface ChatServiceInput {
  /** The message to send (user text or detail_prompt) */
  message: string;

  /** Full current transcript — injected as system context per CLAUDE.md §5 */
  transcript: string;

  /** Last N turns of conversation history (caller is responsible for capping) */
  history: ChatTurn[];

  /** Groq API key (from settingsStore) */
  groqApiKey: string;

  /** Called with each token chunk as it arrives from the stream */
  onToken: (token: string) => void;

  /** Called once when the stream ends cleanly */
  onDone: () => void;

  /** Called on any network or parse error */
  onError: (err: Error) => void;
}

// Maximum turns kept in history before the oldest are dropped.
// Matches CLAUDE.md §5: "cap at the last 10 turns".
export const MAX_HISTORY_TURNS = 10;

// ─── Public entry points ──────────────────────────────────────────────────────

/**
 * Sends a user-typed message and streams the response.
 */
export function sendMessage(input: ChatServiceInput): AbortController {
  return streamChatRequest(input);
}

/**
 * Sends a suggestion's detail_prompt as the user message.
 * Semantically identical to sendMessage — kept separate so call sites are explicit
 * about the source of the message.
 */
export function sendDetailPrompt(input: ChatServiceInput): AbortController {
  return streamChatRequest(input);
}

/**
 * Trims a turn history array to the last MAX_HISTORY_TURNS entries.
 * Called by the hook before passing history into the service.
 * Lives here (not in the hook) so the capping logic is testable in isolation.
 */
export function capHistory(turns: ChatTurn[]): ChatTurn[] {
  if (turns.length <= MAX_HISTORY_TURNS) return turns;
  return turns.slice(turns.length - MAX_HISTORY_TURNS);
}

// ─── Core streaming function ──────────────────────────────────────────────────

function streamChatRequest(input: ChatServiceInput): AbortController {
  const { message, transcript, history, groqApiKey, onToken, onDone, onError } = input;

  const controller = new AbortController();

  // Run async; return the controller immediately so caller can abort
  void (async () => {
    let response: Response;
    try {
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ message, transcript, groqApiKey, history }),
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // intentional cancel
      onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => 'unknown');
      onError(new Error(`/api/chat ${response.status}: ${detail}`));
      return;
    }

    if (!response.body) {
      onError(new Error('/api/chat returned no body'));
      return;
    }

    // ── Parse OpenAI-compatible SSE stream ──────────────────────────────────
    // Groq streams `data: {...}\n\n` lines. We decode each line, extract the
    // delta content, and forward it to onToken as it arrives.

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are newline-delimited; process all complete lines
        const lines = buffer.split('\n');
        // Keep the last (potentially incomplete) line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice('data: '.length);

          let parsed: unknown;
          try {
            parsed = JSON.parse(jsonStr);
          } catch {
            continue; // malformed SSE line — skip
          }

          const token = extractDelta(parsed);
          if (token) onToken(token);
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      onError(err instanceof Error ? err : new Error(String(err)));
      return;
    } finally {
      reader.releaseLock();
    }

    onDone();
  })();

  return controller;
}

// ─── SSE delta extraction ─────────────────────────────────────────────────────

/**
 * Extracts the text delta from an OpenAI-compatible SSE chunk.
 * Returns null if the chunk carries no text (e.g. role-only chunks).
 */
function extractDelta(chunk: unknown): string | null {
  if (chunk === null || typeof chunk !== 'object') return null;

  const choices = (chunk as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const delta = (choices[0] as Record<string, unknown>).delta;
  if (delta === null || typeof delta !== 'object') return null;

  const content = (delta as Record<string, unknown>).content;
  return typeof content === 'string' ? content : null;
}