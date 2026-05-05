import { describe, expect, it } from 'vitest';
import type { Context } from 'hono';

import { runInEntryContext, type EntryContext } from '../internal/entry-context';

import { setUser, currentUser, currentRoles } from './auth';

const createMockEntryContext = (): EntryContext => {
  const store: Record<string, unknown> = {};
  return {
    input: { body: {}, pathParams: {} },
    honoContext: {
      get: (key: string) => store[key],
      set: (key: string, value: unknown) => {
        store[key] = value;
      },
    } as unknown as Context,
  };
};

describe('setUser', () => {
  it('sets user and roles in context', () => {
    const ctx = createMockEntryContext();
    runInEntryContext(ctx, () => {
      setUser({ id: 1, name: 'alice' }, ['admin', 'user']);
      expect(currentUser()).toEqual({ id: 1, name: 'alice' });
      expect(currentRoles()).toEqual(['admin', 'user']);
    });
  });

  it('defaults roles to empty array', () => {
    const ctx = createMockEntryContext();
    runInEntryContext(ctx, () => {
      setUser({ id: 2, name: 'bob' });
      expect(currentUser()).toEqual({ id: 2, name: 'bob' });
      expect(currentRoles()).toEqual([]);
    });
  });
});

describe('currentUser', () => {
  it('returns undefined when user is not set', () => {
    const ctx = createMockEntryContext();
    const result = runInEntryContext(ctx, () => currentUser());
    expect(result).toBeUndefined();
  });
});

describe('currentRoles', () => {
  it('returns empty array when roles are not set', () => {
    const ctx = createMockEntryContext();
    const result = runInEntryContext(ctx, () => currentRoles());
    expect(result).toEqual([]);
  });
});
