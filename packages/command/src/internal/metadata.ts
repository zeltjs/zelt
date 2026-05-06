export type CommandMetadata = {
  readonly name: string;
  readonly description?: string;
};

const commandStore = new WeakMap<object, CommandMetadata>();

export const setCommandMetadata = (cls: object, meta: CommandMetadata): void => {
  commandStore.set(cls, meta);
};

export const getCommandMetadata = (cls: object): CommandMetadata | undefined =>
  commandStore.get(cls);
