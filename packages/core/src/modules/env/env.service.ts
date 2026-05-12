import { inject } from '../../di/inject';
import { Injectable } from '../../di/injectable';

import { EnvConfig } from './env.config';

@Injectable()
export class EnvService {
  constructor(private config = inject(EnvConfig)) {}

  getString<D extends string | null | undefined>(key: string, defaultValue: D): string | D {
    return this.config.get(key) ?? defaultValue;
  }

  getInteger<D extends number | null | undefined>(key: string, defaultValue: D): number | D {
    const val = this.config.get(key);
    if (val === undefined) return defaultValue;
    const parsed = parseInt(val, 10);
    if (Number.isNaN(parsed)) return defaultValue;
    return parsed;
  }

  getBoolean<D extends boolean | null | undefined>(key: string, defaultValue: D): boolean | D {
    const val = this.config.get(key);
    if (val === undefined) return defaultValue;
    return val === 'true' || val === '1';
  }

  isDevelopment(): boolean {
    return this.getString('NODE_ENV', 'production') === 'development';
  }

  isProduction(): boolean {
    return this.getString('NODE_ENV', 'production') === 'production';
  }
}
