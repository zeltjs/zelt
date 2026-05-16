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
import { createApp, Injectable, inject, Controller, Get } from '@zeltjs/core';
interface AtomicKVStore {
  get<T>(key: string): Promise<{ unwrapOr<U>(fallback: U): T | U }>;
  set<T>(key: string, value: T, opts?: { ttlSec?: number }): Promise<void>;
}
declare class RedisConfig {}
declare class RedisKV {
  namespace(prefix: string): { unwrapOr<T>(fallback: T): AtomicKVStore | T };
}
@Controller('/app')
class AppController { @Get('/') get() { return {}; } }
// ---cut---
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

const app = createApp({
  http: {
    controllers: [AppController],
  },
  configs: [RedisConfig],
});
```

By default, `RedisConfig` reads the connection URL from the `REDIS_URL` environment variable, falling back to `redis://localhost:6379`.

## Custom Configuration

Extend `RedisConfig` to customize connection settings:

```typescript
import { Config, EnvService, inject } from '@zeltjs/core';
type RedisOptions = {
  maxRetriesPerRequest?: number;
  retryStrategy?: (times: number) => number | null;
  enableReadyCheck?: boolean;
};
declare class RedisConfig {
  get url(): string;
  get options(): RedisOptions;
}
// ---cut---
@Config
class CustomRedisConfig extends RedisConfig {
  constructor(private env = inject(EnvService)) {
    super();
  }

  override get url(): string {
    return this.env.getString('REDIS_URL', 'redis://localhost:6379');
  }

  override get options(): RedisOptions {
    return {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
    };
  }
}
```

Register your custom config instead of the default:

```typescript
import { createApp, Config, EnvService, inject, Controller, Get } from '@zeltjs/core';
type RedisOptions = { maxRetriesPerRequest?: number };
declare class RedisConfig {
  get url(): string;
  get options(): RedisOptions;
}
@Config
class CustomRedisConfig extends RedisConfig {
  constructor(private env = inject(EnvService)) { super(); }
  override get url(): string { return this.env.getString('REDIS_URL', 'redis://localhost:6379'); }
  override get options(): RedisOptions { return { maxRetriesPerRequest: 3 }; }
}
@Controller('/app')
class AppController { @Get('/') get() { return {}; } }
// ---cut---
const app = createApp({
  http: {
    controllers: [AppController],
  },
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
import { Config } from '@zeltjs/core';
type RedisOptions = {
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  retryStrategy?: (times: number) => number | null;
};
declare class RedisConfig {
  get url(): string;
  get options(): RedisOptions;
}
// ---cut---
@Config
class ProductionRedisConfig extends RedisConfig {
  override get options(): RedisOptions {
    return {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
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
declare class RedisKV { shutdown(): Promise<void>; }
declare const app: { fetch(request: Request): Promise<Response> };
declare const container: { get<T>(token: new (...args: any[]) => T): T };
declare function listen(app: any, options: { port: number }): void;
declare const process: {
  on(event: string, handler: () => Promise<void>): void;
  exit(code: number): never;
};
// ---cut---
listen(app, { port: 3000 });

process.on('SIGTERM', async () => {
  await container.get(RedisKV).shutdown();
  process.exit(0);
});
```
