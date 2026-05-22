---
---

# Configuration

Zelt provides a type-safe configuration system using the `@Config` decorator and `inject()` helper.

:::info Migration Note
As of version X.X, use `inject(Env)` instead of `inject(EnvConfig)` or `inject(EnvService)`.
The old classes are deprecated and will be removed in the next major version.
:::

## Defining Configuration

Use the `@Config` decorator to define a configuration class. Each config class must have a static `Token` property:

```typescript
import { Config, Env, inject } from '@zeltjs/core';

@Config
export class DatabaseConfig {
  static readonly Token = DatabaseConfig;

  constructor(private env = inject(Env)) {}

  get host() {
    return this.env.getString('DATABASE_HOST', 'localhost');
  }

  get port() {
    return this.env.getNumber('DATABASE_PORT', 5432);
  }

  get connectionString() {
    return `postgres://${this.host}:${this.port}/mydb`;
  }
}
```

## Using Configuration

Inject configuration into services or controllers using `inject()`:

```typescript
import { Injectable, inject, Config, Env } from '@zeltjs/core';

@Config
class DatabaseConfig {
  static readonly Token = DatabaseConfig;
  constructor(private env = inject(Env)) {}
  get host() { return this.env.getString('DATABASE_HOST', 'localhost'); }
  get port() { return this.env.getNumber('DATABASE_PORT', 5432); }
  get connectionString() { return `postgres://${this.host}:${this.port}/mydb`; }
}
// ---cut---
@Injectable()
export class DatabaseService {
  constructor(private config = inject(DatabaseConfig)) {}

  connect() {
    return this.config.connectionString;
  }
}
```

## Registering Configuration

Register config classes when creating the app:

```typescript
import { createApp, Config, Env, inject, Controller, Get } from '@zeltjs/core';

@Config
class DatabaseConfig {
  static readonly Token = DatabaseConfig;
  constructor(private env = inject(Env)) {}
  get host() { return this.env.getString('DATABASE_HOST', 'localhost'); }
  get port() { return this.env.getNumber('DATABASE_PORT', 5432); }
  get connectionString() { return `postgres://${this.host}:${this.port}/mydb`; }
}
@Controller('/') class AppController { @Get('/') index() { return { ok: true }; } }
// ---cut---
const app = createApp({
  http: {
    controllers: [AppController],
  },
  configs: [DatabaseConfig],
});
```

## Overriding Configuration

Override configuration values for testing by extending the config class:

```typescript
import { Config, createApp, Env, inject } from '@zeltjs/core';
declare class AppController {}
@Config
class DatabaseConfig {
  static readonly Token = DatabaseConfig;
  constructor(private env = inject(Env)) {}
  get host() { return this.env.getString('DATABASE_HOST', 'localhost'); }
  get port() { return this.env.getNumber('DATABASE_PORT', 5432); }
  get connectionString() { return `postgres://${this.host}:${this.port}/mydb`; }
}
// ---cut---
@Config
export class TestDatabaseConfig extends DatabaseConfig {
  override get host() {
    return 'test-db';
  }

  override get port() {
    return 5433;
  }
}

// In test setup
const app = createApp({
  http: {
    controllers: [AppController],
  },
  configs: [TestDatabaseConfig],
});
```

The `Token` property is inherited from the parent class, so `inject(DatabaseConfig)` will receive the overridden `TestDatabaseConfig` instance.

## Environment-Based Configuration

`inject(Env)` reads environment variables from the platform-specific source registered by the adapter. No additional setup is needed for the common case.

### Node.js Environment

When using `onNode()`, `ProcessEnvSource` is registered automatically, so `inject(Env)` reads from `process.env` without any extra config:

```typescript
import { Config, Env, inject, createApp, Controller, Get } from '@zeltjs/core';

@Controller('/') class AppController { @Get('/') index() { return { ok: true }; } }
// ---cut---
@Config
export class DatabaseConfig {
  static readonly Token = DatabaseConfig;

  constructor(private env = inject(Env)) {}

  get host() {
    return this.env.getString('DATABASE_HOST', 'localhost');
  }

  get port() {
    return this.env.getNumber('DATABASE_PORT', 5432);
  }

  get connectionString() {
    return `postgres://${this.host}:${this.port}/mydb`;
  }
}

const app = createApp({
  http: {
    controllers: [AppController],
  },
  configs: [DatabaseConfig],
});
```

### Loading `.env` Files

To load a `.env` file, import `dotenv/config` at the entry point of your application before anything else:

```typescript
// @errors: 2882
import 'dotenv/config';
import { onNode } from '@zeltjs/adapter-node';
// ...rest of app setup
```

`inject(Env)` will then read the variables populated by dotenv from `process.env`.

### Cloudflare Workers Environment

For Cloudflare Workers, environment configuration is handled automatically by `onCloudflareWorkers()`. See the [Cloudflare Workers Getting Started guide](./getting-started/cloudflare-workers) for details.

## TypeScript Decorator Configuration

Zelt supports both TC39 standard decorators and legacy TypeScript decorators. The framework automatically detects which mode is being used at runtime.

### TC39 Standard Decorators (Recommended)

For new projects, use TC39 standard decorators. No special TypeScript configuration is needed:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext"
  }
}
```

### Legacy Decorators

For compatibility with existing codebases, enable legacy decorators:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "experimentalDecorators": true
  }
}
```

### Detection Behavior

Zelt automatically detects the decorator mode based on the runtime context:

- **TC39 mode**: Decorator receives a context object with `kind`, `name`, and `metadata` properties
- **Legacy mode**: Decorator receives `target`, `propertyKey`, and `descriptor` arguments

Both modes work identically from an API perspective—you don't need to change your code when switching between them.
