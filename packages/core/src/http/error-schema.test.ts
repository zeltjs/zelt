import { describe, expect, it } from 'vitest';

import type { ValidationErrorBody, ErrorBody } from './error-schema';

describe('ValidationErrorBody', () => {
  it('type matches expected structure', () => {
    const sample: ValidationErrorBody = {
      code: 'VALIDATION_FAILED',
      issues: [{ kind: 'schema', type: 'string', message: 'Expected string' }],
    };
    expect(sample.code).toBe('VALIDATION_FAILED');
    expect(sample.issues.length).toBe(1);
  });

  it('issues can have optional path', () => {
    const sample: ValidationErrorBody = {
      code: 'VALIDATION_FAILED',
      issues: [{ kind: 'schema', type: 'string', message: 'Expected string', path: ['field'] }],
    };
    expect(sample.issues[0]?.path).toEqual(['field']);
  });
});

describe('ErrorBody', () => {
  it('can be ValidationErrorBody', () => {
    const body: ErrorBody = {
      code: 'VALIDATION_FAILED',
      issues: [],
    };
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('can be InternalErrorBody', () => {
    const body: ErrorBody = {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    };
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
