import { describe, expect, it } from 'vitest';

import { getEntryContext, runInEntryContext, type EntryContext } from './entry-context';

describe('entry-context', () => {
  it('returns the running context inside runInEntryContext', () => {
    const ctx: EntryContext = {
      input: { body: { hello: 'world' }, pathParams: {} },
      container: {} as never,
    };
    const got = runInEntryContext(ctx, () => getEntryContext());
    expect(got).toBe(ctx);
  });

  it('throws when called outside runInEntryContext', () => {
    expect(() => getEntryContext()).toThrow(/outside entry execution/);
  });

  it('isolates concurrent contexts', async () => {
    const ctxA: EntryContext = { input: { body: 'A', pathParams: {} }, container: {} as never };
    const ctxB: EntryContext = { input: { body: 'B', pathParams: {} }, container: {} as never };
    const [a, b] = await Promise.all([
      runInEntryContext(ctxA, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getEntryContext().input.body;
      }),
      runInEntryContext(ctxB, async () => getEntryContext().input.body),
    ]);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });
});
