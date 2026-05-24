import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import type { EntryContext } from './entry-context';
import { getEntryContext, runInEntryContext } from './entry-context';

describe('entry-context', () => {
  it('returns the running context inside runInEntryContext', () => {
    const ctx: EntryContext = {
      input: { body: { type: 'json', val: { hello: 'world' } }, pathParams: {} },
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
      input: { body: { type: 'json', val: 'A' }, pathParams: {} },
      honoContext: {} as unknown as Context,
    };
    const ctxB: EntryContext = {
      input: { body: { type: 'json', val: 'B' }, pathParams: {} },
      honoContext: {} as unknown as Context,
    };
    const [a, b] = await Promise.all([
      runInEntryContext(ctxA, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getEntryContext().input.body.val;
      }),
      runInEntryContext(ctxB, async () => getEntryContext().input.body.val),
    ]);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });
});
