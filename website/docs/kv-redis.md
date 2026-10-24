---
---

# Redis KV Driver

`@zeltjs/kv` ships a Redis backend through its `@zeltjs/kv/adaptor-redis` entry point. `RedisKVAdaptor` implements `AtomicKVAdaptor` on top of [ioredis](https://github.com/redis/ioredis), supporting atomic operations like `incr` and `setnx`.

## Installation

```bash
pnpm add @zeltjs/kv @zeltjs/redis
```

Peer dependency:

```bash
pnpm add @zeltjs/core
```

## Basic Setup

Inject `RedisKVAdaptor` and create a namespaced store. `namespace()` returns an `AtomicKVStore` directly, and `get()` resolves to the value (or `undefined` when the key is missing) — there is no result wrapper to unwrap:

```typescript twoslash
import { Injectable, inject } from '@zeltjs/core';
import { RedisKVAdaptor } from '@zeltjs/kv/adaptor-redis';
import type { AtomicKVStore, Defined } from '@zeltjs/kv';
// ---cut---
@Injectable()
export class CacheService {
  private store: AtomicKVStore;

  constructor(kv = inject(RedisKVAdaptor)) {
    this.store = kv.namespace('cache:');
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get<T>(key);
  }

  async set<T extends Defined>(key: string, value: T, ttlSec?: number): Promise<void> {
    await this.store.set(key, value, { ttlSec });
  }
}
```

Register `RedisConfig` and `RedisKVAdaptor` when creating the app. `RedisConfig` provides the connection settings (consumed by `RedisService`, which `RedisKVAdaptor` depends on), so listing `RedisKVAdaptor` in `injectables` is enough — its dependencies resolve automatically:

```typescript twoslash
import { createApp, Controller, Get, http } from '@zeltjs/core';
import { RedisKVAdaptor } from '@zeltjs/kv/adaptor-redis';
import { RedisConfig } from '@zeltjs/redis';

@Controller('/app')
class AppController { @Get('/') get() { return {}; } }
// ---cut---
const app = createApp([http({
    controllers: [AppController],
  })], { configs: [RedisConfig] });
```

By default, `RedisConfig` reads the connection URL from the `REDIS_URL` environment variable, falling back to `redis://localhost:6379`.

## Custom Configuration

Extend `RedisConfig` to customize connection settings. The `options` getter returns ioredis `RedisOptions`:

```typescript twoslash
import { Config } from '@zeltjs/core';
import { RedisConfig } from '@zeltjs/redis';
// ---cut---
@Config
class CustomRedisConfig extends RedisConfig {
  override get url(): string {
    return this.env.getString('REDIS_URL', 'redis://localhost:6379');
  }

  override get options() {
    return {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
    };
  }
}
```

Register your custom config instead of the default:

```typescript twoslash
import { createApp, Config, Controller, Get, http } from '@zeltjs/core';
import { RedisConfig } from '@zeltjs/redis';
import { RedisKVAdaptor } from '@zeltjs/kv/adaptor-redis';

@Config
class CustomRedisConfig extends RedisConfig {
  override get url(): string { return this.env.getString('REDIS_URL', 'redis://localhost:6379'); }
  override get options() { return { maxRetriesPerRequest: 3 }; }
}
@Controller('/app')
class AppController { @Get('/') get() { return {}; } }
// ---cut---
const app = createApp([http({
    controllers: [AppController],
  })], { configs: [CustomRedisConfig] });
```

## API Reference

### RedisKVAdaptor

| Method | Description |
|--------|-------------|
| `namespace(prefix)` | Returns a namespaced `AtomicKVStore` |

`RedisKVAdaptor` participates in the application lifecycle. The underlying ioredis connection is owned by `RedisService` and is disconnected automatically on shutdown (see [Graceful Shutdown](#graceful-shutdown)).

### AtomicKVStore Methods

| Method | Description |
|--------|-------------|
| `get<T>(key)` | Retrieve a value, or `undefined` if missing |
| `set<T>(key, value, opts?)` | Store a value with optional TTL |
| `del(key)` | Delete a key |
| `has(key)` | Check if key exists |
| `expire(key, ttlSec)` | Update TTL for an existing key |
| `incr(key, by?, opts?)` | Atomic increment |
| `setnx<T>(key, value, opts?)` | Set if not exists |
| `namespace(prefix)` | Create nested namespace |

## Production Setup

For production deployments, configure connection pooling and retry behavior:

```typescript twoslash
import { Config } from '@zeltjs/core';
import { RedisConfig } from '@zeltjs/redis';
// ---cut---
@Config
class ProductionRedisConfig extends RedisConfig {
  override get options() {
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

You do not need to disconnect Redis manually. `RedisService` registers itself with the lifecycle manager, so application shutdown disconnects the ioredis client automatically.

The host owns the server created by `serve()`. On shutdown, stop accepting requests and wait for in-flight requests to finish before calling `nodeApp.shutdown()` to close Redis and other application resources. This example shows an explicit shutdown sequence; process signal handling is not shown.

```typescript twoslash
import { once } from 'node:events';
import { promisify } from 'node:util';
import { createApp, Controller, Get, http, inject } from '@zeltjs/core';
import { onNode, serve } from '@zeltjs/adapter-node';
import { RedisKVAdaptor } from '@zeltjs/kv/adaptor-redis';
import { RedisConfig } from '@zeltjs/redis';

@Controller('/app')
class AppController {
  constructor(private readonly cache = inject(RedisKVAdaptor)) {}

  @Get('/')
  get() {
    return this.cache.namespace('app:').get<string>('status');
  }
}

const app = createApp([http({ controllers: [AppController] })], { configs: [RedisConfig] });
// ---cut---
const nodeApp = await onNode(app);
const server = serve(nodeApp.http, { port: 3000 });
await once(server, 'listening');

// During host shutdown: drain HTTP requests before closing Redis and other resources
await promisify(server.close.bind(server))();
await nodeApp.shutdown();
```
