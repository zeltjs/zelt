import { createContextStorage, ZeltContextNotAvailableError } from '../../../kernel';

export type CommandContextStore = {
  readonly commandName: string;
  readonly argv: readonly string[];
};

const storage = createContextStorage<CommandContextStore>('zelt:command');

export const runInCommandContext = <T>(ctx: CommandContextStore, fn: () => T): T =>
  storage.run(ctx, fn);

/** @throws {ZeltContextNotAvailableError} */
export const getCommandContext = (): CommandContextStore => {
  const ctx = storage.get();
  if (!ctx) {
    throw new ZeltContextNotAvailableError({ primitive: 'args', requiredContext: 'command' });
  }
  return ctx;
};
