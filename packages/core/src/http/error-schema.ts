import * as v from 'valibot';

// ValiError.issues は valibot.BaseIssue<unknown>[]。客側に晒す情報のみ定義し、
// 余分なフィールドはパース時に除去する方針 (将来 Phase 2 (3) で
// KoyaErrorSchema の variant として精緻化する余地を残すため)。
const issueSchema = v.object({
  kind: v.string(),
  type: v.string(),
  message: v.string(),
  path: v.optional(v.array(v.unknown())),
});

export const validationErrorBodySchema = v.object({
  error: v.literal('validation_failed'),
  issues: v.array(issueSchema),
});

export type ValidationErrorBody = v.InferOutput<typeof validationErrorBodySchema>;
