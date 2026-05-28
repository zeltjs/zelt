import type { Lifecycle } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';

import { ZeltKVInvalidTtlError } from '../kv.errors';
import type {
  AtomicKVAdaptor,
  AtomicKVStore,
  Defined,
  NonEmptyString,
  SetOptions,
} from '../kv.types';
import { KVUtilService } from '../util';

type Entry = {
  raw: string;
  /** epoch ms。undefined は永続 */
  expiresAt?: number;
};

/** @throws {ZeltKVInvalidTtlError} */
function validateTtl(ttlSec: number | undefined): void {
  if (ttlSec !== undefined && ttlSec <= 0) throw new ZeltKVInvalidTtlError({ ttlSec });
}

function makeEntry(raw: string, ttlSec?: number): Entry {
  return ttlSec !== undefined ? { raw, expiresAt: Date.now() + ttlSec * 1000 } : { raw };
}

@Injectable()
export class MemoryKVAdaptor implements AtomicKVAdaptor, Lifecycle {
  private readonly data = new Map<string, Entry>();
  private readonly gcInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly util = inject(KVUtilService),
    lifecycle = inject(LifecycleManager),
  ) {
    this.gcInterval = setInterval(() => this.gc(), 60_000);
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

  namespace<const S extends string>(prefix: NonEmptyString<S>): AtomicKVStore {
    return new MemoryKVStore(this.data, prefix, this.util);
  }
}

class MemoryKVStore implements AtomicKVStore {
  constructor(
    private readonly data: Map<string, Entry>,
    private readonly prefix: string,
    private readonly util: KVUtilService,
  ) {}

  private k(key: string): string {
    return this.util.joinPrefix(this.prefix, key);
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

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.current(key);
    return entry ? this.util.deserialize<T>(entry.raw) : undefined;
  }

  /** @throws {ZeltKVInvalidTtlError} */
  async set<T extends Defined>(key: string, value: T, opts?: SetOptions): Promise<void> {
    validateTtl(opts?.ttlSec);
    const raw = this.util.serialize(value);
    this.data.set(this.k(key), makeEntry(raw, opts?.ttlSec));
  }

  async del(key: string): Promise<void> {
    this.data.delete(this.k(key));
  }

  async has(key: string): Promise<boolean> {
    return this.current(key) !== undefined;
  }

  /** @throws {ZeltKVInvalidTtlError} */
  async expire(key: string, ttlSec: number): Promise<boolean> {
    validateTtl(ttlSec);
    const entry = this.current(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + ttlSec * 1000;
    return true;
  }

  namespace<const S extends string>(sub: NonEmptyString<S>): AtomicKVStore {
    return new MemoryKVStore(this.data, this.util.joinPrefix(this.prefix, sub), this.util);
  }

  /** @throws {ZeltKVInvalidTtlError} */
  async incr(key: string, by = 1, opts?: { ttlSec?: number }): Promise<number> {
    validateTtl(opts?.ttlSec);
    const k = this.k(key);
    const entry = this.current(key);
    if (!entry) {
      const raw = this.util.serialize(by);
      this.data.set(k, makeEntry(raw, opts?.ttlSec));
      return by;
    }
    const next = (this.util.deserialize<number>(entry.raw) ?? 0) + by;
    entry.raw = this.util.serialize(next);
    return next;
  }

  /** @throws {ZeltKVInvalidTtlError} */
  async setnx<T extends Defined>(key: string, value: T, opts?: SetOptions): Promise<boolean> {
    validateTtl(opts?.ttlSec);
    if (this.current(key)) return false;
    const raw = this.util.serialize(value);
    this.data.set(this.k(key), makeEntry(raw, opts?.ttlSec));
    return true;
  }
}
