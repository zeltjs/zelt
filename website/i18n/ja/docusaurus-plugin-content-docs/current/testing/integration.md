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
import { ConfigClass } from '@zeltjs/core';
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function expect<T>(value: T): { toBe(expected: T): void; };
declare function createTestTarget<T extends object>(cls: new (...args: never[]) => T, opts?: { configs?: readonly ConfigClass<object>[] }): Promise<{ target: T; shutdown: () => Promise<void> }>;
import { RedisTestContainerConfig } from '@zeltjs/redis/testing';
declare class CacheService { set(key: string, value: string): Promise<void>; get(key: string): Promise<string>; }
// ---cut---
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
declare class GenericContainer {
  constructor(image: string);
  withEnvironment(env: Record<string, string>): this;
  withExposedPorts(port: number): this;
  start(): Promise<StartedTestContainer>;
}
declare interface StartedTestContainer {
  getHost(): string;
  getMappedPort(port: number): number;
  stop(): Promise<void>;
}
// ---cut---
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
import { ConfigClass } from '@zeltjs/core';
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function expect<T>(value: T): { toBe(expected: T): void; };
type TestTargetResult<T> = { target: T; get: <U>(cls: new (...args: never[]) => U) => U; shutdown: () => Promise<void> };
declare function createTestTarget<T extends object>(cls: new (...args: never[]) => T, opts?: { configs?: readonly ConfigClass<object>[] }): Promise<TestTargetResult<T>>;
import { RedisTestContainerConfig } from '@zeltjs/redis/testing';
declare class SessionService { create(data: { userId: string }): Promise<{ id: string }>; }
declare class UserService { fromSession(sessionId: string): Promise<{ id: string }>; }
// ---cut---
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
