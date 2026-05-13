import { inject } from '@zeltjs/core';
import { RedisService } from '@zeltjs/redis';

import type { AtomicKVAdaptor, AtomicKVStore, NonEmptyString } from '../types';

import { RedisKVStore } from './redis-kv-store';

export class RedisKVAdaptor implements AtomicKVAdaptor {
  constructor(private readonly redis = inject(RedisService)) {}

  namespace<const S extends string>(prefix: NonEmptyString<S>): AtomicKVStore {
    return new RedisKVStore(this.redis.client, prefix);
  }
}
