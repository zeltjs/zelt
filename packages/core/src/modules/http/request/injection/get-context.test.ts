import type { Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { runInHttpContext } from '../../internal/test-helpers';

import { getContext, setContext } from './get-context';

declare module '@zeltjs/core' {
  interface RequestContextSchema {
    nonexistent: unknown;
  }
}

const createMockHonoContext = (contextValues: Record<string, unknown> = {}) =>
  ({
    get: (key: string) => contextValues[key],
    set: vi.fn(),
    req: { header: () => undefined },
  }) as unknown as Context;

describe('getContext', () => {
  it('returns value set in Hono context', () => {
    const honoContext = createMockHonoContext({ user: { id: 1, name: 'alice' } });
    const result = runInHttpContext({ honoContext }, () => getContext('user'));
    expect(result).toEqual({ id: 1, name: 'alice' });
  });

  it('returns undefined when key is not defined', () => {
    const honoContext = createMockHonoContext({});
    const result = runInHttpContext({ honoContext }, () => getContext('nonexistent'));
    expect(result).toBeUndefined();
  });

  it('throws when called outside http context', () => {
    expect(() => getContext('nonexistent')).toThrow(/outside request execution/);
  });
});

describe('setContext', () => {
  it('calls Hono context.set with key and value', () => {
    const honoContext = createMockHonoContext({});
    runInHttpContext({ honoContext }, () => setContext('user', { id: 1, name: 'alice' }));
    expect(honoContext.set).toHaveBeenCalledWith('user', { id: 1, name: 'alice' });
  });

  it('throws when called outside http context', () => {
    expect(() => setContext('user', { id: 1, name: 'test' })).toThrow(/outside request execution/);
  });
});
