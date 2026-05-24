import { describe, expect, it } from 'vitest';

import { getLogContext, withLogContext } from './logger.context.lib';

describe('logger.context', () => {
  it('inner context overrides outer for same key', () => {
    const result = withLogContext({ key: 'outer' }, () => {
      return withLogContext({ key: 'inner' }, () => {
        return getLogContext();
      });
    });

    expect(result).toEqual({ key: 'inner' });
  });

  it('returns empty object outside withLogContext', () => {
    const result = getLogContext();
    expect(result).toEqual({});
  });
});
