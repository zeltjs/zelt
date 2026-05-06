import { describe, expect, it } from 'vitest';

import { KVError, MinPrefixLengthError, MinTtlError, UnsupportedOperationError } from './errors';

describe('errors', () => {
  it('KVError extends Error and carries a name', () => {
    const err = new KVError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('KVError');
    expect(err.message).toBe('boom');
  });

  it('UnsupportedOperationError extends KVError', () => {
    const err = new UnsupportedOperationError('not supported');
    expect(err).toBeInstanceOf(KVError);
    expect(err.name).toBe('UnsupportedOperationError');
  });

  it('MinTtlError extends KVError', () => {
    const err = new MinTtlError('ttl too small');
    expect(err).toBeInstanceOf(KVError);
    expect(err.name).toBe('MinTtlError');
  });

  it('MinPrefixLengthError extends KVError', () => {
    const err = new MinPrefixLengthError();
    expect(err).toBeInstanceOf(KVError);
    expect(err.name).toBe('MinPrefixLengthError');
    expect(err.message).toBe('namespace prefix must not be empty');
  });
});
