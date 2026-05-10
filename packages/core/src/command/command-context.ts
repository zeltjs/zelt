import { AsyncLocalStorage } from 'node:async_hooks';

export type CommandContextStore = {
  readonly parsedArgs: Record<string, unknown>;
};

const storage = new AsyncLocalStorage<CommandContextStore>();

export const runInCommandContext = <T>(ctx: CommandContextStore, fn: () => T): T =>
  storage.run(ctx, fn);

export const getCommandContext = (): CommandContextStore => {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error('zelt/command: args() called outside command execution');
  }
  return ctx;
};
