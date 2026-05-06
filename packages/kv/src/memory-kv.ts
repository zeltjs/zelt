import { Injectable } from '@zeltjs/core';

import { assertNonEmptyPrefix, joinPrefix } from './namespace';
import { deserialize, serialize } from './serialize';
import type { AtomicKVDriver, AtomicKVStore, SetOptions } from './types';

type Entry = {
  raw: string;
  /** epoch ms。undefined は永続 */
  expiresAt?: number;
};

const makeEntry = (raw: string, ttlSec?: number): Entry =>
  ttlSec !== undefined ? { raw, expiresAt: Date.now() + ttlSec * 1000 } : { raw };

@Injectable()
export class MemoryKV implements AtomicKVDriver {
  private readonly data = new Map<string, Entry>();

  namespace(prefix: string): AtomicKVStore {
    assertNonEmptyPrefix(prefix);
    return new MemoryKVStore(this.data, prefix);
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

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.current(key);
    return entry ? deserialize<T>(entry.raw) : undefined;
  }

  async set<T>(key: string, value: T, opts?: SetOptions): Promise<void> {
    this.data.set(this.k(key), makeEntry(serialize(value), opts?.ttlSec));
  }

  async del(key: string): Promise<void> {
    this.data.delete(this.k(key));
  }

  async has(key: string): Promise<boolean> {
    return this.current(key) !== undefined;
  }

  async expire(key: string, ttlSec: number): Promise<boolean> {
    const entry = this.current(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + ttlSec * 1000;
    return true;
  }

  namespace(sub: string): AtomicKVStore {
    assertNonEmptyPrefix(sub);
    return new MemoryKVStore(this.data, joinPrefix(this.prefix, sub));
  }

  async incr(key: string, by = 1, opts?: { ttlSec?: number }): Promise<number> {
    const k = this.k(key);
    const entry = this.current(key);
    if (!entry) {
      this.data.set(k, makeEntry(serialize(by), opts?.ttlSec));
      return by;
    }
    const next = (deserialize<number>(entry.raw) ?? 0) + by;
    entry.raw = serialize(next);
    return next;
  }

  async setnx<T>(key: string, value: T, opts?: SetOptions): Promise<boolean> {
    if (this.current(key)) return false;
    this.data.set(this.k(key), makeEntry(serialize(value), opts?.ttlSec));
    return true;
  }

  async delIf(key: string, expected: unknown): Promise<boolean> {
    const entry = this.current(key);
    if (!entry) return false;
    if (entry.raw !== serialize(expected)) return false;
    this.data.delete(this.k(key));
    return true;
  }
}
