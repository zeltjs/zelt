---
sidebar_position: 3
---

# JWT認証

`@zeltjs/auth-jwt`はSPA、モバイルアプリ、API向けのステートレスなJWTベース認証を提供します。

## インストール

```bash
pnpm add @zeltjs/auth-jwt
```

## クイックスタート

### 1. シークレットを設定

`JWT_SECRET`環境変数を設定：

```bash
# .env
JWT_SECRET=your-secret-key-at-least-32-characters
```

### 2. ミドルウェアを登録

```typescript
import { createApp } from '@zeltjs/core';
import { JwtMiddleware, JwtConfig } from '@zeltjs/auth-jwt';

const app = createApp({
  http: {
    controllers: [AuthController, UserController],
    middlewares: [JwtMiddleware],
  },
  configs: [JwtConfig],
});
```

### 3. トークンを生成

ログイン時に`JwtService`を使用してトークンに署名：

```typescript
import { Controller, Post, bodyParam, inject } from '@zeltjs/core';
import { JwtService } from '@zeltjs/auth-jwt';
import * as v from 'valibot';

const LoginSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.string(),
});

@Controller('/auth')
class AuthController {
  constructor(private jwtService = inject(JwtService)) {}

  @Post('/login')
  async login(body = bodyParam(LoginSchema)) {
    const user = await validateCredentials(body.email, body.password);
    if (!user) {
      throw new HTTPException(401, { message: '認証情報が無効です' });
    }
    
    const token = await this.jwtService.sign({
      sub: user.id,
      roles: user.roles,
    });
    
    return { token };
  }
}
```

### 4. ルートを保護

`@Authorized()`を使用して認証を要求：

```typescript
import { Controller, Get, Authorized, currentUser } from '@zeltjs/core';

@Controller('/users')
class UserController {
  @Authorized()
  @Get('/me')
  me(user = currentUser()) {
    return user;
  }
}
```

## JwtService API

| メソッド | 説明 |
|----------|------|
| `sign(payload)` | 署名済みJWTトークンを作成 |
| `verify(token)` | トークンを検証・デコード（無効な場合はスロー） |
| `decode(token)` | 検証なしでデコード（エラー時は`null`を返す） |

### sign

カスタムペイロードで署名済みトークンを作成：

```typescript
const token = await jwtService.sign({
  sub: user.id,
  roles: ['admin', 'user'],
  customClaim: 'value',
});
```

### verify

トークンを検証してペイロードを取得（無効または期限切れの場合はスロー）：

```typescript
try {
  const payload = await jwtService.verify(token);
  console.log(payload.sub); // ユーザーID
} catch (error) {
  // トークンが無効または期限切れ
}
```

### decode

検証なしでデコード（期限切れトークンの読み取りに便利）：

```typescript
const payload = jwtService.decode(token);
if (payload) {
  console.log(payload.sub);
}
```

## 設定

`JwtConfig`を継承して動作をカスタマイズ：

```typescript
import { JwtConfig, type JwtPayload, type ResolveUserResult } from '@zeltjs/auth-jwt';
import { Config } from '@zeltjs/core';

@Config
class CustomJwtConfig extends JwtConfig {
  override get secret(): string {
    return process.env.JWT_SECRET!;
  }

  override get expiresIn(): string {
    return '7d';  // トークン有効期限（デフォルト: '1h'）
  }

  override get resolveUser(): (payload: JwtPayload) => Promise<ResolveUserResult> {
    return async (payload) => {
      const user = await db.users.findById(payload.sub);
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
const app = createApp({
  http: {
    controllers: [AuthController, UserController],
    middlewares: [JwtMiddleware],
  },
  configs: [CustomJwtConfig],  // JwtConfigを置き換え
});
```

### 設定オプション

| オプション | 型 | デフォルト | 説明 |
|------------|------|---------|------|
| `secret` | `string` | `process.env.JWT_SECRET` | 署名用シークレットキー |
| `expiresIn` | `string` | `'1h'` | トークン有効期限（例: `'15m'`, `'7d'`） |
| `resolveUser` | `function` | `{ user: sub, roles: [] }`を返す | JWTペイロードからユーザーを解決 |

## クライアント連携

### トークンの送信

クライアントは`Authorization`ヘッダーにトークンを含める：

```typescript
fetch('/api/users/me', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

### トークンの保存

クライアントでトークンを安全に保存：

| プラットフォーム | 推奨ストレージ |
|------------------|----------------|
| ブラウザSPA | `httpOnly` Cookieまたはメモリ（`localStorage`は避ける） |
| モバイルアプリ | セキュアストレージ（Keychain / Keystore） |
| サーバー間通信 | 環境変数 |

## トークンリフレッシュパターン

長期セッションの場合、リフレッシュトークンフローを実装：

```typescript
@Controller('/auth')
class AuthController {
  constructor(private jwtService = inject(JwtService)) {}

  @Post('/refresh')
  async refresh(body = bodyParam(RefreshSchema)) {
    const payload = await this.jwtService.verify(body.refreshToken);
    
    const user = await db.users.findById(payload.sub);
    const accessToken = await this.jwtService.sign({
      sub: user.id,
      roles: user.roles,
    });
    
    return { accessToken };
  }
}
```

## エラーレスポンス

| ステータス | コード | 条件 |
|------------|--------|------|
| 401 | `UNAUTHORIZED` | トークンなし、無効なトークン、または期限切れトークン |
| 403 | `FORBIDDEN` | 有効なトークンだが必要なロールがない |

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

## エッジランタイムサポート

`@zeltjs/auth-jwt`はWeb Crypto APIをサポートする`jose`ライブラリを使用しており、以下と互換性があります：

- Cloudflare Workers
- Vercel Edge Functions
- Deno Deploy
- Node.js
