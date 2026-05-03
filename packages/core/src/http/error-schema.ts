import * as v from 'valibot';

const issueSchema = v.object({
  kind: v.string(),
  type: v.string(),
  message: v.string(),
  path: v.optional(v.array(v.unknown())),
});

const validationVariant = v.object({
  error: v.literal('validation_failed'),
  issues: v.array(issueSchema),
});

const httpExceptionVariant = v.object({
  error: v.literal('http_exception'),
  message: v.string(),
});

const internalErrorVariant = v.object({
  error: v.literal('internal_error'),
  message: v.string(),
});

export const koyaErrorBodySchema = v.variant('error', [
  validationVariant,
  httpExceptionVariant,
  internalErrorVariant,
]);

// validation_failed variant 単独 schema (既存名互換、@koya/contract から参照される)
export const validationErrorBodySchema = validationVariant;

export type KoyaErrorBody = v.InferOutput<typeof koyaErrorBodySchema>;
export type ValidationErrorBody = v.InferOutput<typeof validationErrorBodySchema>;
