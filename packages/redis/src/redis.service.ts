import type { Lifecycle } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import Redis from 'ioredis';

import { RedisConfig } from './redis.config';

@Injectable()
export class RedisService implements Lifecycle {
  private readonly _client: Redis;

  constructor(config = inject(RedisConfig), lifecycle = inject(LifecycleManager)) {
    this._client = new Redis(config.url, config.options);
    lifecycle.register(this);
  }

  get client(): Redis {
    return this._client;
  }

  async startup(): Promise<void> {}

  async shutdown(): Promise<void> {
    this._client.disconnect();
  }
}
