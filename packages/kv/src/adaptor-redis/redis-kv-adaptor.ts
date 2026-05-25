import type { Lifecycle } from '@zeltjs/core';
import { inject, LifecycleManager } from '@zeltjs/core';
import { RedisService } from '@zeltjs/redis';

import type { AtomicKVAdaptor, AtomicKVStore, NonEmptyString } from '../types';

import { INCR_WITH_TTL_LUA } from './lua-scripts';
import { RedisKVStore } from './redis-kv-store';

export class RedisKVAdaptor implements AtomicKVAdaptor, Lifecycle {
  constructor(
    private readonly redis = inject(RedisService),
    lifecycle = inject(LifecycleManager),
  ) {
    lifecycle.register(this);
  }

  async startup(): Promise<void> {
    this.redis.client.defineCommand('incrWithTtl', {
      numberOfKeys: 1,
      lua: INCR_WITH_TTL_LUA,
    });
  }

  async shutdown(): Promise<void> {}

  namespace<const S extends string>(prefix: NonEmptyString<S>): AtomicKVStore {
    return new RedisKVStore(this.redis.client, prefix);
  }
}
