import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import { pathParam } from './path-param.lib';
import { runInEntryContext } from './test.lib';

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
