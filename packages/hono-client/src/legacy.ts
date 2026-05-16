import type { GenerateOptions, HttpAppLike } from './generator';
import { emitAppType } from './generator';

/**
 * @deprecated Use GeneratorService instead
 */
export const generateHonoAppType = emitAppType;

/**
 * @deprecated Use GeneratorService instead
 */
export const generateHonoAppTypeFromApp = (app: HttpAppLike, options: GenerateOptions): string =>
  emitAppType(app.getMetadata(), options.distDir);
