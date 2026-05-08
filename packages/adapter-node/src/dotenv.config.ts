import { config } from 'dotenv';

import { Config, EnvConfig } from '@zeltjs/core';

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
