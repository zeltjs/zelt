import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import { runInContext } from '../../../../kernel/internal';
import { setHonoContext } from '..';
import { setBody } from './body.lib';
import { pathParam, setPathParams } from './path-param.lib';

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

describe('pathParam()', () => {
  it('returns the path param value', () => {
    const result = runInEntryContext(
      {
        pathParams: { id: '42' },
        honoContext: {} as unknown as Context,
      },
      () => pathParam('id'),
    );
    expect(result).toBe('42');
  });

  it('throws when the path param is absent', () => {
    expect(() =>
      runInEntryContext(
        {
          pathParams: {},
          honoContext: {} as unknown as Context,
        },
        () => pathParam('id'),
      ),
    ).toThrow(/path parameter "id" is not defined/);
  });
});
