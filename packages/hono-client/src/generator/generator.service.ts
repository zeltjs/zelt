import { Injectable } from '@zeltjs/core';

import { emitAppType } from './emit.lib';
import type { GenerateOptions, HttpAppLike, HttpMetadata } from './types';

@Injectable()
export class GeneratorService {
  generate(metadata: HttpMetadata, options: GenerateOptions): string {
    return emitAppType(metadata, options.distDir);
  }

  generateFromApp(app: HttpAppLike, options: GenerateOptions): string {
    return emitAppType(app.getMetadata(), options.distDir);
  }
}
