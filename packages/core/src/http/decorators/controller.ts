import { defineInjectableClassDecorator } from '../../internal/decorator-helpers';
import { captureStackTraceForCore } from '../../internal/decorator-position';

/** @throws {ZeltLifecycleStateError | ZeltDecoratorUsageError} */
export const Controller = (basePath: string) =>
  defineInjectableClassDecorator(
    captureStackTraceForCore(),
    { decorator: 'Controller', basePath } as const,
    undefined,
    { unique: true },
  );
