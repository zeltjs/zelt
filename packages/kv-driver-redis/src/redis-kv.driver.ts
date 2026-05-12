import type { Lifecycle } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import type { AtomicKVDriver, AtomicKVStore, NonEmptyString } from '@zeltjs/kv';

import { RedisKVConfig } from './redis-kv.config';
import { RedisKVStore } from './redis-kv-store';
import { ZeltRedis } from './zelt-redis';

@Injectable()
export class RedisKVDriver implements AtomicKVDriver, Lifecycle {
  private readonly client: ZeltRedis;

  constructor(config = inject(RedisKVConfig), lifecycle = inject(LifecycleManager)) {
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
