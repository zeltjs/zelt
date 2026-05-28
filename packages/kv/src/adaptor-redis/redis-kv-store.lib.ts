import type Redis from 'ioredis';
import type { Result } from 'ioredis';

import { ZeltKVInvalidTtlError } from '../kv.errors';
import type { AtomicKVStore, Defined, NonEmptyString, SetOptions } from '../kv.types';
import type { KVUtilService } from '../util';

declare module 'ioredis' {
  interface RedisCommander<Context> {
    incrWithTtl(key: string, by: number | string, ttlArg: string): Result<number, Context>;
  }
}

/** @throws {ZeltKVInvalidTtlError} */
const validateTtl = (ttlSec: number | undefined): void => {
  if (ttlSec !== undefined && ttlSec <= 0) throw new ZeltKVInvalidTtlError({ ttlSec });
};

export class RedisKVStore implements AtomicKVStore {
  constructor(
    private readonly client: Redis,
    private readonly prefix: string,
    private readonly util: KVUtilService,
  ) {}

  private k(key: string): string {
    return this.util.joinPrefix(this.prefix, key);
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(this.k(key));
    return raw === null ? undefined : this.util.deserialize<T>(raw);
  }

  /** @throws {ZeltKVInvalidTtlError} */
  async set<T extends Defined>(key: string, value: T, opts?: SetOptions): Promise<void> {
    validateTtl(opts?.ttlSec);
    const json = this.util.serialize(value);
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
    const n = await this.client.exists(this.k(key));
    return n === 1;
  }

  /** @throws {ZeltKVInvalidTtlError} */
  async expire(key: string, ttlSec: number): Promise<boolean> {
    validateTtl(ttlSec);
    const n = await this.client.expire(this.k(key), ttlSec);
    return n === 1;
  }

  namespace<const S extends string>(sub: NonEmptyString<S>): AtomicKVStore {
    return new RedisKVStore(this.client, this.util.joinPrefix(this.prefix, sub), this.util);
  }

  /** @throws {ZeltKVInvalidTtlError} */
  async incr(key: string, by = 1, opts?: { ttlSec?: number }): Promise<number> {
    validateTtl(opts?.ttlSec);
    const ttlArg = opts?.ttlSec !== undefined ? String(opts.ttlSec) : '';
    return this.client.incrWithTtl(this.k(key), by, ttlArg);
  }

  /** @throws {ZeltKVInvalidTtlError} */
  async setnx<T extends Defined>(key: string, value: T, opts?: SetOptions): Promise<boolean> {
    validateTtl(opts?.ttlSec);
    const json = this.util.serialize(value);
    const result =
      opts?.ttlSec !== undefined
        ? await this.client.set(this.k(key), json, 'EX', opts.ttlSec, 'NX')
        : await this.client.set(this.k(key), json, 'NX');
    return result === 'OK';
  }
}
