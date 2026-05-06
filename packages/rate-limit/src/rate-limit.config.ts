import { Config, inject } from '@zeltjs/core';
import { MemoryKV, type AtomicKVStore } from '@zeltjs/kv';

@Config
export class RateLimitConfig {
  static readonly Token = RateLimitConfig;

  readonly store: AtomicKVStore;

  constructor(kv = inject(MemoryKV)) {
    // 'rate-limit:' is a non-empty literal — namespace cannot fail here.
    this.store = kv.namespace('rate-limit:')._unsafeUnwrap();
  }

  defaultLimit = 100;
  defaultWindowSec = 60;
  failureMode: 'open' | 'closed' = 'open';
}
