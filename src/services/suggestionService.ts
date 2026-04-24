/**
 * suggestionService.ts
 *
 * Pure async service — no store access, no side effects.
 */

import {
  SuggestionResponseSchema,
  type SuggestionBatch,
} from '../utils/validators';

import {
  validateSemantics,
  buildRetryInstruction,
} from '../utils/semanticValidators';

import {
  buildSuggestionPrompt,
  type PromptContext,
} from './suggestionPrompt';

// ─── Types ────────────────────────────────────────

export interface SuggestionServiceInput {
  anchorWindow: string;
  summaryWindow: string;
  timestamp: string;
  contextWindowTokens?: number;
}

export type SuggestionServiceResult =
  | { ok: true; batch: SuggestionBatch; retried: boolean }
  | {
      ok: false;
      reason: 'GATE1_FAIL' | 'GATE2_FAIL' | 'NETWORK_ERROR';
      detail: string;
    };

// ─── Entry ────────────────────────────────────────

export async function fetchSuggestions(
  input: SuggestionServiceInput,
): Promise<SuggestionServiceResult> {
  const context: PromptContext = {
    summaryWindow: input.summaryWindow,
    anchorWindow: input.anchorWindow,
    timestamp: input.timestamp,
  };

  let raw: string;

  try {
    raw = await callSuggestionsAPI(context);
  } catch (err) {
    return {
      ok: false,
      reason: 'NETWORK_ERROR',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // ── Gate 1
  const gate1 = runGate1(raw);

  if (!gate1.ok) {
    return retryWithInstruction(context, 'GATE1');
  }

  // ── Gate 2
  const semantic = validateSemantics(gate1.batch);

  if (!semantic.passed) {
    const retryInstruction = buildRetryInstruction(semantic.failures);
    return retryWithInstruction(context, 'GATE2', retryInstruction);
  }

  return { ok: true, batch: gate1.batch, retried: false };
}

// ─── Retry ────────────────────────────────────────

async function retryWithInstruction(
  context: PromptContext,
  failedGate: 'GATE1' | 'GATE2',
  retryInstruction?: string,
): Promise<SuggestionServiceResult> {
  const instruction =
    failedGate === 'GATE1'
      ? '\n\nCRITICAL: Output ONLY valid JSON. No markdown. No explanation.'
      : retryInstruction ?? '';

  let raw: string;

  try {
    raw = await callSuggestionsAPI(context, instruction);
  } catch (err) {
    return {
      ok: false,
      reason: 'NETWORK_ERROR',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const gate1 = runGate1(raw);

  if (!gate1.ok) {
    return {
      ok: false,
      reason: 'GATE1_FAIL',
      detail: gate1.error,
    };
  }

  const semantic = validateSemantics(gate1.batch);

  if (!semantic.passed) {
    return {
      ok: false,
      reason: 'GATE2_FAIL',
      detail: semantic.failures.join(', '),
    };
  }

  return { ok: true, batch: gate1.batch, retried: true };
}

// ─── Gate 1 (STRICT FIX) ──────────────────────────

function runGate1(raw: string):
  | { ok: true; batch: SuggestionBatch }
  | { ok: false; error: string } {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return {
      ok: false,
      error: `JSON parse failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  const result = SuggestionResponseSchema.safeParse(parsed);

  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues.map((i) => i.message).join('; '),
    };
  }

  // ✅ CRITICAL: now guaranteed non-undefined
  return {
    ok: true,
    batch: result.data,
  };
}

// ─── API ──────────────────────────────────────────

async function callSuggestionsAPI(
  context: PromptContext,
  retryInstruction?: string,
): Promise<string> {
  const { systemPrompt, userPrompt } = buildSuggestionPrompt(
    context,
    retryInstruction,
  );

  const response = await fetch('/api/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt,
      userPrompt,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown error');
    throw new Error(`/api/suggestions ${response.status}: ${errText}`);
  }

  const data: unknown = await response.json();

  if (
    !data ||
    typeof data !== 'object' ||
    !('content' in data) ||
    typeof (data as Record<string, unknown>).content !== 'string'
  ) {
    throw new Error('Invalid /api/suggestions response shape');
  }

  return (data as Record<string, string>).content;
}