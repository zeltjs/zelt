import type { Lifecycle, ReadyValue } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import Redis from 'ioredis';

import { RedisConfig } from './redis.config';

type RedisReady = { client: Redis };

@Injectable()
export class RedisService implements Lifecycle<RedisReady> {
  private readonly ready: ReadyValue<RedisReady>;

  constructor(
    private readonly config = inject(RedisConfig),
    lifecycle = inject(LifecycleManager),
  ) {
    this.ready = lifecycle.register(this);
  }

  async startup(): Promise<RedisReady> {
    return { client: new Redis(this.config.url, this.config.options) };
  }

  get client(): Redis {
    return this.ready.client;
  }

  async shutdown(): Promise<void> {
    this.ready.client.disconnect();
  }
}
