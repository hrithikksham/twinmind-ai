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

// ───────────────────────────────────────────────────────────────────────
// Types (STRICT DISCRIMINATED UNION)
// ───────────────────────────────────────────────────────────────────────

type SuccessResult = {
  ok: true;
  batch: SuggestionBatch;
  retried: boolean;
};

type ErrorResult = {
  ok: false;
  reason: 'NETWORK' | 'GATE1' | 'GATE2';
  detail: string;
};

type Result = SuccessResult | ErrorResult;

// ───────────────────────────────────────────────────────────────────────
// Normalize
// ───────────────────────────────────────────────────────────────────────

function normalizeBatch(batch: SuggestionBatch): SuggestionBatch {
  if (batch.inferred_mode === 'INSUFFICIENT_CONTEXT') return batch;

  return {
    ...batch,
    suggestions: batch.suggestions.slice(0, 3),
  };
}

// ───────────────────────────────────────────────────────────────────────
// Entry
// ───────────────────────────────────────────────────────────────────────

export async function fetchSuggestions(input: {
  anchorWindow: string;
  summaryWindow: string;
  timestamp: string;
  groqApiKey?: string;
}): Promise<Result> {
  const context: PromptContext = {
    anchorWindow: input.anchorWindow,
    summaryWindow: input.summaryWindow,
    timestamp: input.timestamp,
  };

  let raw: string;

  try {
    raw = await callAPI(context, undefined, input.groqApiKey);
  } catch (err) {
    return {
      ok: false,
      reason: 'NETWORK',
      detail: String(err),
    };
  }

  const parsed = runGate1(raw);

  if (!parsed.ok) {
    return retry(context, input.groqApiKey);
  }

  // ✅ NOW SAFE — TS knows batch exists
  const batch = parsed.batch;

  if (batch.inferred_mode === 'INSUFFICIENT_CONTEXT') {
    return { ok: true, batch, retried: false };
  }

  const semantic = validateSemantics(batch);

  if (!semantic.passed) {
    return retry(
      context,
      input.groqApiKey,
      buildRetryInstruction(semantic.failures),
    );
  }

  return {
    ok: true,
    batch: normalizeBatch(batch),
    retried: false,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Gate 1 (STRICT RETURN TYPE)
// ───────────────────────────────────────────────────────────────────────

function runGate1(
  raw: string,
):
  | { ok: true; batch: SuggestionBatch }
  | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw.trim());
    const result = SuggestionResponseSchema.safeParse(parsed);

    if (!result.success) {
      return {
        ok: false,
        error: result.error.message,
      };
    }

    return {
      ok: true,
      batch: result.data,
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err),
    };
  }
}

// ───────────────────────────────────────────────────────────────────────
// Retry
// ───────────────────────────────────────────────────────────────────────

async function retry(
  context: PromptContext,
  key?: string,
  instruction?: string,
): Promise<Result> {
  try {
    const raw = await callAPI(context, instruction, key);
    const parsed = runGate1(raw);

    if (!parsed.ok) {
      return {
        ok: false,
        reason: 'GATE1',
        detail: parsed.error,
      };
    }

    return {
      ok: true,
      batch: normalizeBatch(parsed.batch),
      retried: true,
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'NETWORK',
      detail: String(err),
    };
  }
}

// ───────────────────────────────────────────────────────────────────────
// API
// ───────────────────────────────────────────────────────────────────────

async function callAPI(
  context: PromptContext,
  retryInstruction?: string,
  groqApiKey?: string,
): Promise<string> {
  const { systemPrompt, userPrompt } = buildSuggestionPrompt(
    context,
    retryInstruction,
  );

  const res = await fetch('/api/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt,
      userPrompt,
      ...(groqApiKey ? { groqApiKey } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const data = await res.json();

  if (!data || typeof data.content !== 'string') {
    throw new Error('Invalid API response shape');
  }

  return data.content;
}