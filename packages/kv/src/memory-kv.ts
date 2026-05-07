import { inject, Injectable, LifecycleManager, type Lifecycle } from '@zeltjs/core';
import { err, ok, okAsync, ResultAsync, type Result } from 'neverthrow';

import { invalidTtl, type KVError } from './errors';
import { validatePrefix, joinPrefix } from './namespace';
import { deserialize, serialize } from './serialize';
import type { AtomicKVDriver, AtomicKVStore, SetOptions } from './types';

type Entry = {
  raw: string;
  /** epoch ms。undefined は永続 */
  expiresAt?: number;
};

const validateTtl = (ttlSec: number | undefined): Result<void, KVError> => {
  if (ttlSec !== undefined && ttlSec <= 0) return err(invalidTtl(ttlSec));
  return ok(undefined);
};

const makeEntry = (raw: string, ttlSec?: number): Entry =>
  ttlSec !== undefined ? { raw, expiresAt: Date.now() + ttlSec * 1000 } : { raw };

const toResultAsync = <T, E>(result: Result<T, E>): ResultAsync<T, E> =>
  new ResultAsync(Promise.resolve(result));

@Injectable()
export class MemoryKV implements AtomicKVDriver, Lifecycle {
  private readonly data = new Map<string, Entry>();
  private readonly gcInterval: ReturnType<typeof setInterval>;

  constructor(lifecycle = inject(LifecycleManager)) {
    this.gcInterval = setInterval(() => this.gc(), 60_000);
    // prevent the interval from keeping the Node.js process alive
    this.gcInterval.unref();
    lifecycle.register(this);
  }

  private gc(): void {
    const now = Date.now();
    for (const [key, entry] of this.data) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        this.data.delete(key);
      }
    }
  }

  async startup(): Promise<void> {}

  async shutdown(): Promise<void> {
    clearInterval(this.gcInterval);
  }

  namespace(prefix: string): Result<AtomicKVStore, KVError> {
    return validatePrefix(prefix).map((p) => new MemoryKVStore(this.data, p));
  }
}

class MemoryKVStore implements AtomicKVStore {
  constructor(
    private readonly data: Map<string, Entry>,
    private readonly prefix: string,
  ) {}

  private k(key: string): string {
    return this.prefix + key;
  }

  private current(key: string): Entry | undefined {
    const entry = this.data.get(this.k(key));
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.data.delete(this.k(key));
      return undefined;
    }
    return entry;
  }

  get<T>(key: string): ResultAsync<T | undefined, KVError> {
    return okAsync(this.current(key)).map((entry) =>
      entry ? deserialize<T>(entry.raw) : undefined,
    );
  }

  set<T>(key: string, value: T, opts?: SetOptions): ResultAsync<void, KVError> {
    const validated = validateTtl(opts?.ttlSec).andThen(() => serialize(value));
    return toResultAsync(
      validated.andThen((raw) => {
        this.data.set(this.k(key), makeEntry(raw, opts?.ttlSec));
        return ok<void, KVError>(undefined);
      }),
    );
  }

  del(key: string): ResultAsync<void, KVError> {
    this.data.delete(this.k(key));
    return okAsync(undefined);
  }

  has(key: string): ResultAsync<boolean, KVError> {
    return okAsync(this.current(key) !== undefined);
  }

  expire(key: string, ttlSec: number): ResultAsync<boolean, KVError> {
    const result = validateTtl(ttlSec).map(() => {
      const entry = this.current(key);
      if (!entry) return false;
      entry.expiresAt = Date.now() + ttlSec * 1000;
      return true;
    });
    return toResultAsync(result);
  }

  namespace(sub: string): Result<AtomicKVStore, KVError> {
    return validatePrefix(sub).map((s) => new MemoryKVStore(this.data, joinPrefix(this.prefix, s)));
  }

  incr(key: string, by = 1, opts?: { ttlSec?: number }): ResultAsync<number, KVError> {
    const result = validateTtl(opts?.ttlSec).andThen(() => {
      const k = this.k(key);
      const entry = this.current(key);
      if (!entry) {
        return serialize(by).map((raw) => {
          this.data.set(k, makeEntry(raw, opts?.ttlSec));
          return by;
        });
      }
      const next = (deserialize<number>(entry.raw) ?? 0) + by;
      return serialize(next).map((raw) => {
        entry.raw = raw;
        return next;
      });
    });
    return toResultAsync(result);
  }

  setnx<T>(key: string, value: T, opts?: SetOptions): ResultAsync<boolean, KVError> {
    const result = validateTtl(opts?.ttlSec).andThen(() => {
      if (this.current(key)) return ok(false);
      return serialize(value).map((raw) => {
        this.data.set(this.k(key), makeEntry(raw, opts?.ttlSec));
        return true;
      });
    });
    return toResultAsync(result);
  }
}
