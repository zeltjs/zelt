type Class<T> = new (...args: never[]) => T;

export type ResolverHandle = {
  readonly get: <T extends object>(cls: Class<T>) => T;
};
