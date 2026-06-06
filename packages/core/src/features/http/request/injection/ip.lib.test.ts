import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import { runInContext } from '../../../../kernel';
import { setHonoContext } from '../index';
import { setBody } from './body.lib';
import { ip } from './ip.lib';
import { setPathParams } from './path-param.lib';

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

const makeContext = (headers: Record<string, string>) => ({
  req: {
    header: (name: string): string | undefined => headers[name],
  },
});

describe('ip primitive', () => {
  it('reads cf-connecting-ip first', () => {
    const honoContext = makeContext({
      'cf-connecting-ip': '1.1.1.1',
      'x-forwarded-for': '2.2.2.2',
    });
    runInEntryContext(
      // @ts-expect-error narrow typed test fixture
      { honoContext },
      () => {
        expect(ip()).toBe('1.1.1.1');
      },
    );
  });

  it('falls back to x-real-ip when cf header missing', () => {
    const honoContext = makeContext({
      'x-real-ip': '3.3.3.3',
      'x-forwarded-for': '2.2.2.2',
    });
    runInEntryContext(
      // @ts-expect-error narrow typed test fixture
      { honoContext },
      () => {
        expect(ip()).toBe('3.3.3.3');
      },
    );
  });

  it('falls back to first x-forwarded-for entry', () => {
    const honoContext = makeContext({
      'x-forwarded-for': '4.4.4.4, 5.5.5.5',
    });
    runInEntryContext(
      // @ts-expect-error narrow typed test fixture
      { honoContext },
      () => {
        expect(ip()).toBe('4.4.4.4');
      },
    );
  });

  it('returns undefined when no headers available', () => {
    const honoContext = makeContext({});
    runInEntryContext(
      // @ts-expect-error narrow typed test fixture
      { honoContext },
      () => {
        expect(ip()).toBeUndefined();
      },
    );
  });
});
