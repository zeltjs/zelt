import { Container } from '@needle-di/core';

type Class<T> = new (...args: never[]) => T;

type CreateContainerOptions = {
  readonly configs?: readonly Class<unknown>[] | undefined;
};

export type ResolverHandle = {
  readonly get: <T extends object>(cls: Class<T>) => T;
};

const findTokenOwner = (cls: Function): Function | null => {
  let current: Function | null = cls;
  while (current && current !== Function.prototype) {
    if ('Token' in current) {
      return (current as { Token: Function }).Token;
    }
    current = Object.getPrototypeOf(current) as Function | null;
  }
  return null;
};

// Controllers / Service / Adapter は `@Controller` または `@injectable()` decorator により
// needle-di が `container.get(cls)` 時に auto-bind する。明示的な bind は持たない (spec §4.10)。
export const createContainer = (options: CreateContainerOptions = {}): ResolverHandle => {
  const container = new Container();

  for (const configClass of options.configs ?? []) {
    const token = findTokenOwner(configClass);
    if (token && token !== configClass) {
      container.bind(configClass);
      container.bind({ provide: token, useExisting: configClass });
    }
  }

  return {
    get: <T extends object>(cls: Class<T>): T => container.get<T>(cls),
  };
};
