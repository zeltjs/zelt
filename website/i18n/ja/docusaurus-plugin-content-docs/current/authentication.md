---
sidebar_position: 4.5
---

# 認証・認可

Zeltは認証状態の管理とロールベースアクセス制御のための軽量なプリミティブを提供します。

## 概要

認証APIは以下で構成されます：

- **`setUser(user, roles)`** — ミドルウェアで認証済みユーザーとロールを設定
- **`currentUser()`** — ハンドラーで現在のユーザーを取得
- **`currentRoles()`** — 現在のユーザーのロールを取得
- **`@Authorized(roles?)`** — アクセス制御のための宣言的デコレータ

## 認証のセットアップ

認証は通常ミドルウェアで処理します。Zeltは特定の認証戦略を規定しません。JWT、セッションCookie、APIキーなど、ニーズに合った方法を使用してください。

### 認証ミドルウェア

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';

export const jwtAuth: FunctionMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (token) {
    const payload = await verifyJwt(token);
    setUser(
      { id: payload.sub, name: payload.name },
      payload.roles // 例: ['admin', 'user']
    );
  }
  
  await next();
};
```

### グローバルミドルウェアとして登録

```typescript
import { createHttpApp } from '@zeltjs/core';

const app = createHttpApp({
  controllers: [UserController, AdminController],
  middlewares: [jwtAuth],
});
```

## 認証状態の使用

### ハンドラー内で

`currentUser()`と`currentRoles()`で認証状態にアクセス：

```typescript
import { Controller, Get } from '@zeltjs/core';
import { currentUser, currentRoles } from '@zeltjs/core';

@Controller('/profile')
class ProfileController {
  @Get('/me')
  me() {
    const user = currentUser();
    const roles = currentRoles();
    
    return {
      user,
      roles,
      isAdmin: roles.includes('admin'),
    };
  }
}
```

### デフォルトパラメータで

デフォルトパラメータでハンドラーシグネチャを簡潔に：

```typescript
@Controller('/profile')
class ProfileController {
  @Get('/me')
  me(user = currentUser()) {
    return user;
  }
}
```

## @Authorizedによる認可

`@Authorized`デコレータはメソッドレベルで宣言的なアクセス制御を提供します。

### 認証を要求

引数なしの`@Authorized()`で認証済みユーザーを要求：

```typescript
import { Controller, Get, Authorized } from '@zeltjs/core';

@Controller('/dashboard')
class DashboardController {
  @Authorized()
  @Get('/')
  index() {
    return { stats: [] };
  }
}
```

ユーザーが設定されていない場合は`401 Unauthorized`を返します：

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

### 特定のロールを要求

ロール名を渡してアクセスを制限：

```typescript
@Controller('/admin')
class AdminController {
  @Authorized(['admin'])
  @Get('/users')
  listUsers() {
    return { users: [] };
  }
  
  @Authorized(['admin', 'moderator'])
  @Delete('/posts/:id')
  removePost(id = pathParam('id')) {
    return { deleted: id };
  }
}
```

ユーザーが指定されたロールの**いずれか**を持っていればアクセスが許可されます（OR論理）。

ユーザーが必要なロールを持っていない場合は`403 Forbidden`を返します：

```json
{
  "code": "FORBIDDEN",
  "message": "Insufficient permissions"
}
```

## 型安全なユーザーコンテキスト

`RequestContextSchema`を拡張してユーザーオブジェクトを型付け：

```typescript
declare module '@zeltjs/core' {
  interface RequestContextSchema {
    user: {
      id: string;
      name: string;
      email: string;
    };
    authRoles: ('admin' | 'editor' | 'user')[];
  }
}
```

これで`currentUser()`と`setUser()`が完全に型付けされます：

```typescript
const user = currentUser();
// TypeScriptが認識: user?.id, user?.name, user?.email

setUser(
  { id: '123', name: 'Alice', email: 'alice@example.com' },
  ['admin', 'user']
);
```

## 認可フロー

```
リクエスト
    ↓
