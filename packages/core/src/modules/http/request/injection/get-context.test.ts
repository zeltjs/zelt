import type { Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { runInContext } from '../../../../kernel/internal/context-key';
import { setHonoContext } from '../request-context';
import { setBody } from './body';
import { getContext, setContext } from './get-context';
import { setPathParams } from './path-param';

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
