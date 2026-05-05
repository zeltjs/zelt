---
sidebar_position: 4
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
import { Controller, Get, Post, inject, pathParam, validated } from '@zeltjs/core';
import * as v from 'valibot';
import { UserService } from './user.service';

const CreateUserBody = v.object({
  name: v.string(),
});

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
import { DatabaseService } from './database.service';
import { LoggerService } from './logger.service';

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
@Injectable()
export class ConfigService {
  private config: Record<string, string>;

  constructor() {
    this.config = {
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      API_KEY: process.env.API_KEY ?? '',
    };
  }

  get(key: string): string {
    return this.config[key] ?? '';
  }
}
```

## Testing with Mock Services

The singleton pattern makes testing straightforward — you can provide mock implementations:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createTestContainer } from '@zeltjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

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
