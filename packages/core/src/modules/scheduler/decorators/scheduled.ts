import { defineInjectableClassDecorator } from '../../../kernel/internal/decorator-helpers';
import { captureStackTraceForCore } from '../../../kernel/internal/decorator-position';

/** @throws {ZeltLifecycleStateError | ZeltDecoratorUsageError} */
export const Scheduled = () =>
  defineInjectableClassDecorator(
    captureStackTraceForCore(),
    { decorator: 'Scheduled' } as const,
    undefined,
    { unique: true },
  );
