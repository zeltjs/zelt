import type Redis from 'ioredis';
import { ZeltKVInvalidTtlError } from '../errors';
import { joinPrefix } from '../namespace';
import { deserialize, serialize } from '../serialize';
import type { AtomicKVStore, Defined, NonEmptyString, SetOptions } from '../types';

import { INCR_WITH_TTL_LUA } from './lua-scripts';

/** @throws {ZeltKVInvalidTtlError} */
const validateTtl = (ttlSec: number | undefined): void => {
  if (ttlSec !== undefined && ttlSec <= 0) throw new ZeltKVInvalidTtlError({ ttlSec });
};

const incrWithTtl = async (
  client: Redis,
  key: string,
  by: number,
  ttlSec: number | undefined,
): Promise<number> => {
  const ttlArg = ttlSec !== undefined ? String(ttlSec) : '';
  return client.eval(INCR_WITH_TTL_LUA, 1, key, by, ttlArg) as Promise<number>;
};

export class RedisKVStore implements AtomicKVStore {
  constructor(
    private readonly client: Redis,
    private readonly prefix: string,
  ) {}

  private k(key: string): string {
    return this.prefix + key;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(this.k(key));
    return raw === null ? undefined : deserialize<T>(raw);
  }

  /** @throws {ZeltKVInvalidTtlError} */
  async set<T extends Defined>(key: string, value: T, opts?: SetOptions): Promise<void> {
    validateTtl(opts?.ttlSec);
    const json = serialize(value);
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
    return new RedisKVStore(this.client, joinPrefix(this.prefix, sub));
  }

  /** @throws {ZeltKVInvalidTtlError} */
  async incr(key: string, by = 1, opts?: { ttlSec?: number }): Promise<number> {
    validateTtl(opts?.ttlSec);
    return incrWithTtl(this.client, this.k(key), by, opts?.ttlSec);
  }

  /** @throws {ZeltKVInvalidTtlError} */
  async setnx<T extends Defined>(key: string, value: T, opts?: SetOptions): Promise<boolean> {
    validateTtl(opts?.ttlSec);
    const json = serialize(value);
    const result =
      opts?.ttlSec !== undefined
        ? await this.client.set(this.k(key), json, 'EX', opts.ttlSec, 'NX')
        : await this.client.set(this.k(key), json, 'NX');
    return result === 'OK';
  }
}
