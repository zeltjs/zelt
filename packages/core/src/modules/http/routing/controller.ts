import { createInjectableClassDecorator } from '../../../kernel/internal/decorator-helpers';

/** @throws {E} */
export const Controller = (basePath: string) =>
  createInjectableClassDecorator({ decorator: 'Controller', basePath } as const, undefined, {
    unique: true,
  });
