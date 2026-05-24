import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import { runInHttpContext } from '../../internal/test-helpers';

import { pathParam } from './path-param';

describe('pathParam()', () => {
  it('returns the path param value', () => {
    const result = runInHttpContext(
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
      runInHttpContext(
        {
          pathParams: {},
          honoContext: {} as unknown as Context,
        },
        () => pathParam('id'),
      ),
    ).toThrow(/path parameter "id" is not defined/);
  });
});
