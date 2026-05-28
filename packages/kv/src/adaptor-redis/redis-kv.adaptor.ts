import type { Lifecycle } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import { RedisService } from '@zeltjs/redis';
import type { AtomicKVAdaptor, AtomicKVStore, NonEmptyString } from '../kv.types';
import { KVUtilService } from '../util';

import { INCR_WITH_TTL_LUA } from './lua-scripts.lib';
import { RedisKVStore } from './redis-kv-store.lib';

@Injectable()
export class RedisKVAdaptor implements AtomicKVAdaptor, Lifecycle {
  constructor(
    private readonly redis = inject(RedisService),
    private readonly util = inject(KVUtilService),
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
    return new RedisKVStore(this.redis.client, prefix, this.util);
  }
}
