import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import { runInHttpContext } from '../internal/test-helpers';
import { body } from './injection/body';
import { pathParam } from './injection/path-param';
import { requestContext } from './request-context';

describe('http-context', () => {
  it('returns the running context inside runInHttpContext', () => {
    const honoContext = { marker: 'test' } as unknown as Context;
    const bodyVal = { type: 'json' as const, val: { hello: 'world' } };
    const pathParams = { id: '42' };

    runInHttpContext({ honoContext, body: bodyVal, pathParams }, () => {
      expect(requestContext()).toBe(honoContext);
      expect(body('json')).toEqual({ hello: 'world' });
      expect(pathParam('id')).toBe('42');
    });
  });

  it('throws when called outside runInHttpContext', () => {
    expect(() => requestContext()).toThrow(/outside request execution/);
  });

  it('isolates concurrent contexts', async () => {
    const honoContext = {} as unknown as Context;
    const [a, b] = await Promise.all([
      runInHttpContext({ honoContext, body: { type: 'json', val: 'A' } }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return body('json');
      }),
      runInHttpContext({ honoContext, body: { type: 'json', val: 'B' } }, async () => body('json')),
    ]);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });
});
