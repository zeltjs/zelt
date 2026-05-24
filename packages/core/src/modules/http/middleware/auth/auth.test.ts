import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import { runInHttpContext } from '../../internal/test-helpers';

import { currentRoles, currentUser, setUser } from './auth';

const createMockHonoContext = () =>
  ({
    req: { header: () => undefined },
  }) as unknown as Context;

describe('setUser', () => {
  it('sets user and roles in context', () => {
    runInHttpContext({ honoContext: createMockHonoContext() }, () => {
      setUser({ id: 1, name: 'alice' }, ['admin', 'user']);
      expect(currentUser()).toEqual({ id: 1, name: 'alice' });
      expect(currentRoles()).toEqual(['admin', 'user']);
    });
  });

  it('defaults roles to empty array', () => {
    runInHttpContext({ honoContext: createMockHonoContext() }, () => {
      setUser({ id: 2, name: 'bob' });
      expect(currentUser()).toEqual({ id: 2, name: 'bob' });
      expect(currentRoles()).toEqual([]);
    });
  });
});

describe('currentUser', () => {
  it('returns undefined when user is not set', () => {
    const result = runInHttpContext({ honoContext: createMockHonoContext() }, () => currentUser());
    expect(result).toBeUndefined();
  });
});

describe('currentRoles', () => {
  it('returns empty array when roles are not set', () => {
    const result = runInHttpContext({ honoContext: createMockHonoContext() }, () => currentRoles());
    expect(result).toEqual([]);
  });
});
