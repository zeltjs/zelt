import { createInjectableClassDecorator } from '../../../kernel/internal/decorator-helpers';

export const Middleware = createInjectableClassDecorator(
  { decorator: 'Middleware' } as const,
  undefined,
  { unique: true },
);
