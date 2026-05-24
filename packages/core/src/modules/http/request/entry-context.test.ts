import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import { getHttpContext } from '../internal/context-keys';
import { runInHttpContext } from '../internal/test-helpers';

describe('http-context', () => {
  it('returns the running context inside runInHttpContext', () => {
    const honoContext = {} as unknown as Context;
    const body = { type: 'json' as const, val: { hello: 'world' } };
    const pathParams = { id: '42' };

    const got = runInHttpContext({ honoContext, body, pathParams }, () => getHttpContext());

    expect(got.honoContext).toBe(honoContext);
    expect(got.body).toEqual(body);
    expect(got.pathParams).toEqual(pathParams);
  });

  it('throws when called outside runInHttpContext', () => {
    expect(() => getHttpContext()).toThrow(/outside request execution/);
  });

  it('isolates concurrent contexts', async () => {
    const honoContext = {} as unknown as Context;
    const [a, b] = await Promise.all([
      runInHttpContext({ honoContext, body: { type: 'json', val: 'A' } }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getHttpContext().body.val;
      }),
      runInHttpContext(
        { honoContext, body: { type: 'json', val: 'B' } },
        async () => getHttpContext().body.val,
      ),
    ]);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });
});
