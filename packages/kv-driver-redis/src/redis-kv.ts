import { Injectable, injectConfig, type Disposable } from '@zeltjs/core';
import { assertNonEmptyPrefix, type AtomicKVDriver, type AtomicKVStore } from '@zeltjs/kv';
import Redis from 'ioredis';

import { DEL_IF_LUA, INCR_WITH_TTL_LUA, SETNX_WITH_TTL_LUA } from './lua-scripts';
import { RedisConfig } from './redis.config';
import { RedisKVStore, type RedisWithCustomCommands } from './redis-kv-store';

@Injectable()
export class RedisKV implements AtomicKVDriver, Disposable {
  private readonly client: Redis;

  constructor(config = injectConfig(RedisConfig)) {
    this.client = new Redis(config.url, config.options);
    this.registerLuaScripts();
  }

  namespace(prefix: string): AtomicKVStore {
    assertNonEmptyPrefix(prefix);
    return new RedisKVStore(this.client as unknown as RedisWithCustomCommands, prefix);
  }

  async shutdown(): Promise<void> {
    this.client.disconnect();
  }

  private registerLuaScripts(): void {
    this.client.defineCommand('zeltIncrWithTtl', {
      numberOfKeys: 1,
      lua: INCR_WITH_TTL_LUA,
    });
    this.client.defineCommand('zeltSetnxWithTtl', {
      numberOfKeys: 1,
      lua: SETNX_WITH_TTL_LUA,
    });
    this.client.defineCommand('zeltDelIf', {
      numberOfKeys: 1,
      lua: DEL_IF_LUA,
    });
  }
}
