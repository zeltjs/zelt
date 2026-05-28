import { Config, inject } from '@zeltjs/core';
import type { AtomicKVAdaptor } from '@zeltjs/kv';
import { MemoryKV } from '@zeltjs/kv';

@Config
export class RateLimitConfig {
  constructor(readonly kv: AtomicKVAdaptor = inject(MemoryKV)) {}

  readonly kvStoreNamespace: string = 'rate-limit:';
  readonly defaultLimit: number = 100;
  readonly defaultWindowSec: number = 60;
  readonly failureMode: 'open' | 'closed' = 'open';
}
