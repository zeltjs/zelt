import { createInjectableClassDecorator } from '../../../kernel/internal';

/** @throws {E} */
export const Scheduled = () =>
  createInjectableClassDecorator({ decorator: 'Scheduled' } as const, undefined, { unique: true });
