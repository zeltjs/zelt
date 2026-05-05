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

A common pattern for environment-aware configuration:

```typescript
import { Config } from '@zeltjs/core';

@Config
export class AppConfig {
  static readonly Token = AppConfig;

  get environment() {
    return process.env.NODE_ENV ?? 'development';
  }

  get isDevelopment() {
    return this.environment === 'development';
  }

  get isProduction() {
    return this.environment === 'production';
  }

  get port() {
    return Number(process.env.PORT ?? 3000);
  }

  get apiBaseUrl() {
    return this.isProduction
      ? 'https://api.example.com'
      : 'http://localhost:3000';
  }
}
```
