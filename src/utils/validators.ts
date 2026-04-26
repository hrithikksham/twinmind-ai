import { z } from 'zod';

// ─── Enums ─────────────────────────────────────────────────────────────────────

export const SuggestionTypeEnum = z.enum([
  'ANSWER',
  'CLARIFY',
  'FACT_CHECK',
  'INSIGHT',
  'QUESTION',
  'DEFINITION',
  'PIVOT',
]);

export type SuggestionType = z.infer<typeof SuggestionTypeEnum>;

/**
 * Explicit enum for active (non-sparse) modes.
 * Using .exclude() on the full enum is fragile for discriminatedUnion because
 * Zod needs to statically map discriminant values to branches. A fresh z.enum
 * with the exact set is unambiguous.
 */
export const ActiveConversationModeEnum = z.enum([
  'Q_AND_A',
  'BRAINSTORM',
  'DEBATE',
  'CONFUSION',
  'TECHNICAL',
  'DECISION',
  'CLOSING',
]);

export type ActiveConversationMode = z.infer<typeof ActiveConversationModeEnum>;

export type ConversationMode = ActiveConversationMode | 'INSUFFICIENT_CONTEXT';

// ─── Suggestion ────────────────────────────────────────────────────────────────

export const SuggestionSchema = z.object({
  type: SuggestionTypeEnum,
  preview: z.string().min(10).max(200),
  detail_prompt: z.string().min(20),
  concrete_anchor: z.string().min(1),
});

export type Suggestion = z.infer<typeof SuggestionSchema>;

// ─── Flexible suggestions array ────────────────────────────────────────────────
// Accept 1–5 from the LLM. The service layer normalises to ≤3 before storage.
// NEVER use .length(3) here — LLMs don't always emit exactly 3 valid items,
// and a valid 1- or 2-item response must not be rejected at the boundary.

const SuggestionsArraySchema = z.array(SuggestionSchema).min(1).max(5);

// ─── Active batch ──────────────────────────────────────────────────────────────

export const SuggestionBatchSchema = z.object({
  inferred_mode: ActiveConversationModeEnum,
  user_need: z.string().min(10),
  suggestions: SuggestionsArraySchema,
});

export type SuggestionBatchFull = z.infer<typeof SuggestionBatchSchema>;

// ─── Sparse / insufficient-context batch ──────────────────────────────────────
// user_need is still required but can be short (the model outputs a one-liner).
// suggestions MUST be empty — use .max(0) on a typed array so the shape is
// consistent with the full batch while being provably empty.

export const SuggestionBatchSparseSchema = z.object({
  inferred_mode: z.literal('INSUFFICIENT_CONTEXT'),
  user_need: z.string().min(1),
  suggestions: z.array(SuggestionSchema).max(0),
});

export type SuggestionBatchSparse = z.infer<typeof SuggestionBatchSparseSchema>;

// ─── Discriminated union ───────────────────────────────────────────────────────
// Zod maps each distinct discriminant value to a branch:
//   - any of the 7 ActiveConversationMode values → SuggestionBatchSchema
//   - 'INSUFFICIENT_CONTEXT'                     → SuggestionBatchSparseSchema
// No value overlap; exhaustive; TypeScript-safe narrowing by inferred_mode.

export const SuggestionResponseSchema = z.discriminatedUnion('inferred_mode', [
  SuggestionBatchSchema,
  SuggestionBatchSparseSchema,
]);

export type SuggestionBatch = z.infer<typeof SuggestionResponseSchema>;

// ─── Request schema ────────────────────────────────────────────────────────────

export const SuggestionsRequestSchema = z.object({
  anchorWindow: z.string().min(1),
  summaryWindow: z.string(),
  timestamp: z.string(),
  contextWindowTokens: z.number().int().positive().default(600),
});

export type SuggestionsRequest = z.infer<typeof SuggestionsRequestSchema>;