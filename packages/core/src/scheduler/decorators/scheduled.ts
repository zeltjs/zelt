import { defineInjectableClassDecorator } from '../../internal/decorator-helpers';
import { captureStackTraceForCore } from '../../internal/decorator-position';

/** @throws {ZeltLifecycleStateError | ZeltDecoratorUsageError} */
export const Scheduled = () =>
  defineInjectableClassDecorator(
    captureStackTraceForCore(),
    { decorator: 'Scheduled' } as const,
    undefined,
    { unique: true },
  );
