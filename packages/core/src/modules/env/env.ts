import { inject } from '../../di/inject';
import { Injectable } from '../../di/injectable';
import { ZeltEnvError } from '../../errors';

import { EnvSource } from './env-source';

@Injectable()
export class Env {
  constructor(private source = inject(EnvSource)) {}

  getString(key: string, defaultValue: string = ''): string {
    return this.source.get(key) ?? defaultValue;
  }

  getNumber(key: string, defaultValue: number = 0): number {
    const val = this.source.get(key);
    if (val === undefined) return defaultValue;
    const parsed = Number(val);
    if (Number.isNaN(parsed)) return defaultValue;
    return parsed;
  }

  getBoolean(key: string, defaultValue: boolean = false): boolean {
    const val = this.source.get(key);
    if (val === undefined) return defaultValue;
    return val === 'true' || val === '1';
  }

  /** @throws {ZeltEnvError} */
  getRequired(key: string): string {
    const val = this.source.get(key);
    if (val === undefined) {
      throw new ZeltEnvError({ key, reason: 'required_not_set' });
    }
    return val;
  }
}
