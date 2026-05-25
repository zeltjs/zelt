import { createInjectableClassDecorator } from '../../../kernel/internal/decorator-helpers';

/** @throws {E} */
export const Scheduled = () =>
  createInjectableClassDecorator({ decorator: 'Scheduled' } as const, undefined, { unique: true });
