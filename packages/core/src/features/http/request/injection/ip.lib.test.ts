import { describe, expect, it } from 'vitest';

import { resolveClientIp } from './resolve-client-ip.lib';

const makeContext = (headers: Record<string, string>) => ({
  req: {
    header: (name: string): string | undefined => headers[name],
  },
});

describe('resolveClientIp', () => {
  it('reads cf-connecting-ip first', () => {
    const honoContext = makeContext({
      'cf-connecting-ip': '1.1.1.1',
      'x-forwarded-for': '2.2.2.2',
    });
    // @ts-expect-error narrow typed test fixture
    expect(resolveClientIp(honoContext)).toBe('1.1.1.1');
  });

  it('falls back to x-real-ip when cf header missing', () => {
    const honoContext = makeContext({
      'x-real-ip': '3.3.3.3',
      'x-forwarded-for': '2.2.2.2',
    });
    // @ts-expect-error narrow typed test fixture
    expect(resolveClientIp(honoContext)).toBe('3.3.3.3');
  });

  it('falls back to first x-forwarded-for entry', () => {
    const honoContext = makeContext({
      'x-forwarded-for': '4.4.4.4, 5.5.5.5',
    });
    // @ts-expect-error narrow typed test fixture
    expect(resolveClientIp(honoContext)).toBe('4.4.4.4');
  });

  it('returns undefined when no headers available', () => {
    const honoContext = makeContext({});
    // @ts-expect-error narrow typed test fixture
    expect(resolveClientIp(honoContext)).toBeUndefined();
  });
});
