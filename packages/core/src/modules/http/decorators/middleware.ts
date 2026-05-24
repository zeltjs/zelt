import { defineInjectableClassDecorator } from '../../../kernel/internal/decorator-helpers';

export const Middleware = defineInjectableClassDecorator(
  undefined,
  { decorator: 'Middleware' } as const,
  undefined,
  { unique: true },
);
