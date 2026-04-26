import {
  SuggestionResponseSchema,
  type SuggestionBatch,
} from '../utils/validators';

import { validateSemantics, buildRetryInstruction } from '../utils/semanticValidators';

import { buildSuggestionPrompt, type PromptContext } from './suggestionPrompt';

// ─── Result types (strict discriminated union) ────────────────────────────────
// ok: true  ─ the batch validated and is ready to store
// ok: false ─ a specific reason is set; never ambiguous

export type FetchSuggestionsResult =
  | { ok: true; batch: SuggestionBatch; retried: boolean }
  | { ok: false; reason: 'NETWORK' | 'GATE1' | 'GATE2'; detail: string };

// ─── Gate-1 result ────────────────────────────────────────────────────────────

type Gate1Result =
  | { ok: true; batch: SuggestionBatch }
  | { ok: false; error: string };

// ─── Normalise ────────────────────────────────────────────────────────────────
// Caps the suggestion list at 3. The schema accepts 1–5 (LLM variability),
// the UI always shows ≤3. Normalisation happens HERE, not in the validator.

function normalizeBatch(batch: SuggestionBatch): SuggestionBatch {
  if (batch.inferred_mode === 'INSUFFICIENT_CONTEXT') return batch;
  return { ...batch, suggestions: batch.suggestions.slice(0, 3) };
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function fetchSuggestions(input: {
  anchorWindow: string;
  summaryWindow: string;
  timestamp: string;
  groqApiKey?: string;
}): Promise<FetchSuggestionsResult> {
  const context: PromptContext = {
    anchorWindow: input.anchorWindow,
    summaryWindow: input.summaryWindow,
    timestamp: input.timestamp,
  };

  // ── First attempt ────────────────────────────────────────────────────────────
  let raw: string;
  try {
    raw = await callAPI(context, undefined, input.groqApiKey);
  } catch (err) {
    return { ok: false, reason: 'NETWORK', detail: toMessage(err) };
  }

  const gate1 = runGate1(raw);

  if (!gate1.ok) {
    // Structural failure → retry once with explicit JSON-only instruction
    return retryOnce(context, input.groqApiKey, {
      extraInstruction:
        'IMPORTANT: Output ONLY valid JSON. No explanation, no markdown, no code fences. ' +
        'Begin with { and end with }.',
      failReason: 'GATE1',
    });
  }

  const { batch } = gate1;

  // Sparse context is a valid terminal state — no semantic check needed
  if (batch.inferred_mode === 'INSUFFICIENT_CONTEXT') {
    return { ok: true, batch, retried: false };
  }

  // ── Gate 2: semantic heuristics ───────────────────────────────────────────────
  const semantic = validateSemantics(batch);

  if (!semantic.passed) {
    // Semantic failure → retry once with specificity-reinforcement instruction.
    // The retry does NOT re-run Gate 2 — that would risk an infinite chain.
    return retryOnce(context, input.groqApiKey, {
      extraInstruction: buildRetryInstruction(semantic.failures),
      failReason: 'GATE2',
    });
  }

  return { ok: true, batch: normalizeBatch(batch), retried: false };
}

// ─── Single retry (never recurses) ───────────────────────────────────────────
// Called at most once from fetchSuggestions. Returns the raw Gate-1 outcome
// with its own error reason if it still fails. Gate 2 is intentionally skipped
// on retry to prevent Gate1→retry→Gate1→fail death loops.

async function retryOnce(
  context: PromptContext,
  key: string | undefined,
  opts: { extraInstruction: string; failReason: 'GATE1' | 'GATE2' },
): Promise<FetchSuggestionsResult> {
  let raw: string;
  try {
    raw = await callAPI(context, opts.extraInstruction, key);
  } catch (err) {
    return { ok: false, reason: 'NETWORK', detail: toMessage(err) };
  }

  const gate1 = runGate1(raw);

  if (!gate1.ok) {
    return { ok: false, reason: opts.failReason, detail: gate1.error };
  }

  return { ok: true, batch: normalizeBatch(gate1.batch), retried: true };
}

// ─── Gate 1: structural validation ───────────────────────────────────────────
// Strips any Markdown code fences before parsing — LLMs sometimes wrap JSON in
// ```json … ``` despite explicit instructions not to.

function runGate1(raw: string): Gate1Result {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed: unknown = JSON.parse(cleaned);
    const result = SuggestionResponseSchema.safeParse(parsed);

    if (!result.success) {
      return { ok: false, error: result.error.message };
    }

    return { ok: true, batch: result.data };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

// ─── API call ─────────────────────────────────────────────────────────────────

async function callAPI(
  context: PromptContext,
  retryInstruction: string | undefined,
  groqApiKey: string | undefined,
): Promise<string> {
  const { systemPrompt, userPrompt } = buildSuggestionPrompt(context, retryInstruction);

  const res = await fetch('/api/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt,
      userPrompt,
      expectJson: true,   // enforces JSON-only output at the Groq level → eliminates code-fence Gate 1 failures
      ...(groqApiKey ? { groqApiKey } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(errText);
  }

  const data: unknown = await res.json();

  if (
    data === null ||
    typeof data !== 'object' ||
    typeof (data as Record<string, unknown>).content !== 'string'
  ) {
    throw new Error('Invalid API response: missing string "content" field');
  }

  return (data as { content: string }).content;
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}