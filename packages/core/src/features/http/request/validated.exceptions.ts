import type { StandardSchemaV1 } from '@standard-schema/spec';

import { defineHttpException } from '../../../kernel';

export const ValidationFailedException = defineHttpException(
  'ValidationFailedException',
  400,
  (ctx: { issues: readonly StandardSchemaV1.Issue[] }) =>
    `Validation failed: ${ctx.issues.length} issue(s)`,
  {
    buildResponse: (ctx, status) =>
      Response.json({ code: 'VALIDATION_FAILED', issues: ctx.issues }, { status }),
  },
);

const ASYNC_VALIDATION_MESSAGE = 'validated() does not support async validation schemas.';

export const AsyncValidationUnsupportedException = defineHttpException(
  'AsyncValidationUnsupportedException',
  500,
  () => ASYNC_VALIDATION_MESSAGE,
  {
    buildResponse: (_ctx, status, message) =>
      Response.json({ code: 'ASYNC_VALIDATION_UNSUPPORTED', message }, { status }),
  },
);
