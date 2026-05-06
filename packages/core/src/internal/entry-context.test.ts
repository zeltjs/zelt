import { describe, expect, it } from 'vitest';
import type { Context } from 'hono';

import { getEntryContext, runInEntryContext, type EntryContext } from './entry-context';

describe('entry-context', () => {
  it('returns the running context inside runInEntryContext', () => {
    const ctx: EntryContext = {
      input: { jsonBody: { hello: 'world' }, formBody: undefined, pathParams: {} },
      honoContext: {} as unknown as Context,
    };
    const got = runInEntryContext(ctx, () => getEntryContext());
    expect(got).toBe(ctx);
  });

  it('throws when called outside runInEntryContext', () => {
    expect(() => getEntryContext()).toThrow(/outside entry execution/);
  });

  it('isolates concurrent contexts', async () => {
    const ctxA: EntryContext = {
      input: { jsonBody: 'A', formBody: undefined, pathParams: {} },
      honoContext: {} as unknown as Context,
    };
    const ctxB: EntryContext = {
      input: { jsonBody: 'B', formBody: undefined, pathParams: {} },
      honoContext: {} as unknown as Context,
    };
    const [a, b] = await Promise.all([
      runInEntryContext(ctxA, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getEntryContext().input.jsonBody;
      }),
      runInEntryContext(ctxB, async () => getEntryContext().input.jsonBody),
    ]);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });
});
