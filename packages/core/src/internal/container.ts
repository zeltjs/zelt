import { Container } from '@needle-di/core';

type Class<T> = new (...args: never[]) => T;

export type ResolverHandle = {
  readonly get: <T extends object>(cls: Class<T>) => T;
};

// Controllers / Service / Adapter は `@Controller` または `@injectable()` decorator により
// needle-di が `container.get(cls)` 時に auto-bind する。明示的な bind は持たない (spec §4.10)。
export const createContainer = (): ResolverHandle => {
  const container = new Container();
  return {
    get: <T extends object>(cls: Class<T>): T => container.get<T>(cls),
  };
};
