---
---

# Key-Value Store

Zelt provides `@zeltjs/kv` for namespace-based key-value storage with TTL support and atomic operations.

## Overview

The KV module provides:

- **`KVAdaptor` / `AtomicKVAdaptor`** — Top-level adaptors that create namespaced stores
- **`KVStore` / `AtomicKVStore`** — Interfaces for data operations (get, set, del, etc.)
- **`MemoryKV`** — In-memory implementation with automatic garbage collection
- **Promise-based API** — All operations return `Promise` and throw on errors

## Installation

```bash
pnpm add @zeltjs/kv
```

## Basic Usage

Inject `MemoryKV` and create a namespaced store:

```typescript
import { Injectable, inject } from '@zeltjs/core';
import { MemoryKV, type AtomicKVStore } from '@zeltjs/kv';

interface User { id: string; name: string; }
// ---cut---
@Injectable()
export class CacheService {
  private store: AtomicKVStore;

  constructor(private kv = inject(MemoryKV)) {
    this.store = this.kv.namespace('cache');
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.store.get<User>(`user:${id}`);
  }

  async setUser(id: string, user: User): Promise<void> {
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
import { inject } from '@zeltjs/core';
import { MemoryKV } from '@zeltjs/kv';

const store = inject(MemoryKV).namespace('sessions');
// ---cut---
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
import { Injectable, inject } from '@zeltjs/core';
import { MemoryKV, type AtomicKVStore } from '@zeltjs/kv';
// ---cut---
@Injectable()
export class RateLimiter {
  private store: AtomicKVStore;

  constructor(kv = inject(MemoryKV)) {
    this.store = kv.namespace('ratelimit');
  }

  async checkLimit(clientId: string, limit: number): Promise<boolean> {
    const count = await this.store.incr(`req:${clientId}`, 1, { ttlSec: 60 });
    return count <= limit;
  }
}
```

### Distributed Locks with setnx

```typescript
import { inject } from '@zeltjs/core';
import { MemoryKV } from '@zeltjs/kv';

const store = inject(MemoryKV).namespace('locks');
// ---cut---
const acquired = await store.setnx('lock:resource', true, { ttlSec: 30 });
if (acquired) {
  // Lock acquired, do work, then release
  await store.del('lock:resource');
}
```

## Namespacing

Namespaces provide logical separation of keys. They can be nested:

```typescript
import { inject } from '@zeltjs/core';
import { MemoryKV } from '@zeltjs/kv';

const kv = inject(MemoryKV);
// ---cut---
const users = kv.namespace('users');
const sessions = kv.namespace('sessions');

const adminSessions = sessions.namespace('admin');
```

## Error Handling

KV operations throw errors on failure. Use try-catch for error handling:

```typescript
import { inject } from '@zeltjs/core';
import { MemoryKV } from '@zeltjs/kv';

const store = inject(MemoryKV).namespace('data');
const value = { data: 'test' };
// ---cut---
try {
  await store.set('key', value, { ttlSec: -1 });
  console.log('Success');
} catch (error) {
  console.error((error as Error).message);
}
```

Error types: `INVALID_TTL`, `EMPTY_NAMESPACE`, `INVALID_VALUE`, `STORE_OPERATION_FAILED`.

## MemoryKV

`MemoryKV` is an in-memory implementation for development and testing. It serializes values to JSON and runs garbage collection every 60 seconds.

```typescript
import { createApp, Controller, Get } from '@zeltjs/core';
import { MemoryKV } from '@zeltjs/kv';

@Controller('/') class AppController { @Get('/') index() { return { ok: true }; } }
// ---cut---
const app = createApp({
  http: {
    controllers: [AppController],
  },
  injectables: [MemoryKV],
});
```
