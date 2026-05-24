import { Injectable } from '@zeltjs/core';

import { emitAppType } from './emit.lib';
import type { ControllerClass, GenerateOptions, HttpMetadata } from './types';

type HttpAppLike = {
  getMetadata: () => HttpMetadata;
  getControllers: () => readonly ControllerClass[];
};

@Injectable()
export class GeneratorService {
  /** @throws {ZeltDecoratorUsageError} */
  generateFromApp(app: HttpAppLike, options: GenerateOptions): string {
    return emitAppType({
      metadata: app.getMetadata(),
      controllers: app.getControllers(),
      distDir: options.distDir,
    });
  }
}
