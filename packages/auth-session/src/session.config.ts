import { Config } from '@zeltjs/core';
import type { KVStore } from '@zeltjs/kv';

@Config
export class SessionConfig {
  static readonly Token = SessionConfig;

  get store(): KVStore {
    throw new Error('SessionConfig.store must be overridden');
  }

  get cookieName(): string {
    return 'sid';
  }

  get ttlSec(): number {
    return 86400; // 24h
  }

  get secret(): string {
    const secret = process.env['SESSION_SECRET'];
    if (!secret) {
      throw new Error('SESSION_SECRET environment variable is required');
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
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'Lax',
      path: '/',
    };
  }
}
