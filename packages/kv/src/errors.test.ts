import { describe, expect, it } from 'vitest';

import { ZeltKVInvalidTtlError } from './errors';

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
    expect(err).toBeInstanceOf(ZeltKVInvalidTtlError);
    expect(err).toBeInstanceOf(Error);
  });
});
