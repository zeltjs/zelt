import { Config, inject } from '@zeltjs/core';
import type { AtomicKVStore } from '@zeltjs/kv';
import { MemoryKV } from '@zeltjs/kv';

@Config
export class RateLimitConfig {
  readonly store: AtomicKVStore;

  readonly defaultLimit: number = 100;
  readonly defaultWindowSec: number = 60;
  readonly failureMode: 'open' | 'closed' = 'open';

  constructor(kv = inject(MemoryKV)) {
    this.store = kv.namespace('rate-limit:');
  }
}
