---
---

# Configuration

Zelt provides a type-safe configuration system using the `@Config` decorator and `injectConfig()` helper.

## Defining Configuration

Use the `@Config` decorator to define a configuration class. Each config class must have a static `Token` property:

```typescript
import { Config } from '@zeltjs/core';

@Config
export class DatabaseConfig {
  static readonly Token = DatabaseConfig;

  get host() {
    return process.env.DATABASE_HOST ?? 'localhost';
  }

  get port() {
    return Number(process.env.DATABASE_PORT ?? 5432);
  }

  get connectionString() {
    return `postgres://${this.host}:${this.port}/mydb`;
  }
}
```

## Using Configuration

Inject configuration into services or controllers using `injectConfig()`:

```typescript
import { Injectable, injectConfig } from '@zeltjs/core';
import { DatabaseConfig } from './database.config';

@Injectable()
export class DatabaseService {
  constructor(private config = injectConfig(DatabaseConfig)) {}

  connect() {
    return this.config.connectionString;
  }
}
```

## Registering Configuration

Register config classes when creating the app:

```typescript
import { createApp } from '@zeltjs/core';
import { DatabaseConfig } from './database.config';
import { AppController } from './app.controller';

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
import { Config } from '@zeltjs/core';
import { DatabaseConfig } from './database.config';

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

The `Token` property is inherited from the parent class, so `injectConfig(DatabaseConfig)` will receive the overridden `TestDatabaseConfig` instance.

## Environment-Based Configuration

Zelt provides environment configuration through platform-specific adapters.

### Node.js Environment

For Node.js applications, use the configs from `@zeltjs/adapter-node`:

#### ProcessEnvConfig

Reads from `process.env` directly:

```typescript
import { Config, injectConfig } from '@zeltjs/core';
import { ProcessEnvConfig } from '@zeltjs/adapter-node';

@Config
export class DatabaseConfig {
  static readonly Token = DatabaseConfig;

  constructor(private env = injectConfig(ProcessEnvConfig)) {}

  get host() {
    return this.env.get('DATABASE_HOST') ?? 'localhost';
  }

  get port() {
    return Number(this.env.get('DATABASE_PORT') ?? 5432);
  }

  get connectionString() {
    return `postgres://${this.host}:${this.port}/mydb`;
  }
}

// Register both configs
const app = createApp({
  http: {
    controllers: [AppController],
  },
  configs: [ProcessEnvConfig, DatabaseConfig],
});
```

#### DotEnvConfig

Loads `.env` files using [dotenv](https://github.com/motdotla/dotenv), then reads from `process.env`:

```typescript
import { Config, injectConfig } from '@zeltjs/core';
import { DotEnvConfig } from '@zeltjs/adapter-node';

@Config
export class DatabaseConfig {
  static readonly Token = DatabaseConfig;

  constructor(private env = injectConfig(DotEnvConfig)) {}

  get host() {
    return this.env.get('DATABASE_HOST') ?? 'localhost';
  }
}

// DotEnvConfig loads .env on construction
const app = createApp({
  http: {
    controllers: [AppController],
  },
  configs: [DotEnvConfig, DatabaseConfig],
});
```

#### Custom Env Paths

Extend `DotEnvConfig` to load from custom paths:

```typescript
import { Config } from '@zeltjs/core';
import { DotEnvConfig } from '@zeltjs/adapter-node';

@Config
export class MyEnvConfig extends DotEnvConfig {
  protected override readonly paths = ['.env', '.env.local'];
}
```

### Cloudflare Workers Environment

For Cloudflare Workers, environment configuration is handled automatically by `onCloudflareWorkers()`. See the [Cloudflare Workers Getting Started guide](/getting-started/cloudflare-workers) for details.

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

