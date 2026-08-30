---
sidebar_position: 3
---

# JWT Authentication

`@zeltjs/auth-jwt` は、SPA・モバイルアプリ・APIのためのステートレスなJWTベース認証を提供します。

## インストール {#installation}

```bash
pnpm add @zeltjs/auth-jwt
```

## クイックスタート {#quick-start}

### 1. secretを設定する {#1-set-the-secret}

`JWT_SECRET` 環境変数を設定します。

```bash
# .env
JWT_SECRET=your-secret-key-at-least-32-characters
```

### 2. middlewareを登録する {#2-register-middleware}

```typescript
import { createApp, Controller, Post, Get, Authorized, currentUser, inject, http } from '@zeltjs/core';
import { JwtMiddleware, JwtConfig, JwtService } from '@zeltjs/auth-jwt';

@Controller('/auth')
class AuthController {
  constructor(private jwtService = inject(JwtService)) {}
  @Post('/login')
  async login() { return { token: await this.jwtService.sign({ sub: '1' }) }; }
}

@Controller('/users')
class UserController {
  @Authorized() @Get('/me')
  me() { return currentUser(); }
}
// ---cut---
const app = createApp([http({
    controllers: [AuthController, UserController],
    middlewares: [JwtMiddleware],
  })], { configs: [JwtConfig] });
```

### 3. トークンを発行する {#3-generate-tokens}

ログイン時、`JwtService` を使ってトークンに署名します。

```typescript
import { Controller, Post, inject } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import { JwtService } from '@zeltjs/auth-jwt';
import { HTTPException } from 'hono/http-exception';
import * as v from 'valibot';
declare function validateCredentials(email: string, password: string): Promise<{ id: string; roles: string[] } | null>;
// ---cut---
const LoginSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.string(),
});

@Controller('/auth')
class AuthController {
  constructor(private jwtService = inject(JwtService)) {}

  @Post('/login')
  async login(req = request(LoginSchema)) {
    const body = await req.body();
    const user = await validateCredentials(body.email, body.password);
    if (!user) {
      throw new HTTPException(401, { message: 'Invalid credentials' });
    }
    
    const token = await this.jwtService.sign({
      sub: user.id,
      roles: user.roles,
    });
    
    return { token };
  }
}
```

### 4. ルートを保護する {#4-protect-routes}

認証を必須にするには `@Authorized()` を使います。

```typescript
import { Controller, Get, Authorized, currentUser } from '@zeltjs/core';
// ---cut---
@Controller('/users')
class UserController {
  @Authorized()
  @Get('/me')
  me(user = currentUser()) {
    return user;
  }
}
```

## JwtService API {#jwtservice-api}

| メソッド | 説明 |
|--------|-------------|
| `sign(payload)` | 署名付きJWTトークンを作成する |
| `verify(token)` | トークンを検証してデコードする(無効な場合は例外を投げる) |
| `decode(token)` | 検証なしでデコードする(エラー時は `null` を返す) |

### Sign {#sign}

カスタムpayloadで署名付きトークンを作成します。

```typescript
import { Injectable, inject } from '@zeltjs/core';
import { JwtService } from '@zeltjs/auth-jwt';

@Injectable()
class TokenService {
  constructor(private jwtService = inject(JwtService)) {}
// ---cut---
  async createToken(userId: string) {
    return this.jwtService.sign({
      sub: userId,
      roles: ['admin', 'user'],
      customClaim: 'value',
    });
  }
}
```

### Verify {#verify}

トークンを検証し、payloadを取得します(無効または期限切れの場合は例外を投げます)。

```typescript
import { Injectable, inject } from '@zeltjs/core';
import { JwtService } from '@zeltjs/auth-jwt';

@Injectable()
class TokenService {
  constructor(private jwtService = inject(JwtService)) {}
// ---cut---
  async validateToken(token: string) {
    try {
      const payload = await this.jwtService.verify(token);
      console.log(payload.sub);
      return payload;
    } catch {
      return null;
    }
  }
}
```

### Decode {#decode}

検証なしでデコードします(期限切れのトークンを読む際に便利です)。

```typescript
import { Injectable, inject } from '@zeltjs/core';
import { JwtService } from '@zeltjs/auth-jwt';

@Injectable()
class TokenService {
  constructor(private jwtService = inject(JwtService)) {}
// ---cut---
  readToken(token: string) {
    const payload = this.jwtService.decode(token);
    if (payload) {
      console.log(payload.sub);
    }
    return payload;
  }
}
```

## 設定 {#configuration}

`JwtConfig` を継承して動作をカスタマイズします。

