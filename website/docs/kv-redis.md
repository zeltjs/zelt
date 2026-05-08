---
---

# Redis KV Driver

`@zeltjs/kv-driver-redis` provides a Redis backend for the KV abstraction. It implements `AtomicKVDriver` using [ioredis](https://github.com/redis/ioredis), supporting atomic operations like `incr` and `setnx`.

## Installation

```bash
pnpm add @zeltjs/kv-driver-redis
```

Peer dependencies:

```bash
pnpm add @zeltjs/core @zeltjs/kv
```

## Basic Setup

Register `RedisConfig` and inject `RedisKV` into your services:

```typescript
import { createHttpApp, Injectable, inject } from '@zeltjs/core';
import { RedisConfig, RedisKV } from '@zeltjs/kv-driver-redis';

@Injectable()
class CacheService {
  private store = inject(RedisKV).namespace('cache:').unwrapOr(null);

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.store) return undefined;
    const result = await this.store.get<T>(key);
    return result.unwrapOr(undefined);
  }

  async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
    if (!this.store) return;
    await this.store.set(key, value, { ttlSec });
  }
}

const app = createHttpApp({
  controllers: [AppController],
  configs: [RedisConfig],
});
```

By default, `RedisConfig` reads the connection URL from the `REDIS_URL` environment variable, falling back to `redis://localhost:6379`.

## Custom Configuration

Extend `RedisConfig` to customize connection settings:

```typescript
import { Config } from '@zeltjs/core';
import { RedisConfig } from '@zeltjs/kv-driver-redis';
import type { RedisOptions } from 'ioredis';

@Config
class CustomRedisConfig extends RedisConfig {
  override get url(): string {
    return process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  }

  override get options(): RedisOptions {
    return {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    };
  }
}
```

Register your custom config instead of the default:

```typescript
const app = createHttpApp({
  controllers: [AppController],
  configs: [CustomRedisConfig],
});
```

## API Reference

### RedisKV

| Method | Description |
|--------|-------------|
| `namespace(prefix)` | Returns a namespaced `AtomicKVStore` |
| `shutdown()` | Disconnects from Redis |

### AtomicKVStore Methods

| Method | Description |
|--------|-------------|
| `get<T>(key)` | Retrieve a value |
| `set<T>(key, value, opts?)` | Store a value with optional TTL |
| `del(key)` | Delete a key |
| `has(key)` | Check if key exists |
| `expire(key, ttlSec)` | Update TTL for existing key |
| `incr(key, by?, opts?)` | Atomic increment |
| `setnx<T>(key, value, opts?)` | Set if not exists |
| `namespace(prefix)` | Create nested namespace |

## Production Setup

For production deployments, configure connection pooling and retry behavior:

```typescript
@Config
class ProductionRedisConfig extends RedisConfig {
  override get options(): RedisOptions {
    return {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
      },
    };
  }
}
```

### Graceful Shutdown

Call `shutdown()` when your application terminates:

```typescript
import { listen } from '@zeltjs/adapter-node';

listen(app, { port: 3000 });

process.on('SIGTERM', async () => {
  await container.get(RedisKV).shutdown();
  process.exit(0);
});
```
