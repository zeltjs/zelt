import { inject, Injectable, injectConfig, LifecycleManager, type Lifecycle } from '@zeltjs/core';
import { type AtomicKVDriver, type AtomicKVStore, type NonEmptyString } from '@zeltjs/kv';

import { RedisConfig } from './redis.config';
import { RedisKVStore } from './redis-kv-store';
import { ZeltRedis } from './zelt-redis';

@Injectable()
export class RedisKV implements AtomicKVDriver, Lifecycle {
  private readonly client: ZeltRedis;

  constructor(config = injectConfig(RedisConfig), lifecycle = inject(LifecycleManager)) {
    this.client = new ZeltRedis(config.url, config.options);
    lifecycle.register(this);
  }

  namespace<const S extends string>(prefix: NonEmptyString<S>): AtomicKVStore {
    return new RedisKVStore(this.client, prefix);
  }

  async startup(): Promise<void> {}

  async shutdown(): Promise<void> {
    this.client.disconnect();
  }
}
