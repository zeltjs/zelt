import { Config, inject } from '@zeltjs/core';
import { MemoryKV, type AtomicKVStore } from '@zeltjs/kv';

@Config
export class RateLimitConfig {
  static readonly Token = RateLimitConfig;

  readonly store: AtomicKVStore;

  constructor(kv = inject(MemoryKV)) {
    this.store = kv.namespace('rate-limit:');
  }

  defaultLimit = 100;
  defaultWindowSec = 60;
  failureMode: 'open' | 'closed' = 'open';
}
