import { Config, EnvService, inject } from '@zeltjs/core';
import type { RedisOptions } from 'ioredis';

@Config
export class RedisConfig {
  constructor(private env = inject(EnvService)) {}

  get url(): string {
    return this.env.getString('REDIS_URL', 'redis://localhost:6379');
  }

  get options(): RedisOptions {
    return {};
  }
}