```typescript
import { JwtConfig, type JwtPayload, type ResolveUserResult } from '@zeltjs/auth-jwt';
import { Config, Env, Injectable, inject } from '@zeltjs/core';

type User = { id: string; name: string; email: string; roles: string[] };

@Injectable()
class UserRepository {
  async findById(id: string): Promise<User> {
    return { id, name: '', email: '', roles: [] };
  }
}
// ---cut---
@Config
class CustomJwtConfig extends JwtConfig {
  constructor(private userRepo = inject(UserRepository)) {
    super();
  }

  override get secret(): string {
    return this.env.getRequired('JWT_SECRET');
  }

  override get expiresIn(): string {
    return '7d';
  }

  override get resolveUser(): (payload: JwtPayload) => Promise<ResolveUserResult> {
    return async (payload) => {
      const user = await this.userRepo.findById(payload.sub!);
      return {
        user: { id: user.id, name: user.name, email: user.email },
        roles: user.roles,
      };
    };
  }
}
```

カスタムconfigを登録します。

```typescript
import { createApp, Controller, Post, Get, Authorized, currentUser, inject, http } from '@zeltjs/core';
import { JwtMiddleware, JwtService } from '@zeltjs/auth-jwt';
import { JwtConfig, type JwtPayload, type ResolveUserResult } from '@zeltjs/auth-jwt';
import { Config, Env, Injectable } from '@zeltjs/core';

type User = { id: string; name: string; email: string; roles: string[] };

@Injectable()
class UserRepository {
  async findById(id: string): Promise<User> {
    return { id, name: '', email: '', roles: [] };
  }
}

@Config
class CustomJwtConfig extends JwtConfig {
  constructor(private userRepo = inject(UserRepository)) { super(); }
  override get secret(): string { return this.env.getRequired('JWT_SECRET'); }
  override get expiresIn(): string { return '7d'; }
  override get resolveUser(): (payload: JwtPayload) => Promise<ResolveUserResult> {
    return async (payload) => {
      const user = await this.userRepo.findById(payload.sub!);
      return { user: { id: user.id, name: user.name, email: user.email }, roles: user.roles };
    };
  }
}

@Controller('/auth')
class AuthController {
  constructor(private jwtService = inject(JwtService)) {}
  @Post('/login')
  async login() { return { token: await this.jwtService.sign({ sub: '1' }) }; }
}

@Controller('/users')
class UserController {
  @Authorized() @Get('/me')
  me() { return currentUser(); }
}
// ---cut---
const app = createApp([http({
    controllers: [AuthController, UserController],
    middlewares: [JwtMiddleware],
  })], { configs: [CustomJwtConfig] });
```

### Configuration Options {#configuration-options}

| オプション | 型 | デフォルト | 説明 |
|--------|------|---------|-------------|
| `secret` | `string` | `env.getRequired('JWT_SECRET')` | 署名用のsecret key |
| `expiresIn` | `string` | `'1h'` | トークンの有効期限(例: `'15m'`、`'7d'`) |
| `resolveUser` | `function` | `{ user: sub, roles: [] }` を返す | JWTのpayloadからユーザーを解決する |

## クライアント側の統合 {#client-integration}

### トークンの送信 {#sending-the-token}

クライアントは `Authorization` ヘッダーにトークンを含める必要があります。

```typescript
declare const token: string;
// ---cut---
fetch('/api/users/me', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

### トークンの保存 {#token-storage}

クライアント上ではトークンを安全に保存してください。

| プラットフォーム | 推奨される保存先 |
|----------|---------------------|
| ブラウザSPA | `httpOnly` cookieまたはメモリ(`localStorage` は避ける) |
| モバイルアプリ | セキュアストレージ(Keychain / Keystore) |
| サーバー間通信 | 環境変数 |

## トークンのリフレッシュパターン {#token-refresh-pattern}

長期間のセッションでは、refresh tokenのフローを実装します。

```typescript
import { Controller, Post, Injectable, inject } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import { JwtService } from '@zeltjs/auth-jwt';
import * as v from 'valibot';

const RefreshSchema = v.object({ refreshToken: v.string() });

type User = { id: string; roles: string[] };

@Injectable()
class UserRepository {
  async findById(id: string): Promise<User> {
    return { id, roles: [] };
  }
}
// ---cut---
@Controller('/auth')
class AuthController {
  constructor(
    private jwtService = inject(JwtService),
    private userRepo = inject(UserRepository)
  ) {}

  @Post('/refresh')
  async refresh(req = request(RefreshSchema)) {
    const body = await req.body();
    const payload = await this.jwtService.verify(body.refreshToken);

    const user = await this.userRepo.findById(payload.sub!);
    const accessToken = await this.jwtService.sign({
      sub: user.id,
      roles: user.roles,
    });

    return { accessToken };
  }
}
```

## エラーレスポンス {#error-responses}

| ステータス | コード | 発生条件 |
|--------|------|------|
| 401 | `UNAUTHORIZED` | トークンがない、無効、または期限切れ |
| 403 | `FORBIDDEN` | トークンは有効だが必要なroleがない |

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

## Edge Runtimeのサポート {#edge-runtime-support}

`@zeltjs/auth-jwt` はWeb Crypto APIをサポートする `jose` ライブラリを使用しており、以下と互換性があります。

- Cloudflare Workers
- Vercel Edge Functions
- Deno Deploy
- Node.js
