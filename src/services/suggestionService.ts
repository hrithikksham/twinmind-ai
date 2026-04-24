/**
 * suggestionService.ts
 *
 * Pure async service — no store access, no side effects.
 * Receives data as arguments, returns validated SuggestionBatch or throws.
 *
 * Three-gate validation flow (CLAUDE.md §8 Runtime Validation):
 *   Gate 1 — Zod schema (structural)
 *   Gate 2 — Semantic heuristics (specificity, diversity, depth)
 *   Gate 3 — Graceful degradation (retry once, fall back to previous batch)
 */

import { SuggestionResponseSchema, type SuggestionBatch } from '../utils/validators';
import {
  validateSemantics,
  buildRetryInstruction,
  type SemanticValidationResult,
} from '../utils/semanticValidators';
import { buildSuggestionPrompt, type PromptContext } from './suggestionPrompt';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SuggestionServiceInput {
  anchorWindow: string;
  summaryWindow: string;
  timestamp: string;
  contextWindowTokens?: number;
  groqApiKey: string;
}

export type SuggestionServiceResult =
  | { ok: true; batch: SuggestionBatch; retried: boolean }
  | { ok: false; reason: 'GATE1_FAIL' | 'GATE2_FAIL' | 'NETWORK_ERROR'; detail: string };

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Fetches a validated suggestion batch.
 * Handles retry logic internally — caller gets a clean result or failure reason.
 *
 * This function is called by useSuggestions hook. It never touches any store.
 */
export async function fetchSuggestions(
  input: SuggestionServiceInput,
): Promise<SuggestionServiceResult> {
  const context: PromptContext = {
    summaryWindow: input.summaryWindow,
    anchorWindow: input.anchorWindow,
    timestamp: input.timestamp,
  };

  // ── First attempt ──────────────────────────────────────────────────────────
  let rawResponse: string;
  try {
    rawResponse = await callSuggestionsAPI(context, input.groqApiKey);
  } catch (err) {
    return {
      ok: false,
      reason: 'NETWORK_ERROR',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Gate 1 — structural
  const gate1Result = runGate1(rawResponse);
  if (!gate1Result.ok) {
    // Retry with JSON-strict instruction
    return await retryWithInstruction(context, input.groqApiKey, 'GATE1');
  }

  // Gate 2 — semantic
  const semanticResult = validateSemantics(gate1Result.batch);
  if (!semanticResult.passed) {
    // Retry with specificity-reinforcement instruction
    const retryInstruction = buildRetryInstruction(semanticResult.failures);
    return await retryWithInstruction(context, input.groqApiKey, 'GATE2', retryInstruction);
  }

  return { ok: true, batch: gate1Result.batch, retried: false };
}

// ─── Retry path ───────────────────────────────────────────────────────────────

async function retryWithInstruction(
  context: PromptContext,
  groqApiKey: string,
  failedGate: 'GATE1' | 'GATE2',
  retryInstruction?: string,
): Promise<SuggestionServiceResult> {
  const jsonStrictInstruction =
    failedGate === 'GATE1'
      ? '\n\nCRITICAL: Your previous output was not valid JSON. Output ONLY a single JSON object. ' +
        'No markdown fences, no preamble, no explanation. Start your response with "{" and end with "}".'
      : retryInstruction ?? '';

  let rawRetry: string;
  try {
    rawRetry = await callSuggestionsAPI(context, groqApiKey, jsonStrictInstruction);
  } catch (err) {
    return {
      ok: false,
      reason: 'NETWORK_ERROR',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Gate 1 on retry
  const gate1Retry = runGate1(rawRetry);
  if (!gate1Retry.ok) {
    return { ok: false, reason: 'GATE1_FAIL', detail: gate1Retry.error };
  }

  // Gate 2 on retry
  const semanticRetry = validateSemantics(gate1Retry.batch);
  if (!semanticRetry.passed) {
    return {
      ok: false,
      reason: 'GATE2_FAIL',
      detail: `Semantic failures after retry: ${semanticRetry.failures.join(', ')}`,
    };
  }

  return { ok: true, batch: gate1Retry.batch, retried: true };
}

// ─── Gate 1 runner ────────────────────────────────────────────────────────────

type Gate1Result =
  | { ok: true; batch: SuggestionBatch }
  | { ok: false; error: string };

function runGate1(raw: string): Gate1Result {
  // Strip any accidental markdown fences before parsing
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const result = SuggestionResponseSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: `Zod validation failed: ${result.error.issues.map((i) => i.message).join('; ')}`,
    };
  }

  return { ok: true, batch: result.data };
}

// ─── API call ─────────────────────────────────────────────────────────────────

/**
 * Calls /api/suggestions — the thin Next.js route that proxies to Groq.
 * The route injects the GROQ_API_KEY server-side; we pass key here for client-side override support.
 */
async function callSuggestionsAPI(
  context: PromptContext,
  groqApiKey: string,
  retryInstruction?: string,
): Promise<string> {
  const { systemPrompt, userPrompt } = buildSuggestionPrompt(context, retryInstruction);

  const response = await fetch('/api/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt,
      userPrompt,
      groqApiKey,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown error');
    throw new Error(`/api/suggestions ${response.status}: ${errText}`);
  }

  const data = await response.json();

  if (typeof data.content !== 'string') {
    throw new Error(`Unexpected /api/suggestions response shape: ${JSON.stringify(data)}`);
  }

  return data.content;
}