import { Config } from '@zeltjs/core';
import type { RedisOptions } from 'ioredis';

@Config
export class RedisKVConfig {
  /** 接続 URL。default は REDIS_URL 環境変数。 */
  get url(): string {
    return process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  }

  /** ioredis オプションの override 用。 */
  get options(): RedisOptions {
    return {};
  }
}
