import {
  assertNonEmptyPrefix,
  joinPrefix,
  KVError,
  type AtomicKVStore,
  type SetOptions,
} from '@zeltjs/kv';
import type Redis from 'ioredis';

interface RedisWithCustomCommands extends Redis {
  zeltIncrWithTtl(key: string, by: number, ttlOrEmpty: string): Promise<number>;
  zeltSetnxWithTtl(key: string, value: string, ttlOrEmpty: string): Promise<number>;
  zeltDelIf(key: string, expected: string): Promise<number>;
}

export class RedisKVStore implements AtomicKVStore {
  constructor(
    private readonly client: RedisWithCustomCommands,
    private readonly prefix: string,
  ) {
    assertNonEmptyPrefix(prefix);
  }

  private k(key: string): string {
    return this.prefix + key;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(this.k(key));
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, opts?: SetOptions): Promise<void> {
    if (value === undefined) throw new KVError('cannot set undefined');
    const json = JSON.stringify(value);
    if (opts?.ttlSec !== undefined) {
      await this.client.set(this.k(key), json, 'EX', opts.ttlSec);
    } else {
      await this.client.set(this.k(key), json);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.k(key));
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(this.k(key))) === 1;
  }

  async expire(key: string, ttlSec: number): Promise<boolean> {
    return (await this.client.expire(this.k(key), ttlSec)) === 1;
  }

  namespace(sub: string): AtomicKVStore {
    assertNonEmptyPrefix(sub);
    return new RedisKVStore(this.client, joinPrefix(this.prefix, sub));
  }

  async incr(key: string, by = 1, opts?: { ttlSec?: number }): Promise<number> {
    return await this.client.zeltIncrWithTtl(this.k(key), by, String(opts?.ttlSec ?? ''));
  }

  async setnx<T>(key: string, value: T, opts?: SetOptions): Promise<boolean> {
    if (value === undefined) throw new KVError('cannot setnx undefined');
    const result = await this.client.zeltSetnxWithTtl(
      this.k(key),
      JSON.stringify(value),
      String(opts?.ttlSec ?? ''),
    );
    return result === 1;
  }

  async delIf(key: string, expected: unknown): Promise<boolean> {
    const result = await this.client.zeltDelIf(this.k(key), JSON.stringify(expected));
    return result === 1;
  }
}
