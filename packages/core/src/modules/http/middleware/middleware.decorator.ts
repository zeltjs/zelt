import { createInjectableClassDecorator } from '../../../kernel/internal';

export const Middleware = createInjectableClassDecorator(
  { decorator: 'Middleware' } as const,
  undefined,
  { unique: true },
);
