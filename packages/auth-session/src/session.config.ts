import { Config, Env, inject } from '@zeltjs/core';
import type { KVAdaptor } from '@zeltjs/kv';
import { MemoryKV } from '@zeltjs/kv';

import { ZeltSessionConfigError } from './session.errors';

@Config
export class SessionConfig {
  constructor(
    protected readonly env = inject(Env),
    readonly kv: KVAdaptor = inject(MemoryKV),
  ) {}

  readonly kvStoreNamespace: string = 'session:';

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
