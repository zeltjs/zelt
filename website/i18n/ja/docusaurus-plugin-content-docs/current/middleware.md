---
sidebar_position: 4
---

# ミドルウェア

ミドルウェア関数はルートハンドラーの前に実行され、リクエスト、レスポンス、コンテキストを変更できます。

## 関数ミドルウェア

最もシンプルなミドルウェアは、コンテキストとnext関数を受け取る関数です：

```typescript
import type { FunctionMiddleware } from '@koya/core';

export const loggingMiddleware: FunctionMiddleware = async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`[${c.req.method}] ${c.req.path} ${c.res.status} ${duration}ms`);
};
```

## ミドルウェアのレベル

Koyaは3つのレベルでミドルウェアをサポートし、**グローバル → コントローラー → メソッド**の順序で実行されます。

### グローバルミドルウェア

`createHttpApp()`ですべてのルートに適用：

```typescript
import { createHttpApp } from '@koya/core';
import { loggingMiddleware } from './middlewares/logging';

export const app = createHttpApp({
  controllers: [UserController],
  middlewares: [loggingMiddleware],
});
```

### コントローラーミドルウェア

`@UseMiddleware`でコントローラー内のすべてのメソッドに適用：

```typescript
import { Controller, Get, UseMiddleware } from '@koya/core';

@UseMiddleware(authMiddleware)
@Controller('/admin')
export class AdminController {
  @Get('/dashboard')
  dashboard() {
    return { stats: [] };
  }
}
```

### メソッドミドルウェア

特定のメソッドにのみ適用：

```typescript
@Controller('/posts')
export class PostController {
  @Get('/')
  findAll() {
    return { posts: [] };
  }

  @UseMiddleware(adminOnlyMiddleware)
  @Delete('/:id')
  remove(id = pathParam('id')) {
    return { deleted: id };
  }
}
```

## ミドルウェアのスキップ

`@SkipMiddleware`を使用して特定のメソッドからミドルウェアを除外：

```typescript
import { Controller, Get, SkipMiddleware } from '@koya/core';

@Controller('/api')
export class ApiController {
  @Get('/protected')
  protected() {
    return { secret: 'data' };
  }

  @SkipMiddleware(authMiddleware)
  @Get('/health')
  health() {
    return { status: 'ok' };
  }
}
```

## コンテキストの共有

ミドルウェアは`setContext()`と`getContext()`を通じてハンドラーとデータを共有できます。

### 型安全なコンテキスト

モジュール拡張を使用してコンテキストの型を定義：

```typescript
declare module '@koya/core' {
  interface KoyaContextSchema {
    user: { id: number; name: string };
  }
}
```

### ミドルウェアでのコンテキスト設定

```typescript
import type { FunctionMiddleware } from '@koya/core';

export const authMiddleware: FunctionMiddleware = async (c, next) => {
  const token = c.req.header('Authorization');
  const user = await verifyToken(token);
  c.set('user', user);
  await next();
};
```

### ハンドラーでのコンテキスト読み取り

```typescript
import { Controller, Get, getContext } from '@koya/core';

@Controller('/profile')
export class ProfileController {
  @Get('/')
  getProfile() {
    const user = getContext('user');
    return { id: user?.id, name: user?.name };
  }
}
```

## クラスミドルウェア

依存性注入が必要なミドルウェアには`@Middleware`を使用：

```typescript
import { Middleware, inject, Injectable } from '@koya/core';
import type { KoyaContext, KoyaNext } from '@koya/core';

@Injectable()
class ConfigService {
  getSecret() {
    return process.env.SECRET;
  }
}

@Middleware
export class AuthMiddleware {
  constructor(private config = inject(ConfigService)) {}

  async use(c: KoyaContext, next: KoyaNext): Promise<Response | undefined> {
    const secret = this.config.getSecret();
    // ... 認証ロジック
    await next();
    return undefined;
  }
}
```

クラスミドルウェアは関数ミドルウェアと同様に使用：

```typescript
@UseMiddleware(AuthMiddleware)
@Controller('/admin')
export class AdminController {
  // ...
}
```

## 実行順序

ミドルウェアは以下の順序で実行されます：

1. **グローバルミドルウェア**（配列順）
2. **コントローラーミドルウェア**（デコレーター順）
3. **メソッドミドルウェア**（デコレーター順）
4. **ルートハンドラー**
5. **ハンドラー後のミドルウェア**（`next()`後、逆順）

```typescript
const globalMw: FunctionMiddleware = async (c, next) => {
  console.log('1. global before');
  await next();
  console.log('6. global after');
};

const controllerMw: FunctionMiddleware = async (c, next) => {
  console.log('2. controller before');
  await next();
  console.log('5. controller after');
};

const methodMw: FunctionMiddleware = async (c, next) => {
  console.log('3. method before');
  await next();
  console.log('4. method after');
};
```
