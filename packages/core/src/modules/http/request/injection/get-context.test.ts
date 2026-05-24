import type { Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { runInEntryContext } from '../../internal/test-helpers';

import { getContext, setContext } from './get-context';

declare module '@zeltjs/core' {
  interface RequestContextSchema {
    nonexistent: unknown;
  }
}

const createMockEntryContext = (contextValues: Record<string, unknown> = {}) => ({
  honoContext: {
    get: (key: string) => contextValues[key],
    set: vi.fn(),
    req: { header: () => undefined },
  } as unknown as Context,
});

describe('getContext', () => {
  it('returns value set in Hono context', () => {
    const ctx = createMockEntryContext({ user: { id: 1, name: 'alice' } });
    const result = runInEntryContext(ctx, () => getContext('user'));
    expect(result).toEqual({ id: 1, name: 'alice' });
  });

  it('returns undefined when key is not defined', () => {
    const ctx = createMockEntryContext({});
    const result = runInEntryContext(ctx, () => getContext('nonexistent'));
    expect(result).toBeUndefined();
  });

  it('throws when called outside entry context', () => {
    expect(() => getContext('nonexistent')).toThrow(/outside entry execution/);
  });
});

describe('setContext', () => {
  it('calls Hono context.set with key and value', () => {
    const ctx = createMockEntryContext({});
    runInEntryContext(ctx, () => setContext('user', { id: 1, name: 'alice' }));
    expect(ctx.honoContext.set).toHaveBeenCalledWith('user', { id: 1, name: 'alice' });
  });

  it('throws when called outside entry context', () => {
    expect(() => setContext('user', { id: 1, name: 'test' })).toThrow(/outside entry execution/);
  });
});
