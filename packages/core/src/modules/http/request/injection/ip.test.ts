import { describe, expect, it } from 'vitest';

import { runInHttpContext } from '../../internal/test-helpers';

import { ip } from './ip';

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
    runInHttpContext(
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
    runInHttpContext(
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
    runInHttpContext(
      // @ts-expect-error narrow typed test fixture
      { honoContext },
      () => {
        expect(ip()).toBe('4.4.4.4');
      },
    );
  });

  it('returns "unknown" when no headers available', () => {
    const honoContext = makeContext({});
    runInHttpContext(
      // @ts-expect-error narrow typed test fixture
      { honoContext },
      () => {
        expect(ip()).toBe('unknown');
      },
    );
  });
});
