import { runInContext, setUser, ZeltContextNotAvailableError } from '@zeltjs/core';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';

import { requireUser } from './current-user.lib';

describe('requireUser', () => {
  it('returns the authenticated user', () => {
    const user = runInContext(() => {
      setUser({ id: 1, email: 'alice@example.com' }, ['user']);
      return requireUser();
    });

    expect(user).toEqual({ id: 1, email: 'alice@example.com' });
  });

  it('returns the user regardless of roles', () => {
    const user = runInContext(() => {
      setUser({ id: 2, email: 'bob@example.com' });
      return requireUser();
    });

    expect(user.id).toBe(2);
  });

  it('throws 401 when no user is authenticated', () => {
    const run = () => runInContext(() => requireUser());

    expect(run).toThrow(HTTPException);
    expect(run).toThrow('Not authenticated');
  });

  it('throws an HTTPException carrying status 401', () => {
    expect(() => runInContext(() => requireUser())).toThrow(
      expect.objectContaining({ status: 401 }),
    );
  });

  it('sees the user set by the enclosing context', () => {
    const user = runInContext(() => {
      setUser({ id: 3, email: 'carol@example.com' });
      return runInContext(() => requireUser());
    });

    expect(user.id).toBe(3);
  });

  it('returns the stored object without validating its shape (現状の振る舞い)', () => {
    const user = runInContext(() => {
      setUser({ sub: 'x' });
      return requireUser();
    });

    expect(user).toEqual({ sub: 'x' });
  });

  it('throws when called outside of a request context', () => {
    expect(() => requireUser()).toThrow(ZeltContextNotAvailableError);
  });
});
