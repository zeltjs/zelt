import { config } from 'dotenv';

import { Config } from '../../config';

import { EnvConfig } from './env.config';

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
