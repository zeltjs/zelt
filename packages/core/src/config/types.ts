export type ConfigClass<T = unknown> = new (...args: never[]) => T;

type AnyConfigClass = ConfigClass<object>;

export const toConfigClass = (cls: unknown): AnyConfigClass => {
  // biome-ignore lint/suspicious/noExplicitAny: Type boundary - runtime validation ensures cls is a class
  const result: AnyConfigClass = cls as any;
  return result;
};
