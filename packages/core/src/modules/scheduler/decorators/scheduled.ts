import { createInjectableClassDecorator } from '../../../kernel/internal/decorator-helpers';

/** @throws {ZeltLifecycleStateError | ZeltDecoratorUsageError} */
export const Scheduled = () =>
  createInjectableClassDecorator({ decorator: 'Scheduled' } as const, undefined, { unique: true });
