import * as v from 'valibot';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  koyaErrorBodySchema,
  validationErrorBodySchema,
  type KoyaErrorBody,
  type ValidationErrorBody,
} from './error-schema';

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

describe('koyaErrorBodySchema', () => {
  it('accepts validation_failed variant', () => {
    const body: KoyaErrorBody = { error: 'validation_failed', issues: [] };
    expect(() => v.parse(koyaErrorBodySchema, body)).not.toThrow();
  });

  it('accepts http_exception variant', () => {
    const body: KoyaErrorBody = { error: 'http_exception', message: 'not found' };
    expect(() => v.parse(koyaErrorBodySchema, body)).not.toThrow();
  });

  it('accepts internal_error variant', () => {
    const body: KoyaErrorBody = { error: 'internal_error', message: 'boom' };
    expect(() => v.parse(koyaErrorBodySchema, body)).not.toThrow();
  });

  it('rejects unknown error literal', () => {
    expect(() => v.parse(koyaErrorBodySchema, { error: 'other_error', message: 'x' })).toThrow();
  });

  it('rejects http_exception without message', () => {
    expect(() => v.parse(koyaErrorBodySchema, { error: 'http_exception' })).toThrow();
  });
});

// 論点 4 (discriminator narrowing) の唯一の検証手段。
describe('KoyaErrorBody — discriminator narrowing (type-level)', () => {
  it('narrows http_exception variant', () => {
    expectTypeOf<Extract<KoyaErrorBody, { error: 'http_exception' }>>().toEqualTypeOf<{
      error: 'http_exception';
      message: string;
    }>();
  });

  it('narrows internal_error variant', () => {
    expectTypeOf<Extract<KoyaErrorBody, { error: 'internal_error' }>>().toEqualTypeOf<{
      error: 'internal_error';
      message: string;
    }>();
  });

  it('narrows validation_failed variant carrying issues array', () => {
    type V = Extract<KoyaErrorBody, { error: 'validation_failed' }>;
    expectTypeOf<V['issues']>().toBeArray();
  });

  it('keeps ValidationErrorBody shape-equal to validation_failed variant', () => {
    expectTypeOf<ValidationErrorBody>().toEqualTypeOf<
      Extract<KoyaErrorBody, { error: 'validation_failed' }>
    >();
  });
});
