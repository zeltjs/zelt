import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { validationErrorBodySchema, type ValidationErrorBody } from './error-schema';

describe('validationErrorBodySchema', () => {
  it('accepts valid body', () => {
    const sample: ValidationErrorBody = {
      error: 'validation_failed',
      issues: [],
    };
    expect(() => v.parse(validationErrorBodySchema, sample)).not.toThrow();
  });

  it('rejects wrong error literal', () => {
    expect(() => v.parse(validationErrorBodySchema, { error: 'other', issues: [] })).toThrow();
  });

  it('round-trips a real ValiError', () => {
    const schema = v.object({ name: v.string() });
    const result = v.safeParse(schema, { name: 123 });
    if (result.success) throw new Error('should fail');
    const body: ValidationErrorBody = {
      error: 'validation_failed',
      issues: result.issues,
    };
    expect(() => v.parse(validationErrorBodySchema, body)).not.toThrow();
  });
});
