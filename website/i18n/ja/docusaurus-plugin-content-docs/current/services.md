---
---

# Services

Services are classes that handle **business logic** and can be **injected** into controllers or other services. This separation of concerns makes your code more testable and maintainable.

## Defining Services

A service is a class decorated with `@Injectable()`:

```typescript
import { Injectable } from '@zeltjs/core';

@Injectable()
export class UserService {
  private users = new Map<string, { id: string; name: string }>();

  findAll() {
    return Array.from(this.users.values());
  }

  findOne(id: string) {
    return this.users.get(id);
  }

  create(name: string) {
    const id = crypto.randomUUID();
    const user = { id, name };
    this.users.set(id, user);
    return user;
  }
}
```

## Dependency Injection

Use `inject()` to inject services into controllers:

```typescript
import { Controller, Get, Post, inject, pathParam, Injectable } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
import * as v from 'valibot';

@Injectable() class UserService {
  private users = new Map<string, { id: string; name: string }>();
  findAll() { return Array.from(this.users.values()); }
  findOne(id: string) { return this.users.get(id); }
  create(name: string) { const id = crypto.randomUUID(); const user = { id, name }; this.users.set(id, user); return user; }
}

const CreateUserBody = v.object({ name: v.string() });
// ---cut---
@Controller('/users')
export class UserController {
  constructor(private userService = inject(UserService)) {}

  @Get('/')
  findAll() {
    return { users: this.userService.findAll() };
  }

  @Get('/:id')
  findOne(id = pathParam('id')) {
    const user = this.userService.findOne(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  @Post('/')
  create(body = validated(CreateUserBody)) {
    return this.userService.create(body.name);
  }
}
```

## Service-to-Service Injection

Services can inject other services:

```typescript
import { Injectable, inject } from '@zeltjs/core';

@Injectable() class DatabaseService { query(sql: string) { return Promise.resolve([]); } }
@Injectable() class LoggerService { log(msg: string) { console.log(msg); } }
// ---cut---
@Injectable()
export class UserService {
  constructor(
    private db = inject(DatabaseService),
    private logger = inject(LoggerService)
  ) {}

  async findAll() {
    this.logger.log('Finding all users');
    return this.db.query('SELECT * FROM users');
  }
}
```

## Singleton Scope

By default, services are **singletons** — the same instance is shared across all injections within the application lifecycle. This is ideal for:

- Database connections
- Configuration services
- Caching services

```typescript
import { Injectable, Env, inject } from '@zeltjs/core';

@Injectable()
export class ConfigService {
  constructor(private env = inject(Env)) {}

  get databaseUrl() {
    return this.env.getString('DATABASE_URL');
  }

  get apiKey() {
    return this.env.getString('API_KEY');
  }
}
```

:::tip
For configuration, prefer using `@Config` classes with `inject()`. See [Configuration](./configuration.md) for details.
:::

## Testing with Mock Services

The singleton pattern makes testing straightforward — you can provide mock implementations:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Controller, Get, inject, Injectable } from '@zeltjs/core';

@Injectable() class UserService { findAll(): { id: string; name: string }[] { return []; } }
@Controller('/users') class UserController {
  constructor(private userService = inject(UserService)) {}
  @Get('/') findAll() { return { users: this.userService.findAll() }; }
}
type TestContainer = { override(cls: unknown, impl: unknown): TestContainer; resolve<T>(cls: new (...args: never[]) => T): T; };
declare function createTestContainer(): TestContainer;
// ---cut---
describe('UserController', () => {
  it('should return all users', async () => {
    const mockUsers = [{ id: '1', name: 'John' }];
    
    const container = createTestContainer()
      .override(UserService, {
        findAll: () => mockUsers,
      });

    const controller = container.resolve(UserController);
    const result = controller.findAll();

    expect(result).toEqual({ users: mockUsers });
  });
});
```

## Best Practices

1. **Single Responsibility** — Each service should have one clear purpose
2. **Interface Segregation** — Keep service methods focused and cohesive
3. **Dependency Injection** — Always inject dependencies rather than creating them directly
4. **Testability** — Design services to be easily mockable in tests
