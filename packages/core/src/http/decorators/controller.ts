import { defineInjectableClassDecorator } from '../../internal/decorator-helpers';
import { getCallerPositionForCore } from '../../internal/decorator-position';

/** @throws {ZeltLifecycleStateError | ZeltDecoratorUsageError} */
export const Controller = (basePath: string) =>
  defineInjectableClassDecorator(
    getCallerPositionForCore(),
    { decorator: 'Controller', basePath } as const,
    undefined,
    { unique: true },
  );
