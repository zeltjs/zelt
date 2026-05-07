---
sidebar_position: 4
---

# サービス

サービスは**ビジネスロジック**を処理し、コントローラーや他のサービスに**注入**できるクラスです。この関心の分離により、コードはよりテストしやすく保守しやすくなります。

## サービスの定義

サービスは`@Injectable()`デコレーターで装飾されたクラスです：

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

## 依存性注入

`inject()`を使用してサービスをコントローラーに注入します：

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

## サービス間の注入

サービスは他のサービスを注入できます：

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

## シングルトンスコープ

デフォルトで、サービスは**シングルトン**です。アプリケーションのライフサイクル内で同じインスタンスがすべての注入で共有されます。これは以下に最適です：

- データベース接続
- 設定サービス
- キャッシュサービス

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

## モックサービスを使ったテスト

シングルトンパターンにより、テストは簡単です。モック実装を提供できます：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createTestTarget } from '@zeltjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  it('should return all users', async () => {
    const mockUsers = [{ id: '1', name: 'John' }];
    
    const container = createTestTarget()
      .override(UserService, {
        findAll: () => mockUsers,
      });

    const controller = container.resolve(UserController);
    const result = controller.findAll();

    expect(result).toEqual({ users: mockUsers });
  });
});
```

## ベストプラクティス

1. **単一責任** — 各サービスは1つの明確な目的を持つべき
2. **インターフェース分離** — サービスメソッドは焦点を絞り凝集性を保つ
3. **依存性注入** — 依存関係は直接作成せず常に注入する
4. **テスト容易性** — サービスはテストで簡単にモックできるよう設計する
