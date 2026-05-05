import * as v from 'valibot';

const issueSchema = v.object({
  kind: v.string(),
  type: v.string(),
  message: v.string(),
  path: v.optional(v.array(v.unknown())),
});

const validationVariant = v.object({
  code: v.literal('VALIDATION_FAILED'),
  issues: v.array(issueSchema),
});

const internalErrorVariant = v.object({
  code: v.literal('INTERNAL_ERROR'),
  message: v.string(),
});

export const koyaErrorBodySchema = v.variant('code', [validationVariant, internalErrorVariant]);

export const validationErrorBodySchema = validationVariant;

export type KoyaErrorBody = v.InferOutput<typeof koyaErrorBodySchema>;
export type ValidationErrorBody = v.InferOutput<typeof validationErrorBodySchema>;
