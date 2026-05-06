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

  getInteger<D extends number | null | undefined>(key: string, defaultValue: D): number | D {
    this.ensureLoaded();
    const val = process.env[key];
    if (val === undefined) return defaultValue;
    const parsed = parseInt(val, 10);
    if (Number.isNaN(parsed)) return defaultValue;
    return parsed;
  }
}
