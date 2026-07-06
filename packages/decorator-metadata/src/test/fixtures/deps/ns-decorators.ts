import { createClassDecorator } from '../../../index';

/** @throws {E} */
export const Controller = (basePath: string) => createClassDecorator({ basePath });
