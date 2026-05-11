import { AsyncLocalStorage } from 'node:async_hooks';

import type { Context } from 'hono';

type FormBody = Record<string, string | File | (string | File)[]>;

type EntryInput = {
  readonly jsonBody: unknown;
  readonly formBody: FormBody | undefined;
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
  if (!ctx) throw new Error('zelt: primitive called outside entry execution');
  return ctx;
};
