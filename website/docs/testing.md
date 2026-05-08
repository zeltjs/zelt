---
---

# Testing

Zelt provides `@zeltjs/testing` package with utilities for testing your application, including dependency injection support and Testcontainers integration.

## Installation

```bash
pnpm add -D @zeltjs/testing vitest
```

## createTestTarget

`createTestTarget` is the primary testing utility for instantiating services with dependency injection. It automatically handles lifecycle management and cleanup.

```typescript
import { describe, it, expect } from 'vitest';
import { createTestTarget } from '@zeltjs/testing';
import { UserService } from './user.service';
import { ProcessEnvConfig } from '@zeltjs/core';

describe('UserService', () => {
  it('should create user', async () => {
    const { target, shutdown } = await createTestTarget(UserService, {
      configs: [ProcessEnvConfig],
    });

    const user = await target.create({ name: 'Alice' });
    expect(user.name).toBe('Alice');
  });
});
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `configs` | `Class[]` | Configuration classes to register |
| `overrides` | `Override[]` | Mock implementations for dependencies |

### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `target` | `T` | The instantiated service |
| `get` | `(cls) => T` | Resolve additional dependencies from the container |
| `shutdown` | `() => Promise<void>` | Cleanup function (auto-called via vitest `afterAll`) |

### Mocking Dependencies

Use `overrides` to replace real implementations with mocks:

```typescript
import { createTestTarget } from '@zeltjs/testing';
import { UserService } from './user.service';
import { EmailService } from './email.service';

describe('UserService', () => {
  it('should send welcome email', async () => {
    const mockEmailService = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    const { target } = await createTestTarget(UserService, {
      overrides: [
        { provide: EmailService, useValue: mockEmailService },
      ],
    });

    await target.register({ email: 'alice@example.com' });
    expect(mockEmailService.send).toHaveBeenCalledWith(
      'alice@example.com',
      expect.stringContaining('Welcome')
    );
  });
});
```

## HTTP Testing

Test your application's HTTP endpoints using Hono's built-in request helper:

```typescript
import { describe, it, expect } from 'vitest';
import { app } from './app';

describe('Hello API', () => {
  it('should return greeting', async () => {
    const res = await app.request('/hello/world');
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'Hello, world!' });
  });
});
```

## Testing with Type-Safe Client

Use the generated `AppType` with Hono's client for fully typed tests. See [OpenAPI & Type Generation](./openapi.md) for how to generate `AppType`.

```typescript
import { hc } from 'hono/client';
import { describe, it, expect } from 'vitest';
import { app } from './app';
import type { AppType } from './generated/app.gen';

describe('Hello API', () => {
  const client = hc<AppType>('http://localhost', {
    fetch: (input, init) => app.fetch(new Request(input, init)),
  });

  it('should return greeting with type safety', async () => {
    const res = await client.hello[':name'].$get({ 
      param: { name: 'world' } 
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Hello, world!');
  });
});
```

## Testcontainers Integration

For integration tests that require external services like Redis, use Testcontainers. Zelt provides pre-configured container configs that integrate with the lifecycle system.

### Redis Integration Testing

```bash
pnpm add -D @zeltjs/testing testcontainers
```

```typescript
import { describe, it, expect } from 'vitest';
import { createTestTarget } from '@zeltjs/testing';
import { RedisTestContainerConfig } from '@zeltjs/testing/redis';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  it('should cache values in Redis', async () => {
    const { target } = await createTestTarget(CacheService, {
      configs: [RedisTestContainerConfig],
    });

    await target.set('key', 'value');
    const result = await target.get('key');
    
    expect(result).toBe('value');
  });
});
```

`RedisTestContainerConfig` automatically:
- Starts a Redis container before tests
- Provides connection URL to services depending on `RedisConfig`
- Stops and cleans up the container after tests

### Custom Container Config

Create your own container config by implementing the `Lifecycle` interface:

```typescript
import { Config, inject, LifecycleManager, type Lifecycle } from '@zeltjs/core';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

@Config
export class PostgresTestContainerConfig implements Lifecycle {
  private container: StartedTestContainer | undefined;
  private connectionUrl = '';

  constructor(lifecycle = inject(LifecycleManager)) {
    lifecycle.register(this);
  }

  async startup(): Promise<void> {
    this.container = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'testdb',
      })
      .withExposedPorts(5432)
      .start();

    const host = this.container.getHost();
    const port = this.container.getMappedPort(5432);
    this.connectionUrl = `postgres://test:test@${host}:${port}/testdb`;
  }

  async shutdown(): Promise<void> {
    await this.container?.stop();
  }

  get url(): string {
    return this.connectionUrl;
  }
}
```

## Lifecycle Management

`createTestTarget` automatically manages the lifecycle of your dependencies:

1. **Startup**: All registered `Lifecycle` implementations are started before tests
2. **Shutdown**: Cleanup is automatically called via vitest's `afterAll` hook

This means Testcontainers and other resources are properly cleaned up even if tests fail.
