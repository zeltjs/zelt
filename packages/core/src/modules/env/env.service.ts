import { Injectable } from '../../decorators/injectable';
import { injectConfig } from '../../config';

import { EnvConfig } from './env.config';
import { loadEnvFiles } from './env.loader';

@Injectable()
export class EnvService {
  private loaded = false;

  constructor(private config = injectConfig(EnvConfig)) {}

  private ensureLoaded(): void {
    if (!this.loaded) {
      loadEnvFiles(this.config.envFilePath);
      this.loaded = true;
    }
  }

  getString<D extends string | null | undefined>(key: string, defaultValue: D): string | D {
    this.ensureLoaded();
    return process.env[key] ?? defaultValue;
  }
}
