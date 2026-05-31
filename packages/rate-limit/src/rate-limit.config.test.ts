import { createTestTarget } from '@zeltjs/testing';
import { describe, expect, it } from 'vitest';

import { RateLimitConfig } from './rate-limit.config';

describe('RateLimitConfig', () => {
  it('default limit is 100', async () => {
    const { target } = await createTestTarget(RateLimitConfig);
    expect(target.defaultLimit).toBe(100);
  });

  it('default windowSec is 60', async () => {
    const { target } = await createTestTarget(RateLimitConfig);
    expect(target.defaultWindowSec).toBe(60);
  });

  it('default failureMode is open', async () => {
    const { target } = await createTestTarget(RateLimitConfig);
    expect(target.failureMode).toBe('open');
  });

  it('default kvStoreNamespace is "rate-limit:"', async () => {
    const { target } = await createTestTarget(RateLimitConfig);
    expect(target.kvStoreNamespace).toBe('rate-limit:');
  });

  it('default enabled is true', async () => {
    const { target } = await createTestTarget(RateLimitConfig);
    expect(target.enabled).toBe(true);
  });
});
