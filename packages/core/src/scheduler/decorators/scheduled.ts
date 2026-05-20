import { defineInjectableClassDecorator } from '../../internal/decorator-helpers';
import { getCallerPositionForCore } from '../../internal/decorator-position';

/** @throws {ZeltLifecycleStateError | ZeltDecoratorUsageError} */
export const Scheduled = () =>
  defineInjectableClassDecorator(
    getCallerPositionForCore(),
    { decorator: 'Scheduled' } as const,
    undefined,
    { unique: true },
  );
