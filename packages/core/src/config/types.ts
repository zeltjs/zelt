export type ConfigClass<T = unknown> = (new (...args: never[]) => T) & {
  readonly Token: new (...args: never[]) => T;
};
