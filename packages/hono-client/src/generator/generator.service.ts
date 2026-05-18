import { Injectable } from '@zeltjs/core';

import { emitAppType } from './emit.lib';
import type { GenerateOptions, HttpAppLike, HttpMetadata } from './types';

@Injectable()
export class GeneratorService {
  /** @throws {ZeltDecoratorUsageError} */
  generate(metadata: HttpMetadata, options: GenerateOptions): string {
    return emitAppType(metadata, options.distDir);
  }

  /** @throws {ZeltDecoratorUsageError} */
  generateFromApp(app: HttpAppLike, options: GenerateOptions): string {
    return emitAppType(app.getMetadata(), options.distDir);
  }
}
