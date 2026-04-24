import { z } from 'zod';

// ─── Suggestion Types ─────────────────────────────────────────────────────────

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

// ─── Conversation Mode Enum ───────────────────────────────────────────────────

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

// ─── Individual Suggestion Schema (Gate 1) ────────────────────────────────────

export const SuggestionSchema = z.object({
  type: SuggestionTypeEnum,

  // 15–25 words, must reference a concrete transcript element
  preview: z.string().min(10).max(200),

  // Self-contained query seeding the click-through detail answer
  detail_prompt: z.string().min(20),

  // The exact term/number/claim from transcript this suggestion references
  concrete_anchor: z.string().min(1),
});

export type Suggestion = z.infer<typeof SuggestionSchema>;

// ─── Full Batch Schema (Gate 1) ───────────────────────────────────────────────

export const SuggestionBatchSchema = z.object({
  inferred_mode: ConversationModeEnum,

  // One sentence: "Right now, the most useful thing is ___ because ___."
  user_need: z.string().min(10),

  // Always exactly 3 suggestions (INSUFFICIENT_CONTEXT → empty array exception)
  suggestions: z.array(SuggestionSchema).length(3),
});

// Special case: sparse context yields 0 suggestions
export const SuggestionBatchSparseSchema = z.object({
  inferred_mode: z.literal('INSUFFICIENT_CONTEXT'),
  user_need: z.string().min(10),
  suggestions: z.array(SuggestionSchema).length(0),
});

// Union: accept either a full batch or a sparse fallback
export const SuggestionResponseSchema = z.union([
  SuggestionBatchSchema,
  SuggestionBatchSparseSchema,
]);

export type SuggestionBatch = z.infer<typeof SuggestionResponseSchema>;

// ─── Stored Batch (includes audit metadata for export/QA) ─────────────────────

export const StoredSuggestionBatchSchema = SuggestionBatchSchema.extend({
  id: z.string(),
  timestamp: z.string(), // ISO timestamp of when this batch was generated
  anchor_window_snapshot: z.string(), // exact anchor window text sent to model
});

export type StoredSuggestionBatch = z.infer<typeof StoredSuggestionBatchSchema>;

// ─── API Request / Response Schemas ──────────────────────────────────────────

export const SuggestionsRequestSchema = z.object({
  anchorWindow: z.string().min(1),
  summaryWindow: z.string(),
  timestamp: z.string(),
  contextWindowTokens: z.number().int().positive().default(600),
});

export type SuggestionsRequest = z.infer<typeof SuggestionsRequestSchema>;