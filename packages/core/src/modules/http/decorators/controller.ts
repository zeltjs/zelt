import { defineInjectableClassDecorator } from '../../../kernel/internal/decorator-helpers';
import { captureStackTraceForCore } from '../../../kernel/internal/decorator-position';

/** @throws {ZeltLifecycleStateError | ZeltDecoratorUsageError} */
export const Controller = (basePath: string) =>
  defineInjectableClassDecorator(
    captureStackTraceForCore(),
    { decorator: 'Controller', basePath } as const,
    undefined,
    { unique: true },
  );
