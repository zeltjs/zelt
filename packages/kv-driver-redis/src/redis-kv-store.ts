import {
  joinPrefix,
  serialize,
  deserialize,
  storeOperationFailed,
  validatePrefix,
  invalidTtl,
  type AtomicKVStore,
  type KVError,
  type SetOptions,
} from '@zeltjs/kv';
import type Redis from 'ioredis';
import { err, ok, fromPromise, ResultAsync, type Result } from 'neverthrow';

const validateTtl = (ttlSec: number | undefined): Result<void, KVError> => {
  if (ttlSec !== undefined && ttlSec <= 0) return err(invalidTtl(ttlSec));
  return ok(undefined);
};

const toResultAsync = <T, E>(result: Result<T, E>): ResultAsync<T, E> =>
  new ResultAsync(Promise.resolve(result));

export interface RedisWithCustomCommands extends Redis {
  zeltIncrWithTtl(key: string, by: number, ttlOrEmpty: string): Promise<number>;
  zeltSetnxWithTtl(key: string, value: string, ttlOrEmpty: string): Promise<number>;
  zeltDelIf(key: string, expected: string): Promise<number>;
}

export class RedisKVStore implements AtomicKVStore {
  constructor(
    private readonly client: RedisWithCustomCommands,
    private readonly prefix: string,
  ) {}

  private k(key: string): string {
    return this.prefix + key;
  }

  get<T>(key: string): ResultAsync<T | undefined, KVError> {
    return fromPromise(this.client.get(this.k(key)), (cause) =>
      storeOperationFailed('get', cause),
    ).map((raw) => (raw === null ? undefined : deserialize<T>(raw)));
  }

  set<T>(key: string, value: T, opts?: SetOptions): ResultAsync<void, KVError> {
    const validated = validateTtl(opts?.ttlSec).andThen(() => serialize(value));
    return toResultAsync(validated).andThen((json) =>
      opts?.ttlSec !== undefined
        ? fromPromise(this.client.set(this.k(key), json, 'EX', opts.ttlSec), (cause) =>
            storeOperationFailed('set', cause),
          ).map(() => undefined)
        : fromPromise(this.client.set(this.k(key), json), (cause) =>
            storeOperationFailed('set', cause),
          ).map(() => undefined),
    );
  }

  del(key: string): ResultAsync<void, KVError> {
    return fromPromise(this.client.del(this.k(key)), (cause) =>
      storeOperationFailed('del', cause),
    ).map(() => undefined);
  }

  has(key: string): ResultAsync<boolean, KVError> {
    return fromPromise(this.client.exists(this.k(key)), (cause) =>
      storeOperationFailed('exists', cause),
    ).map((n) => n === 1);
  }

  expire(key: string, ttlSec: number): ResultAsync<boolean, KVError> {
    return toResultAsync(validateTtl(ttlSec)).andThen(() =>
      fromPromise(this.client.expire(this.k(key), ttlSec), (cause) =>
        storeOperationFailed('expire', cause),
      ).map((n) => n === 1),
    );
  }

  namespace(sub: string): Result<AtomicKVStore, KVError> {
    return validatePrefix(sub).map(
      (s) => new RedisKVStore(this.client, joinPrefix(this.prefix, s)),
    );
  }

  incr(key: string, by = 1, opts?: { ttlSec?: number }): ResultAsync<number, KVError> {
    return toResultAsync(validateTtl(opts?.ttlSec)).andThen(() =>
      fromPromise(
        this.client.zeltIncrWithTtl(this.k(key), by, String(opts?.ttlSec ?? '')),
        (cause) => storeOperationFailed('incr', cause),
      ),
    );
  }

  setnx<T>(key: string, value: T, opts?: SetOptions): ResultAsync<boolean, KVError> {
    const validated = validateTtl(opts?.ttlSec).andThen(() => serialize(value));
    return toResultAsync(validated).andThen((json) =>
      fromPromise(
        this.client.zeltSetnxWithTtl(this.k(key), json, String(opts?.ttlSec ?? '')),
        (cause) => storeOperationFailed('setnx', cause),
      ).map((n) => n === 1),
    );
  }

  delIf(key: string, expected: unknown): ResultAsync<boolean, KVError> {
    return toResultAsync(serialize(expected)).andThen((expectedJson) =>
      fromPromise(this.client.zeltDelIf(this.k(key), expectedJson), (cause) =>
        storeOperationFailed('delIf', cause),
      ).map((n) => n === 1),
    );
  }
}
