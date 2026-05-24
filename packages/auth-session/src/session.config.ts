import { Config, Env, inject } from '@zeltjs/core';
import type { KVStore } from '@zeltjs/kv';

import { ZeltSessionConfigError } from './errors';

@Config
export class SessionConfig {
  constructor(private env = inject(Env)) {}

  /**
   * @throws {ZeltSessionConfigError} When store is not overridden
   */
  get store(): KVStore {
    throw new ZeltSessionConfigError({ reason: 'store_not_overridden' });
  }

  get cookieName(): string {
    return 'sid';
  }

  get ttlSec(): number {
    return 86400; // 24h
  }

  /**
   * @throws {ZeltSessionConfigError} When SESSION_SECRET is not set
   */
  get secret(): string {
    const secret = this.env.getString('SESSION_SECRET');
    if (!secret) {
      throw new ZeltSessionConfigError({ reason: 'missing_secret' });
    }
    return secret;
  }

  get cookieOptions(): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
    path: string;
  } {
    return {
      httpOnly: true,
      secure: this.env.getString('NODE_ENV') === 'production',
      sameSite: 'Lax',
      path: '/',
    };
  }
}
