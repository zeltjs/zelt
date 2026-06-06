import { AsyncLocalStorage } from 'node:async_hooks';

import { ZeltContextNotAvailableError } from '../../../kernel';

export type CommandContextStore = {
  readonly parsedArgs: Record<string, unknown>;
};

const storage = new AsyncLocalStorage<CommandContextStore>();

export const runInCommandContext = <T>(ctx: CommandContextStore, fn: () => T): T =>
  storage.run(ctx, fn);

/** @throws {ZeltContextNotAvailableError} */
export const getCommandContext = (): CommandContextStore => {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new ZeltContextNotAvailableError({ primitive: 'args', requiredContext: 'command' });
  }
  return ctx;
};
