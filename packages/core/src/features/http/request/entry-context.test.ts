import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import { runInContext } from '../../../kernel';
import { request, setBody, setPathParams } from './injection';
import { requestContext, setHonoContext } from './request-context.lib';

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

describe('entry-context', () => {
  it('returns the running context inside runInEntryContext', async () => {
    const honoContext = { marker: 'test' } as unknown as Context;
    const bodyVal = { type: 'json' as const, val: { hello: 'world' } };
    const pathParams = { id: '42' };

    await runInEntryContext({ honoContext, body: bodyVal, pathParams }, async () => {
      expect(requestContext()).toBe(honoContext);
      expect(await request().body()).toEqual({ hello: 'world' });
      expect(request().pathParam('id')).toBe('42');
    });
  });

  it('throws when called outside runInEntryContext', () => {
    expect(() => requestContext()).toThrow(/outside entry execution/);
  });

  it('isolates concurrent contexts', async () => {
    const honoContext = {} as unknown as Context;
    const [a, b] = await Promise.all([
      runInEntryContext({ honoContext, body: { type: 'json', val: 'A' } }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return await request().body();
      }),
      runInEntryContext({ honoContext, body: { type: 'json', val: 'B' } }, async () =>
        request().body(),
      ),
    ]);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });
});
