---
sidebar_position: 9
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

Register config classes when creating the HTTP app:

```typescript
import { createHttpApp } from '@zeltjs/core';
import { DatabaseConfig } from './database.config';
import { AppController } from './app.controller';

const app = createHttpApp({
  controllers: [AppController],
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
const app = createHttpApp({
  controllers: [AppController],
  configs: [TestDatabaseConfig],
});
```

The `Token` property is inherited from the parent class, so `injectConfig(DatabaseConfig)` will receive the overridden `TestDatabaseConfig` instance.

## Environment-Based Configuration

Zelt provides built-in config classes for environment variables:

### ProcessEnvConfig

Reads from `process.env` directly:

```typescript
import { Config, ProcessEnvConfig, injectConfig } from '@zeltjs/core';

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
const app = createHttpApp({
  controllers: [AppController],
  configs: [ProcessEnvConfig, DatabaseConfig],
});
```

### DotEnvConfig

Loads `.env` files using [dotenv](https://github.com/motdotla/dotenv), then reads from `process.env`:

```typescript
import { Config, DotEnvConfig, injectConfig } from '@zeltjs/core';

@Config
export class DatabaseConfig {
  static readonly Token = DatabaseConfig;

  constructor(private env = injectConfig(DotEnvConfig)) {}

  get host() {
    return this.env.get('DATABASE_HOST') ?? 'localhost';
  }
}

// DotEnvConfig loads .env on construction
const app = createHttpApp({
  controllers: [AppController],
  configs: [DotEnvConfig, DatabaseConfig],
});
```

### Custom Env Paths

Extend `DotEnvConfig` to load from custom paths:

```typescript
import { Config, DotEnvConfig } from '@zeltjs/core';

@Config
export class MyEnvConfig extends DotEnvConfig {
  protected override readonly paths = ['.env', '.env.local'];
}
```