認証ミドルウェア
    ├── トークン有効? → setUser(user, roles)
    └── トークンなし? → 続行（userは未定義のまま）
    ↓
@Authorized()チェック
    ├── ユーザーなし? → 401 UNAUTHORIZED
    ├── ロール不足? → 403 FORBIDDEN
    └── OK → ルートハンドラー
    ↓
レスポンス
```

## 他のデコレータとの組み合わせ

`@Authorized`は他のメソッドデコレータと連携します：

```typescript
@Controller('/posts')
class PostController {
  @Authorized()
  @UseMiddleware(rateLimitMiddleware)
  @Post('/')
  create(body = bodyParam(CreatePostSchema)) {
    return { created: true };
  }
}
```

## @zeltjs/auth-jwtの使用

JWT認証には、Zeltが提供する`@zeltjs/auth-jwt`パッケージをすぐに使えるミドルウェアとサービスとともに使用できます。

### インストール

```bash
pnpm add @zeltjs/auth-jwt
```

### 基本セットアップ

1. `JWT_SECRET`環境変数を設定
2. `JwtMiddleware`と`JwtConfig`を登録：

```typescript
import { createHttpApp } from '@zeltjs/core';
import { JwtMiddleware, JwtConfig } from '@zeltjs/auth-jwt';

const app = createHttpApp({
  controllers: [UserController],
  middlewares: [JwtMiddleware],
  configs: [JwtConfig],
});
```

### トークンの生成

`JwtService`を使用してトークンに署名：

```typescript
import { Controller, Post, bodyParam, inject } from '@zeltjs/core';
import { JwtService } from '@zeltjs/auth-jwt';
import * as v from 'valibot';

const LoginSchema = v.object({
  email: v.string(),
  password: v.string(),
});

@Controller('/auth')
class AuthController {
  constructor(private jwtService = inject(JwtService)) {}

  @Post('/login')
  async login(body = bodyParam(LoginSchema)) {
    const user = await validateCredentials(body.email, body.password);
    const token = await this.jwtService.sign({ sub: user.id, roles: user.roles });
    return { token };
  }
}
```

### カスタム設定

`JwtConfig`を継承して動作をカスタマイズ：

```typescript
import { JwtConfig, type ResolveUserResult, type JwtPayload } from '@zeltjs/auth-jwt';
import { Config } from '@zeltjs/core';

@Config
class CustomJwtConfig extends JwtConfig {
  override get expiresIn(): string {
    return '7d';
  }

  override get resolveUser(): (payload: JwtPayload) => Promise<ResolveUserResult> {
    return async (payload) => {
      const user = await findUserById(payload.sub);
      return {
        user: { id: user.id, name: user.name, email: user.email },
        roles: user.roles,
      };
    };
  }
}
```

カスタム設定を登録：

```typescript
const app = createHttpApp({
  controllers: [AuthController, UserController],
  middlewares: [JwtMiddleware],
  configs: [CustomJwtConfig],
});
```

### JwtServiceメソッド

| メソッド | 説明 |
|--------|-------------|
| `sign(payload)` | 署名済みJWTトークンを作成 |
| `verify(token)` | トークンを検証・デコード（無効な場合はスロー） |
| `decode(token)` | 検証なしでデコード（エラー時は`null`を返す） |

## ベストプラクティス

1. **認証は早期に設定** — ルートハンドラーの前に実行されるよう、認証ミドルウェアをグローバルに登録
2. **型付きコンテキストを使用** — `RequestContextSchema`を拡張してユーザーオブジェクトの型安全性を確保
3. **ロールはシンプルに** — フラットなロール文字列を使用、複雑な権限ロジックはサービスに
4. **関心を分離** — ミドルウェアは認証、`@Authorized`は認可を担当
5. **デフォルトは安全に** — 保護されたルートでは手動チェックより`@Authorized()`を使用
