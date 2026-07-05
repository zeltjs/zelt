import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import { runInContext } from '../../../kernel';
import { request, setBodySource, setPathParams } from './injection';
import { requestContext, setHonoContext } from './request-context.lib';

type TestEntryContext = {
  honoContext: Context;
  pathParams?: Readonly<Record<string, string>>;
};

const runInEntryContext = <T>(ctx: TestEntryContext, fn: () => T): T => {
  return runInContext(() => {
    setHonoContext(ctx.honoContext);
    setBodySource({
      contentType: ctx.honoContext.req.header('content-type') ?? '',
      request: ctx.honoContext.req.raw.clone(),
    });
    setPathParams(ctx.pathParams ?? {});
    return fn();
  });
};

const createJsonContext = (body: unknown): Context => {
  const raw = new Request('http://localhost/test', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  return {
    req: {
      raw,
      header: (name: string) => raw.headers.get(name) ?? undefined,
    },
  } as unknown as Context;
};

describe('entry-context', () => {
  it('returns the running context inside runInEntryContext', async () => {
    const honoContext = createJsonContext({ hello: 'world' });
    const pathParams = { id: '42' };

    await runInEntryContext({ honoContext, pathParams }, async () => {
      expect(requestContext()).toBe(honoContext);
      expect(await request().body()).toEqual({ hello: 'world' });
      expect(request().pathParam('id')).toBe('42');
    });
  });

  it('throws when called outside runInEntryContext', () => {
    expect(() => requestContext()).toThrow(/outside entry execution/);
  });

  it('isolates concurrent contexts', async () => {
    const [a, b] = await Promise.all([
      runInEntryContext({ honoContext: createJsonContext('A') }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return await request().body();
      }),
      runInEntryContext({ honoContext: createJsonContext('B') }, async () => request().body()),
    ]);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });
});
