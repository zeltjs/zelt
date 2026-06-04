import { describe, expect, it } from 'vitest';

import { runInContext } from '../../../../kernel/internal';

import { currentRoles, currentUser, setUser } from './auth.lib';

describe('setUser', () => {
  it('sets user and roles in context', () => {
    runInContext(() => {
      setUser({ id: 1, name: 'alice' }, ['admin', 'user']);
      expect(currentUser()).toEqual({ id: 1, name: 'alice' });
      expect(currentRoles()).toEqual(['admin', 'user']);
    });
  });

  it('defaults roles to empty array', () => {
    runInContext(() => {
      setUser({ id: 2, name: 'bob' });
      expect(currentUser()).toEqual({ id: 2, name: 'bob' });
      expect(currentRoles()).toEqual([]);
    });
  });
});

describe('currentUser', () => {
  it('returns undefined when user is not set', () => {
    const result = runInContext(() => currentUser());
    expect(result).toBeUndefined();
  });
});

describe('currentRoles', () => {
  it('returns empty array when roles are not set', () => {
    const result = runInContext(() => currentRoles());
    expect(result).toEqual([]);
  });
});
