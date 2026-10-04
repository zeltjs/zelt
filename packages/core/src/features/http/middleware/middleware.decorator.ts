import { createInjectableClassDecorator } from '../../../kernel';

export const Middleware = /* @__PURE__ */ createInjectableClassDecorator(
  { decorator: 'Middleware' } as const,
  undefined,
  { unique: true },
);
