import { Injectable, inject, ZeltEnvError } from '../../kernel';

import { EnvAdaptor } from './env.adaptor';

@Injectable()
export class Env {
  constructor(private readonly source = inject(EnvAdaptor)) {}

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

  /** @throws {ZeltEnvError} */
  getStringOrThrow(key: string): string {
    const val = this.source.get(key);
    if (val === undefined) {
      throw new ZeltEnvError({ key, reason: 'required_not_set' });
    }
    return val;
  }

  /** @throws {ZeltEnvError} */
  getNumberOrThrow(key: string): number {
    const val = this.source.get(key);
    if (val === undefined) {
      throw new ZeltEnvError({ key, reason: 'required_not_set' });
    }
    const parsed = Number(val);
    if (Number.isNaN(parsed)) {
      throw new ZeltEnvError({ key, reason: 'invalid_number' });
    }
    return parsed;
  }

  /** @throws {ZeltEnvError} */
  getBooleanOrThrow(key: string): boolean {
    const val = this.source.get(key);
    if (val === undefined) {
      throw new ZeltEnvError({ key, reason: 'required_not_set' });
    }
    return val === 'true' || val === '1';
  }
}
