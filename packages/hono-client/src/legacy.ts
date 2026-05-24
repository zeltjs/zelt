import type { GenerateOptions, HttpAppLike } from './generator';
import { emitAppType } from './generator';

/**
 * @deprecated Use GeneratorService instead
 * @throws {ZeltDecoratorUsageError}
 */
export const generateHonoAppTypeFromApp = (app: HttpAppLike, options: GenerateOptions): string =>
  emitAppType({
    metadata: app.getMetadata(),
    controllers: app.getControllers(),
    distDir: options.distDir,
  });
