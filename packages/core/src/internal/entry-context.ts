import { AsyncLocalStorage } from 'node:async_hooks';

import type { Context } from 'hono';

type EntryInput = {
  readonly body: unknown;
  readonly pathParams: Readonly<Record<string, string>>;
};

export type EntryContext = {
  readonly input: EntryInput;
  readonly honoContext: Context;
};

const storage = new AsyncLocalStorage<EntryContext>();

export const runInEntryContext = <T>(ctx: EntryContext, fn: () => T): T => storage.run(ctx, fn);

export const getEntryContext = (): EntryContext => {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('koya: primitive called outside entry execution');
  return ctx;
};
