import { inject, Injectable, injectConfig, LifecycleManager, type Lifecycle } from '@zeltjs/core';
import { validatePrefix, type AtomicKVDriver, type AtomicKVStore, type KVError } from '@zeltjs/kv';
import type { Result } from 'neverthrow';

import { RedisConfig } from './redis.config';
import { RedisKVStore } from './redis-kv-store';
import { ZeltRedis } from './zelt-redis';

@Injectable()
export class RedisKV implements AtomicKVDriver, Lifecycle {
  private readonly client: ZeltRedis;

  constructor(
    config = injectConfig(RedisConfig),
    lifecycle = inject(LifecycleManager),
  ) {
    this.client = new ZeltRedis(config.url, config.options);
    lifecycle.register(this);
  }

  namespace(prefix: string): Result<AtomicKVStore, KVError> {
    return validatePrefix(prefix).map((p) => new RedisKVStore(this.client, p));
  }

  async startup(): Promise<void> {}

  async shutdown(): Promise<void> {
    this.client.disconnect();
  }
}
