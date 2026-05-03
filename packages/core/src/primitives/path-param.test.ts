import { describe, expect, it } from 'vitest';
import type { Context } from 'hono';

import { runInEntryContext } from '../internal/entry-context';

import { pathParam } from './path-param';

describe('pathParam()', () => {
  it('returns the path param value', () => {
    const result = runInEntryContext(
      {
        input: { body: undefined, pathParams: { id: '42' } },
        honoContext: {} as unknown as Context,
      },
      () => pathParam('id'),
    );
    expect(result).toBe('42');
  });

  it('throws when the path param is absent', () => {
    expect(() =>
      runInEntryContext(
        { input: { body: undefined, pathParams: {} }, honoContext: {} as unknown as Context },
        () => pathParam('id'),
      ),
    ).toThrow(/path parameter "id" is not defined/);
  });
});
