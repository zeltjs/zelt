import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { HttpExceptionClass } from '../../../kernel';
import { defineHttpException } from '../../../kernel';

export type ValidationFailedContext = {
  issues: readonly StandardSchemaV1.Issue[];
};

export const ValidationFailedException: HttpExceptionClass<ValidationFailedContext> =
  defineHttpException(
    'ValidationFailedException',
    400,
    (ctx: ValidationFailedContext) => `Validation failed: ${ctx.issues.length} issue(s)`,
    {
      buildResponse: (ctx, status) =>
        Response.json({ code: 'VALIDATION_FAILED', issues: ctx.issues }, { status }),
    },
  );

const ASYNC_VALIDATION_MESSAGE = 'request() does not support async validation schemas.';

export const AsyncValidationUnsupportedException: HttpExceptionClass<unknown> = defineHttpException(
  'AsyncValidationUnsupportedException',
  500,
  () => ASYNC_VALIDATION_MESSAGE,
  {
    buildResponse: (_ctx, status, message) =>
      Response.json({ code: 'ASYNC_VALIDATION_UNSUPPORTED', message }, { status }),
  },
);
