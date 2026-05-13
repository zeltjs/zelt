import type Redis from 'ioredis';
import { KVError } from '../errors';
import { joinPrefix } from '../namespace';
import { deserialize, serialize } from '../serialize';
import type { AtomicKVStore, Defined, NonEmptyString, SetOptions } from '../types';

import { INCR_WITH_TTL_LUA } from './lua-scripts';

const validateTtl = (ttlSec: number | undefined): void => {
  if (ttlSec !== undefined && ttlSec <= 0) throw KVError.invalidTtl(ttlSec);
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
    try {
      const raw = await this.client.get(this.k(key));
      return raw === null ? undefined : deserialize<T>(raw);
    } catch (cause) {
      throw KVError.storeOperationFailed('get', cause);
    }
  }

  async set<T extends Defined>(key: string, value: T, opts?: SetOptions): Promise<void> {
    validateTtl(opts?.ttlSec);
    const json = serialize(value);
    try {
      if (opts?.ttlSec !== undefined) {
        await this.client.set(this.k(key), json, 'EX', opts.ttlSec);
      } else {
        await this.client.set(this.k(key), json);
      }
    } catch (cause) {
      throw KVError.storeOperationFailed('set', cause);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(this.k(key));
    } catch (cause) {
      throw KVError.storeOperationFailed('del', cause);
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const n = await this.client.exists(this.k(key));
      return n === 1;
    } catch (cause) {
      throw KVError.storeOperationFailed('exists', cause);
    }
  }

  async expire(key: string, ttlSec: number): Promise<boolean> {
    validateTtl(ttlSec);
    try {
      const n = await this.client.expire(this.k(key), ttlSec);
      return n === 1;
    } catch (cause) {
      throw KVError.storeOperationFailed('expire', cause);
    }
  }

  namespace<const S extends string>(sub: NonEmptyString<S>): AtomicKVStore {
    return new RedisKVStore(this.client, joinPrefix(this.prefix, sub));
  }

  async incr(key: string, by = 1, opts?: { ttlSec?: number }): Promise<number> {
    validateTtl(opts?.ttlSec);
    try {
      return await incrWithTtl(this.client, this.k(key), by, opts?.ttlSec);
    } catch (cause) {
      throw KVError.storeOperationFailed('incr', cause);
    }
  }

  async setnx<T extends Defined>(key: string, value: T, opts?: SetOptions): Promise<boolean> {
    validateTtl(opts?.ttlSec);
    const json = serialize(value);
    try {
      const promise =
        opts?.ttlSec !== undefined
          ? this.client.set(this.k(key), json, 'EX', opts.ttlSec, 'NX')
          : this.client.set(this.k(key), json, 'NX');
      const result = await promise;
      return result === 'OK';
    } catch (cause) {
      throw KVError.storeOperationFailed('setnx', cause);
    }
  }
}
