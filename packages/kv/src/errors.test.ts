import { describe, expect, it } from 'vitest';

import { KVError } from './errors';

describe('errors', () => {
  it('invalidTtl returns INVALID_TTL with correct fields', () => {
    const e = KVError.invalidTtl(0);
    expect(e.type).toBe('INVALID_TTL');
    expect(e.details['ttlSec']).toBe(0);
    expect(e.message).toContain('0');
  });

  it('invalidTtl with negative value', () => {
    const e = KVError.invalidTtl(-5);
    expect(e.type).toBe('INVALID_TTL');
    expect(e.details['ttlSec']).toBe(-5);
  });

  it('storeOperationFailed returns STORE_OPERATION_FAILED with Error cause', () => {
    const cause = new Error('redis down');
    const e = KVError.storeOperationFailed('get', cause);
    expect(e.type).toBe('STORE_OPERATION_FAILED');
    expect(e.details['op']).toBe('get');
    expect(e.details['cause']).toBe(cause);
    expect(e.message).toContain('redis down');
  });

  it('storeOperationFailed with non-Error cause uses String()', () => {
    const e = KVError.storeOperationFailed('set', 'timeout');
    expect(e.type).toBe('STORE_OPERATION_FAILED');
    expect(e.message).toContain('timeout');
  });
});
