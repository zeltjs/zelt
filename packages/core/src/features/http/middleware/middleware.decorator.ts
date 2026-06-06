import { createInjectableClassDecorator } from '../../../kernel';

export const Middleware = createInjectableClassDecorator(
  { decorator: 'Middleware' } as const,
  undefined,
  { unique: true },
);
