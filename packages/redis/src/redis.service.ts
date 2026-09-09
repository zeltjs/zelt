import type { Lifecycle } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import Redis from 'ioredis';

import { RedisConfig } from './redis.config';

@Injectable()
export class RedisService implements Lifecycle {
  private readonly _client: Redis;

  constructor(config = inject(RedisConfig), lifecycle = inject(LifecycleManager)) {
    // lazyConnect defers the network handshake to startup(); ioredis skips it
    // entirely at construction time, so `client` is safe to read from other
    // constructors (e.g. namespace() call sites) before the app has started.
    this._client = new Redis(config.url, { ...config.options, lazyConnect: true });
    lifecycle.register(this);
  }

  get client(): Redis {
    return this._client;
  }

  async startup(): Promise<void> {
    await this._client.connect();
  }

  async shutdown(): Promise<void> {
    this._client.disconnect();
  }
}
