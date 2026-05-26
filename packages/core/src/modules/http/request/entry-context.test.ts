import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import { runInContext } from '../../../kernel/internal/context-key';
import { body, setBody } from './injection/body';
import { pathParam, setPathParams } from './injection/path-param';
import { requestContext, setHonoContext } from './request-context';

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
  it('returns the running context inside runInEntryContext', () => {
    const honoContext = { marker: 'test' } as unknown as Context;
    const bodyVal = { type: 'json' as const, val: { hello: 'world' } };
    const pathParams = { id: '42' };

    runInEntryContext({ honoContext, body: bodyVal, pathParams }, () => {
      expect(requestContext()).toBe(honoContext);
      expect(body('json')).toEqual({ hello: 'world' });
      expect(pathParam('id')).toBe('42');
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
        return body('json');
      }),
      runInEntryContext({ honoContext, body: { type: 'json', val: 'B' } }, async () =>
        body('json'),
      ),
    ]);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });
});
