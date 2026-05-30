import { defineHttpException } from '@zeltjs/core';
import type { BaseIssue } from 'valibot';

export const ValidationFailedException = defineHttpException(
  'ValidationFailedException',
  400,
  (ctx: { issues: readonly BaseIssue<unknown>[] }) =>
    `Validation failed: ${ctx.issues.length} issue(s)`,
  {
    buildResponse: (ctx, status) =>
      Response.json({ code: 'VALIDATION_FAILED', issues: ctx.issues }, { status }),
  },
);
