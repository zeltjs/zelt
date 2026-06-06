import { createInjectableClassDecorator } from '../../../kernel';

/** @throws {E} */
export const Scheduled = () =>
  createInjectableClassDecorator({ decorator: 'Scheduled' } as const, undefined, { unique: true });
