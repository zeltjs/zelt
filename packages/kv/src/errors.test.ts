import { describe, expect, it } from 'vitest';

import { isZeltKVInvalidTtlError, ZeltKVInvalidTtlError } from './errors';

describe('ZeltKVInvalidTtlError', () => {
  it('creates error with correct name and message', () => {
    const err = new ZeltKVInvalidTtlError({ ttlSec: 0 });
    expect(err.name).toBe('ZeltKVInvalidTtlError');
    expect(err.message).toContain('0');
    expect(err.context.ttlSec).toBe(0);
  });

  it('works with negative value', () => {
    const err = new ZeltKVInvalidTtlError({ ttlSec: -5 });
    expect(err.context.ttlSec).toBe(-5);
    expect(err.message).toContain('-5');
  });

  it('works with instanceof', () => {
    const err = new ZeltKVInvalidTtlError({ ttlSec: 0 });
    expect(err instanceof ZeltKVInvalidTtlError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});

describe('isZeltKVInvalidTtlError', () => {
  it('returns true for ZeltKVInvalidTtlError', () => {
    const err = new ZeltKVInvalidTtlError({ ttlSec: 0 });
    expect(isZeltKVInvalidTtlError(err)).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isZeltKVInvalidTtlError(new Error('other'))).toBe(false);
    expect(isZeltKVInvalidTtlError(null)).toBe(false);
    expect(isZeltKVInvalidTtlError(undefined)).toBe(false);
  });
});
