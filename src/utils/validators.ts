import { z } from 'zod';

// ─── Enums ─────────────────────────────────────────────────────────────

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

export const ConversationModeEnum = z.enum([
  'Q_AND_A',
  'BRAINSTORM',
  'DEBATE',
  'CONFUSION',
  'TECHNICAL',
  'DECISION',
  'CLOSING',
  'INSUFFICIENT_CONTEXT',
]);

export type ConversationMode = z.infer<typeof ConversationModeEnum>;

// ─── Suggestion ────────────────────────────────────────────────────────

export const SuggestionSchema = z.object({
  type: SuggestionTypeEnum,
  preview: z.string().min(10).max(200),
  detail_prompt: z.string().min(20),
  concrete_anchor: z.string().min(1),
});

export type Suggestion = z.infer<typeof SuggestionSchema>;

// ─── Flexible Suggestions Array ────────────────────────────────────────

const SuggestionsArraySchema = z
  .array(SuggestionSchema)
  .min(1)
  .max(5);

// ─── Main Batch ────────────────────────────────────────────────────────

export const SuggestionBatchSchema = z.object({
  inferred_mode: ConversationModeEnum.exclude(['INSUFFICIENT_CONTEXT']),
  user_need: z.string().min(10),
  suggestions: SuggestionsArraySchema,
});

// ─── Sparse Case ───────────────────────────────────────────────────────

export const SuggestionBatchSparseSchema = z.object({
  inferred_mode: z.literal('INSUFFICIENT_CONTEXT'),
  user_need: z.string().min(10),
  suggestions: z.array(SuggestionSchema).max(0),
});

// ─── Discriminated Union (FIXED) ───────────────────────────────────────

export const SuggestionResponseSchema = z.discriminatedUnion(
  'inferred_mode',
  [SuggestionBatchSchema, SuggestionBatchSparseSchema],
);

export type SuggestionBatch = z.infer<typeof SuggestionResponseSchema>;

// ─── Stored Batch (FIXED) ──────────────────────────────────────────────

const StoredSuggestionBatchFullSchema = SuggestionBatchSchema.extend({
  id: z.string(),
  timestamp: z.string(),
  anchor_window_snapshot: z.string(),
});

const StoredSuggestionBatchSparseSchema = SuggestionBatchSparseSchema.extend({
  id: z.string(),
  timestamp: z.string(),
  anchor_window_snapshot: z.string(),
});

export const StoredSuggestionBatchSchema = z.discriminatedUnion(
  'inferred_mode',
  [StoredSuggestionBatchFullSchema, StoredSuggestionBatchSparseSchema],
);

export type StoredSuggestionBatch = z.infer<
  typeof StoredSuggestionBatchSchema
>;

// ─── Request ───────────────────────────────────────────────────────────

export const SuggestionsRequestSchema = z.object({
  anchorWindow: z.string().min(1),
  summaryWindow: z.string(),
  timestamp: z.string(),
  contextWindowTokens: z.number().int().positive().default(600),
});

export type SuggestionsRequest = z.infer<typeof SuggestionsRequestSchema>;