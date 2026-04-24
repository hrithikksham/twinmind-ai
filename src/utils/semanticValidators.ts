import type { SuggestionBatch, Suggestion } from './validators';

// ─── Blocklist for concrete_anchor non-generic check ─────────────────────────

const ANCHOR_BLOCKLIST = new Set([
  'this',
  'it',
  'the topic',
  'the discussion',
  'that',
  'this topic',
  'this discussion',
  'the subject',
  'this subject',
]);

// ─── Specificity regex: proper noun OR numeric value ─────────────────────────
// Matches: "Postgres", "10k", "40%", "Q3", "$2M", "TLS 1.3", etc.

const SPECIFICITY_REGEX = /[A-Z][a-z]+|\d+[%kKmMbB$]?|\$\d+|[A-Z]{2,}/;

// ─── Vague language that should never appear in previews ─────────────────────

const VAGUE_WORDS_REGEX = /\b(consider|maybe|might want to|could|perhaps|possibly)\b/i;

// ─── Gate 2 — Semantic checks ─────────────────────────────────────────────────

export type SemanticFailure =
  | 'DUPLICATE_TYPES'
  | 'GENERIC_PREVIEW'
  | 'VAGUE_PREVIEW'
  | 'GENERIC_ANCHOR'
  | 'SHALLOW_DETAIL_PROMPT';

export interface SemanticValidationResult {
  passed: boolean;
  failures: SemanticFailure[];
}

/**
 * Gate 2 validator. Runs after Zod Gate 1 passes.
 * Returns all failures — caller decides retry strategy.
 */
export function validateSemantics(batch: SuggestionBatch): SemanticValidationResult {
  const failures: SemanticFailure[] = [];

  if (batch.inferred_mode === 'INSUFFICIENT_CONTEXT') {
    // Sparse context path: no suggestions to validate
    return { passed: true, failures: [] };
  }

  const suggestions = batch.suggestions;

  // Check 1: All 3 types must be unique
  const types = suggestions.map((s) => s.type);
  if (new Set(types).size !== 3) {
    failures.push('DUPLICATE_TYPES');
  }

  // Per-suggestion checks
  for (const suggestion of suggestions) {
    // Check 2: Preview must contain at least one proper noun or numeric value
    if (!SPECIFICITY_REGEX.test(suggestion.preview)) {
      failures.push('GENERIC_PREVIEW');
      break; // One failure is enough to trigger retry for this category
    }

    // Check 3: Preview must not contain vague hedge words
    if (VAGUE_WORDS_REGEX.test(suggestion.preview)) {
      failures.push('VAGUE_PREVIEW');
      break;
    }

    // Check 4: concrete_anchor must not be a pronoun or filler phrase
    if (isGenericAnchor(suggestion.concrete_anchor)) {
      failures.push('GENERIC_ANCHOR');
      break;
    }

    // Check 5: detail_prompt must be substantive (>80 chars) and end with a question
    if (!isDeepDetailPrompt(suggestion.detail_prompt)) {
      failures.push('SHALLOW_DETAIL_PROMPT');
      break;
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function isGenericAnchor(anchor: string): boolean {
  return ANCHOR_BLOCKLIST.has(anchor.trim().toLowerCase());
}

function isDeepDetailPrompt(prompt: string): boolean {
  return prompt.length > 80 && prompt.includes('?');
}

/**
 * Maps a set of semantic failures to a retry instruction suffix.
 * Appended to the original prompt on retry to tighten constraints.
 */
export function buildRetryInstruction(failures: SemanticFailure[]): string {
  const lines: string[] = [
    '\n\n════════════════════════════════',
    'RETRY CONSTRAINTS (PREVIOUS OUTPUT FAILED VALIDATION)',
    '════════════════════════════════',
  ];

  if (failures.includes('DUPLICATE_TYPES')) {
    lines.push(
      '⛔ DUPLICATE TYPES DETECTED: All 3 suggestion types MUST be different.' +
        ' Review your slot assignments. Do not use the same type twice under any circumstance.',
    );
  }

  if (failures.includes('GENERIC_PREVIEW') || failures.includes('VAGUE_PREVIEW')) {
    lines.push(
      '⛔ GENERIC/VAGUE PREVIEW DETECTED: Every preview MUST include at least one' +
        ' specific proper noun, number, metric, or named claim from the transcript.' +
        ' Words like "consider", "maybe", "could", "might" are forbidden in previews.' +
        ' If you cannot name a concrete element, the suggestion does not belong in this batch.',
    );
  }

  if (failures.includes('GENERIC_ANCHOR')) {
    lines.push(
      '⛔ GENERIC ANCHOR DETECTED: The concrete_anchor field must be the exact term,' +
        ' number, name, or claim from the transcript — not a pronoun or filler phrase.' +
        ' "this", "it", "the topic" are NOT valid anchors.',
    );
  }

  if (failures.includes('SHALLOW_DETAIL_PROMPT')) {
    lines.push(
      '⛔ SHALLOW DETAIL_PROMPT DETECTED: Each detail_prompt must be >80 characters,' +
        ' fully self-contained (no pronouns without referents), and phrased as a question.' +
        ' "Explain this further." is invalid. Write a specific, answerable question that' +
        ' includes the exact context needed for a 200–400 word useful response.',
    );
  }

  lines.push('Regenerate all 3 suggestions satisfying every constraint above. Output ONLY valid JSON.');

  return lines.join('\n');
}

/**
 * Validate a single suggestion for export-time audit use.
 * Returns a human-readable report — not used in hot path.
 */
export function auditSuggestion(suggestion: Suggestion): string[] {
  const issues: string[] = [];

  if (!SPECIFICITY_REGEX.test(suggestion.preview)) {
    issues.push(`Generic preview: "${suggestion.preview}" — no proper noun or numeric value`);
  }

  if (VAGUE_WORDS_REGEX.test(suggestion.preview)) {
    issues.push(`Vague language in preview: "${suggestion.preview}"`);
  }

  if (isGenericAnchor(suggestion.concrete_anchor)) {
    issues.push(`Generic anchor: "${suggestion.concrete_anchor}"`);
  }

  if (!isDeepDetailPrompt(suggestion.detail_prompt)) {
    issues.push(
      `Shallow detail_prompt (${suggestion.detail_prompt.length} chars, no "?"): "${suggestion.detail_prompt.slice(0, 60)}..."`,
    );
  }

  return issues;
}