import * as v from 'valibot';

import type { ValidationErrorBody } from './error-schema';

export const toErrorResponse = (error: unknown): Response => {
  if (error instanceof v.ValiError) {
    const body: ValidationErrorBody = {
      error: 'validation_failed',
      issues: error.issues,
    };
    return Response.json(body, { status: 400 });
  }
  const message = error instanceof Error ? error.message : 'unknown error';
  return Response.json({ error: 'internal_error', message }, { status: 500 });
};
