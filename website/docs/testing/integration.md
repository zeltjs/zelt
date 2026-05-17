---
---

# Integration Testing

For integration tests that require external services like Redis or PostgreSQL, use Testcontainers. Zelt provides pre-configured container configs that integrate with the lifecycle system.

## Installation

```bash
pnpm add -D @zeltjs/testing testcontainers
```

## Redis Integration Testing

```typescript
import { describe, it, expect } from 'vitest';
import { createTestTarget } from '@zeltjs/testing/vitest';
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

## Custom Container Config

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

## Sociable Unit Tests

Integration tests with Testcontainers are ideal for "Sociable Unit Tests" — testing units that collaborate with real dependencies rather than mocks:

```typescript
import { describe, it, expect } from 'vitest';
import { createTestTarget } from '@zeltjs/testing/vitest';
import { RedisTestContainerConfig } from '@zeltjs/testing/redis';
import { SessionService } from './session.service';
import { UserService } from './user.service';

describe('SessionService with real Redis', () => {
  it('should persist session across service calls', async () => {
    const { target, get } = await createTestTarget(SessionService, {
      configs: [RedisTestContainerConfig],
    });

    const userService = get(UserService);
    const session = await target.create({ userId: '123' });
    
    const user = await userService.fromSession(session.id);
    expect(user.id).toBe('123');
  });
});
```
