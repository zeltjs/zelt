import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import { runInContext } from '../../../../kernel/internal/context-key';
import { setBody } from '../../request/injection/body';
import { setPathParams } from '../../request/injection/path-param';
import { setHonoContext } from '../../request/request-context';

import { currentRoles, currentUser, setUser } from './auth';

type FormBody = Record<string, string | File | (string | File)[]>;

type ParsedBody =
  | { type: 'json'; val: unknown }
  | { type: 'form'; val: FormBody }
  | { type: 'text'; val: string }
  | { type: 'none'; val: undefined };

type TestEntryContext = {
  honoContext: Context;
  body?: ParsedBody;
  pathParams?: Readonly<Record<string, string>>;
};

const runInEntryContext = <T>(ctx: TestEntryContext, fn: () => T): T => {
  return runInContext(() => {
    setHonoContext(ctx.honoContext);
    setBody(ctx.body ?? { type: 'none', val: undefined });
    setPathParams(ctx.pathParams ?? {});
    return fn();
  });
};

const createMockEntryContext = () => {
  const honoContext = {
    req: { header: () => undefined },
  } as unknown as Context;
  return { honoContext };
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
