---
---

# Services

Serviceは**ビジネスロジック**を扱うクラスで、controllerや他のserviceへ**注入**できます。この関心の分離により、コードのテスタビリティと保守性が高まります。

## Defining Services {#defining-services}

serviceは`@Injectable()`でデコレートされたクラスです:

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

## Dependency Injection {#dependency-injection}

controllerへserviceを注入するには`inject()`を使います:

```typescript
import { Controller, Get, Post, inject, Injectable } from '@zeltjs/core';
import { request } from '@zeltjs/core';
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
  findOne(req = request()) {
    const id = req.pathParam('id');
    const user = this.userService.findOne(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  @Post('/')
  async create(req = request(CreateUserBody)) {
    const body = await req.body();
    return this.userService.create(body.name);
  }
}
```

## Service-to-Service Injection {#service-to-service-injection}

Serviceは他のserviceを注入できます:

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

## Singleton Scope {#singleton-scope}

デフォルトでは、serviceは**singleton**です — アプリケーションのライフサイクル内で、全ての注入先で同じインスタンスが共有されます。これは次のようなケースに最適です:

- データベース接続
- 設定service
- キャッシュservice

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
設定には、`inject()`と組み合わせた`@Config`クラスの使用を推奨します。詳細は[Configuration](./configuration.md)を参照してください。
:::

## Testing with Mock Services {#testing-with-mock-services}

singletonパターンによりテストが容易になります — モック実装を渡すことができます:

```typescript
import { describe, it, expect } from 'vitest';
import { Controller, Get, inject, Injectable } from '@zeltjs/core';
import { createTestTarget } from '@zeltjs/testing';

@Injectable() class UserService { findAll(): { id: string; name: string }[] { return []; } }
@Controller('/users') class UserController {
  constructor(private userService = inject(UserService)) {}
  @Get('/') findAll() { return { users: this.userService.findAll() }; }
}
// ---cut---
describe('UserController', () => {
  it('should return all users', async () => {
    const mockUsers = [{ id: '1', name: 'John' }];

    const { target } = await createTestTarget(UserController, {
      overrides: [{ provide: UserService, useValue: { findAll: () => mockUsers } as UserService }],
    });

    const result = target.findAll();

    expect(result).toEqual({ users: mockUsers });
  });
});
```

## Best Practices {#best-practices}

1. **Single Responsibility** — 各serviceは明確な単一の目的を持つべき
2. **Interface Segregation** — serviceのメソッドは焦点を絞り、凝集度を保つ
3. **Dependency Injection** — 依存は直接生成せず、常に注入する
4. **Testability** — テストで容易にモック化できるようserviceを設計する
