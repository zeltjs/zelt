---
---

# Logging

Zelt provides a built-in `Logger` module with structured logging, configurable transports, and context propagation.

## Basic Usage

Inject the `Logger` into your services or controllers:

```typescript
import { Injectable, inject } from '@zeltjs/core';
import { Logger } from '@zeltjs/core/modules/logger';

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

## Structured Logging

Pass context as the second argument to include structured data:

```typescript
this.logger.info('Order processed', { orderId, userId, duration: 150 });
// Output: 13:45:23 INFO  Order processed {"orderId":"123","userId":"456","duration":150}
```

## Child Loggers

Create child loggers with bound context that persists across all log calls:

```typescript
@Injectable()
export class OrderService {
  private logger: Logger;

  constructor(baseLogger = inject(Logger)) {
    this.logger = baseLogger.child({ service: 'OrderService' });
  }

  processOrder(orderId: string) {
    const orderLogger = this.logger.child({ orderId });
    orderLogger.info('Processing started');
    // Output includes: {"service":"OrderService","orderId":"123"}
  }
}
```

## Global Context with withLogContext

Use `withLogContext` to propagate context across async boundaries using `AsyncLocalStorage`:

```typescript
import { withLogContext, Logger } from '@zeltjs/core/modules/logger';

const logger = inject(Logger);

withLogContext({ requestId: 'abc-123' }, () => {
  logger.info('Request received');
  // Context is automatically included in all logs within this scope
  someService.process();
});
```

## Configuration

### Basic Configuration

Configure the Logger using `LoggerConfig`:

```typescript
import { Config, inject } from '@zeltjs/core';
import {
  LoggerConfig,
  ConsoleTransport,
  JsonlFormatter,
  type TransportBinding,
  type LogLevel,
} from '@zeltjs/core/modules/logger';

@Config
export class AppLoggerConfig extends LoggerConfig {
  constructor(
    private console = inject(ConsoleTransport),
    private jsonl = inject(JsonlFormatter),
  ) {
    super();
  }

  override get level(): LogLevel {
    return (process.env.LOG_LEVEL as LogLevel) ?? 'info';
  }

  override get transports(): readonly TransportBinding[] {
    return [{ transport: this.console, formatter: this.jsonl }];
  }
}
```

### Using PrettyFormatter

For human-readable output in development, use `PrettyFormatter`:

```typescript
import { Config, inject } from '@zeltjs/core';
import {
  LoggerConfig,
  ConsoleTransport,
  PrettyFormatter,
  type TransportBinding,
} from '@zeltjs/core/modules/logger';

@Config
export class DevLoggerConfig extends LoggerConfig {
  constructor(
    private console = inject(ConsoleTransport),
    private pretty = inject(PrettyFormatter),
  ) {
    super();
  }

  override get level() {
    return 'debug' as const;
  }

  override get transports(): readonly TransportBinding[] {
    return [{ transport: this.console, formatter: this.pretty }];
  }
}
```

`PrettyFormatter` outputs colored logs in TTY environments:

```
13:45:23 INFO  Order processed {"orderId":"123"}
13:45:23 ERROR Failed to process {"error":"timeout"}
```

Register the config when creating the app:

```typescript
import { createHttpApp } from '@zeltjs/core';
import { AppLoggerConfig } from './logger.config';
import { AppController } from './app.controller';

const app = createHttpApp({
  controllers: [AppController],
  configs: [AppLoggerConfig],
});
```

## Transports and Formatters

The Logger uses a pluggable transport/formatter architecture:

| Component           | Description                                    |
| ------------------- | ---------------------------------------------- |
| `ConsoleTransport`  | Writes to stdout/stderr                        |
| `JsonlFormatter`    | JSON Lines format (one JSON object per line)   |
| `PrettyFormatter`   | Human-readable format with optional colors     |

### Custom Transport

Implement `LoggerTransport` for custom output destinations:

```typescript
import type { LoggerTransport } from '@zeltjs/core/modules/logger';

export class FileTransport implements LoggerTransport {
  write(message: string): void {
    // Write to file
  }
}
```

### Custom Formatter

Implement `LoggerFormatter` for custom output formats:

```typescript
import type { LoggerFormatter, LogEntry } from '@zeltjs/core/modules/logger';

export class CustomFormatter implements LoggerFormatter {
  format(entry: LogEntry): string {
    return `[${entry.level}] ${entry.message}`;
  }
}
```

## Default Behavior

Without custom configuration:
- Level: `'info'` (debug messages are suppressed)
- Transport: `ConsoleTransport`
- Formatter: `JsonlFormatter`
