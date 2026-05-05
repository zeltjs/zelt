---
sidebar_position: 10
---

# Logging

Koya provides a built-in `Logger` module with configurable log levels.

## Basic Usage

Inject the `Logger` into your services or controllers:

```typescript
import { Injectable, inject } from '@koya/core';
import { Logger } from '@koya/core/modules/logger';

@Injectable()
export class OrderService {
  constructor(private logger = inject(Logger)) {}

  processOrder(orderId: string) {
    this.logger.info(`Processing order: ${orderId}`);

    try {
      // ... process order
      this.logger.debug('Order validation passed');
    } catch (error) {
      this.logger.error(`Failed to process order: ${orderId}`);
      throw error;
    }
  }
}
```

## Log Levels

The Logger supports four log levels in order of severity:

| Level   | Method           | Description                     |
| ------- | ---------------- | ------------------------------- |
| `debug` | `logger.debug()` | Detailed debugging information  |
| `info`  | `logger.info()`  | General informational messages  |
| `warn`  | `logger.warn()`  | Warning messages                |
| `error` | `logger.error()` | Error messages                  |

Messages are only output if their level is equal to or higher than the configured level. For example, with `level: 'info'`, `debug()` messages are suppressed.

## Configuration

Configure the Logger using `LoggerConfig`:

```typescript
import { Config } from '@koya/core';
import { LoggerConfig } from '@koya/core/modules/logger';

@Config
export class AppLoggerConfig extends LoggerConfig {
  override get level(): 'debug' | 'info' | 'warn' | 'error' {
    return process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' ?? 'info';
  }
}
```

Register the config when creating the app:

```typescript
import { createHttpApp } from '@koya/core';
import { AppLoggerConfig } from './logger.config';
import { AppController } from './app.controller';

const app = createHttpApp({
  controllers: [AppController],
  configs: [AppLoggerConfig],
});
```

## Default Behavior

Without custom configuration, the Logger uses `'info'` as the default level, meaning `debug()` messages are suppressed while `info()`, `warn()`, and `error()` messages are output.
