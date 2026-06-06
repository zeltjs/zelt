import { createInjectableClassDecorator } from '../../../kernel';

/** @throws {E} */
export const Controller = (basePath: string) =>
  createInjectableClassDecorator({ decorator: 'Controller', basePath } as const, undefined, {
    unique: true,
  });
