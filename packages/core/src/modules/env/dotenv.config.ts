import { config } from 'dotenv';

import { Config } from '../../config';

import { EnvProvider } from './env.provider';

@Config
export class DotEnvConfig extends EnvProvider {
  constructor(paths: string[] = ['.env']) {
    super();
    for (const path of paths) {
      config({ path, override: true });
    }
  }

  override get(key: string): string | undefined {
    return process.env[key];
  }
}

export const createDotEnvConfig = (paths: string[] = ['.env']) => {
  @Config
  class CustomDotEnvConfig extends EnvProvider {
    constructor() {
      super();
      for (const path of paths) {
        config({ path, override: true });
      }
    }

    override get(key: string): string | undefined {
      return process.env[key];
    }
  }
  return CustomDotEnvConfig;
};
