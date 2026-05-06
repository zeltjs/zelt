import { inject } from '@needle-di/core';

import { Injectable } from '../../decorators/injectable';

import { EnvProvider } from './env.provider';

@Injectable()
export class EnvService {
  constructor(private provider = inject(EnvProvider)) {}

  getString<D extends string | null | undefined>(key: string, defaultValue: D): string | D {
    return this.provider.get(key) ?? defaultValue;
  }

  getInteger<D extends number | null | undefined>(key: string, defaultValue: D): number | D {
    const val = this.provider.get(key);
    if (val === undefined) return defaultValue;
    const parsed = parseInt(val, 10);
    if (Number.isNaN(parsed)) return defaultValue;
    return parsed;
  }

  getBoolean<D extends boolean | null | undefined>(key: string, defaultValue: D): boolean | D {
    const val = this.provider.get(key);
    if (val === undefined) return defaultValue;
    return val === 'true' || val === '1';
  }
}
