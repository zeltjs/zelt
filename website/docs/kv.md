---
sidebar_position: 11
---

# Key-Value Store

Zelt provides `@zeltjs/kv` for namespace-based key-value storage with TTL support and atomic operations.

## Overview

The KV module provides:

- **`KVDriver` / `AtomicKVDriver`** — Top-level drivers that create namespaced stores
- **`KVStore` / `AtomicKVStore`** — Interfaces for data operations (get, set, del, etc.)
- **`MemoryKV`** — In-memory implementation with automatic garbage collection
- **Result-based error handling** — All operations return `ResultAsync` from neverthrow

## Installation

```bash
pnpm add @zeltjs/kv
```

## Basic Usage

Inject `MemoryKV` and create a namespaced store:

```typescript
import { Injectable, inject } from '@zeltjs/core';
import { MemoryKV, type AtomicKVStore } from '@zeltjs/kv';

@Injectable()
export class CacheService {
  private store: AtomicKVStore;

  constructor(private kv = inject(MemoryKV)) {
    this.store = this.kv.namespace('cache').unwrapOr(null as never);
  }

  async getUser(id: string) {
    const result = await this.store.get<User>(`user:${id}`);
    return result.unwrapOr(undefined);
  }

  async setUser(id: string, user: User) {
    await this.store.set(`user:${id}`, user, { ttlSec: 3600 });
  }
}
```

## KVStore Methods

| Method | Description |
|--------|-------------|
| `get<T>(key)` | Retrieve a value by key |
| `set<T>(key, value, opts?)` | Store a value with optional TTL |
| `del(key)` | Delete a key |
| `has(key)` | Check if a key exists |
| `expire(key, ttlSec)` | Update TTL for an existing key |
| `namespace(prefix)` | Create a child namespace |

### TTL (Time-To-Live)

```typescript
await store.set('session:abc', { userId: '123' }, { ttlSec: 1800 });

// Extend TTL for an existing key (useful for session touch)
await store.expire('session:abc', 1800);
```

## Atomic Operations

`AtomicKVStore` extends `KVStore` with atomic operations:

| Method | Description |
|--------|-------------|
| `incr(key, by?, opts?)` | Atomic increment (creates key if missing) |
| `setnx<T>(key, value, opts?)` | Set only if key does not exist |

### Rate Limiting with incr

```typescript
@Injectable()
export class RateLimiter {
  private store: AtomicKVStore;

  constructor(kv = inject(MemoryKV)) {
    this.store = kv.namespace('ratelimit').unwrapOr(null as never);
  }

  async checkLimit(clientId: string, limit: number): Promise<boolean> {
    const result = await this.store.incr(`req:${clientId}`, 1, { ttlSec: 60 });
    return result.map((count) => count <= limit).unwrapOr(false);
  }
}
```

### Distributed Locks with setnx

```typescript
const acquired = await store.setnx('lock:resource', true, { ttlSec: 30 });
if (acquired.unwrapOr(false)) {
  // Lock acquired, do work, then release
  await store.del('lock:resource');
}
```

## Namespacing

Namespaces provide logical separation of keys. They can be nested:

```typescript
const users = kv.namespace('users').unwrapOr(null as never);
const sessions = kv.namespace('sessions').unwrapOr(null as never);

const adminSessions = sessions.namespace('admin').unwrapOr(null as never);
```

## Error Handling

All KV operations return `ResultAsync<T, KVError>` from neverthrow:

```typescript
const result = await store.set('key', value, { ttlSec: -1 });

result.match(
  () => console.log('Success'),
  (error) => console.error(error.message)
);
```

Error types: `INVALID_TTL`, `EMPTY_NAMESPACE`, `INVALID_VALUE`, `STORE_OPERATION_FAILED`.

## MemoryKV

`MemoryKV` is an in-memory implementation for development and testing. It serializes values to JSON and runs garbage collection every 60 seconds.

```typescript
import { createHttpApp } from '@zeltjs/core';
import { MemoryKV } from '@zeltjs/kv';

const app = createHttpApp({
  controllers: [AppController],
  injectables: [MemoryKV],
});
```
