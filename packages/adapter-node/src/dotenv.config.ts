import { Config, EnvConfig } from '@zeltjs/core';
import { config } from 'dotenv';

/**
 * @deprecated Use `import 'dotenv/config'` at your entry point instead.
 * Will be removed in next major version.
 *
 * @example
 * ```typescript
 * // main.ts
 * import 'dotenv/config';
 * import { createApp } from '@zeltjs/core';
 * ```
 */
@Config
export class DotEnvConfig extends EnvConfig {
  protected readonly paths: string[] = ['.env'];

  constructor() {
    super();
    for (const path of this.paths) {
      config({ path, override: true });
    }
  }
}
