import type { CoreErrorContextMap } from './definitions';
import { coreErrorDefinitions } from './definitions';

type ZeltErrorClass<K extends keyof CoreErrorContextMap> = {
  new (
    context: CoreErrorContextMap[K],
    cause?: unknown,
  ): Error & {
    readonly name: K;
    readonly context: CoreErrorContextMap[K];
  };
};

export const createErrorClass = <K extends keyof typeof coreErrorDefinitions>(
  name: K,
): ZeltErrorClass<K> => {
  const ErrorClass = class extends Error {
    override readonly name = name;
    constructor(
      public readonly context: CoreErrorContextMap[K],
      cause?: unknown,
    ) {
      super((coreErrorDefinitions[name] as (ctx: CoreErrorContextMap[K]) => string)(context), {
        cause,
      });
      Object.setPrototypeOf(this, new.target.prototype);
    }
  };
  return ErrorClass;
};
