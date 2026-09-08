---
sidebar_position: 4
---

# Session Authentication

`@zeltjs/auth-session` は、サーバーレンダリングアプリケーションのためのcookieベースのセッション管理を提供します。

## インストール {#installation}

```bash
pnpm add @zeltjs/auth-session @zeltjs/kv
```

## クイックスタート {#quick-start}

### 1. secretを設定する {#1-set-the-secret}

`SESSION_SECRET` 環境変数を設定します。

```bash
# .env
SESSION_SECRET=your-secret-key-at-least-32-characters
```

### 2. セッションストアを設定する {#2-configure-session-store}

セッションはKVストアに保存されます。デフォルトでは `SessionConfig` は `session:` namespace配下でin-memory adaptorを使用します。namespace(やその他のオプション)をカスタマイズするには `SessionConfig` を継承します。

```typescript
import { Config } from '@zeltjs/core';
import { SessionConfig } from '@zeltjs/auth-session';
// ---cut---
@Config
class MySessionConfig extends SessionConfig {
  override readonly kvStoreNamespace = 'sessions:';
}
```

### 3. middlewareを登録する {#3-register-middleware}

```typescript
import { createApp, Config, Controller, Post, Get, inject, http } from '@zeltjs/core';
import { MemoryKVService } from '@zeltjs/kv';
import { SessionMiddleware, SessionConfig, getSession, setSession, destroySession } from '@zeltjs/auth-session';
import { HTTPException } from 'hono/http-exception';

@Config
class MySessionConfig extends SessionConfig {
  override readonly kvStoreNamespace = 'sessions:';
}

@Controller('/auth')
class AuthController {
  @Post('/login')
  login() { setSession({ userId: '1' }); return { success: true }; }
  @Get('/me')
  me() {
    const session = getSession();
    if (!session) throw new HTTPException(401, { message: 'Not logged in' });
    return session;
  }
  @Post('/logout')
  logout() { destroySession(); return { success: true }; }
}

@Controller('/users')
class UserController {
  @Get('/') findAll() { return { users: [] }; }
}
// ---cut---
const app = createApp([http({
    controllers: [AuthController, UserController],
    middlewares: [SessionMiddleware],
  })], { configs: [MySessionConfig] });
```

### 4. セッションを管理する {#4-manage-sessions}

ハンドラー内でセッション関数を使用します。

```typescript
import { Controller, Post, Get } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import { getSession, setSession, destroySession } from '@zeltjs/auth-session';
import { HTTPException } from 'hono/http-exception';
import * as v from 'valibot';
const LoginSchema = v.object({ email: v.string(), password: v.string() });
declare function validateCredentials(email: string, password: string): Promise<{ id: string; name: string } | null>;
// ---cut---
@Controller('/auth')
class AuthController {
  @Post('/login')
  async login(req = request(LoginSchema)) {
    const body = await req.body();
    const user = await validateCredentials(body.email, body.password);
    if (!user) {
      throw new HTTPException(401, { message: 'Invalid credentials' });
    }
    
    setSession({ userId: user.id, name: user.name });
    return { success: true };
  }

  @Get('/me')
  me() {
    const session = getSession();
    if (!session) {
      throw new HTTPException(401, { message: 'Not logged in' });
    }
    return session;
  }

  @Post('/logout')
  logout() {
    destroySession();
    return { success: true };
  }
}
```

## Session API {#session-api}

| 関数 | 説明 |
|----------|-------------|
| `getSession()` | 現在のセッションデータを取得する(未ログインなら `undefined`) |
| `setSession(data)` | セッションデータを設定する(既存のものを置き換える) |
| `updateSession(fn)` | 関数でセッションデータを更新する |
| `destroySession()` | セッションを破棄しcookieをクリアする |
| `isNewSession()` | 新規に作成されたセッションかを確認する |
| `getSessionId()` | 現在のセッションIDを取得する |

### setSession {#setsession}

セッションを作成または置き換えます。

```typescript
import { setSession } from '@zeltjs/auth-session';
// ---cut---
setSession({
  userId: '123',
  name: 'Alice',
  cart: [{ productId: 'abc', qty: 2 }],
});
```

### updateSession {#updatesession}

セッションを部分的に更新します。

```typescript
import { updateSession } from '@zeltjs/auth-session';
// ---cut---
updateSession((session) => ({
  ...session,
  lastActivity: Date.now(),
}));
```

### destroySession {#destroysession}

セッションとcookieをクリアします(ログアウト用)。

```typescript
import { destroySession } from '@zeltjs/auth-session';
// ---cut---
destroySession();
```

## 型安全なセッション {#type-safe-sessions}

`SessionSchema` を継承すると、型安全にセッションへアクセスできます。

```typescript
import { SessionSchema } from '@zeltjs/auth-session';
interface CartItem { productId: string; qty: number; }
// ---cut---
declare module '@zeltjs/auth-session' {
  interface SessionSchema {
    userId?: string;
    name?: string;
    email?: string;
    cart?: CartItem[];
  }
}
```

これで、すべてのセッション関数に型が付きます。

```typescript
import { getSession, setSession } from '@zeltjs/auth-session';
// ---cut---
const session = getSession();
// TypeScriptはsession?.userId、session?.name、session?.cartを認識する

setSession({ userId: '123', name: 'Alice' });
// SessionSchemaに対して型チェックされる
```

## 設定 {#configuration}

`SessionConfig` を継承して動作をカスタマイズします。

```typescript
import { Config } from '@zeltjs/core';
import { SessionConfig } from '@zeltjs/auth-session';
// ---cut---
@Config
class MySessionConfig extends SessionConfig {
  override readonly kvStoreNamespace = 'sessions:';

  override get cookieName(): string {
    return 'my_session';  // デフォルト: 'session'
  }

  override get ttlSec(): number {
    return 86400 * 7;  // 7日(デフォルト: 1日)
  }

  override get cookieOptions() {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict' as const,
      path: '/',
    };
  }
}
```

### Configuration Options {#configuration-options}

| オプション | 型 | デフォルト | 説明 |
|--------|------|---------|-------------|
| `kv` | `KVAdaptor` | `MemoryKV` | セッションストレージの裏側となるKV adaptor(コンストラクタ引数2) |
| `kvStoreNamespace` | `string` | `'session:'` | セッションkeyのnamespace prefix |
| `secret` | `string` | `env.getString('SESSION_SECRET')` | セッションID署名用のsecret |
| `cookieName` | `string` | `'session'` | cookie名 |
| `ttlSec` | `number` | `86400`(1日) | セッションのTTL(秒) |
| `cookieOptions` | `object` | 下記参照 | cookieの設定 |

### デフォルトのcookieオプション {#default-cookie-options}

```typescript
import { Config } from '@zeltjs/core';
import { SessionConfig } from '@zeltjs/auth-session';

@Config
class MySessionConfig extends SessionConfig {
// ---cut---
  override get cookieOptions() {
    return {
      httpOnly: true,
      secure: this.env.getString('NODE_ENV', '') === 'production',
      sameSite: 'Lax' as const,
      path: '/',
    };
  }
}
```

## ストレージバックエンド {#storage-backends}

### Memory(開発用) {#memory-development}

```typescript
import { Config, inject } from '@zeltjs/core';
import { MemoryKV } from '@zeltjs/kv';
import { SessionConfig } from '@zeltjs/auth-session';
// ---cut---
@Config
class MySessionConfig extends SessionConfig {
  constructor(kv = inject(MemoryKV)) {
    super(undefined, kv);
  }
}
```

### Redis(本番用) {#redis-production}

`SessionConfig` はKV adaptorをコンストラクタの第2引数として受け取ります。セッションをRedisに保存するには `RedisKVAdaptor` を `super()` に渡します(第1引数はデフォルトの `Env` injectionを維持するため `undefined` のままにします)。

```typescript
import { Config, inject } from '@zeltjs/core';
import { SessionConfig } from '@zeltjs/auth-session';
import { RedisKVAdaptor } from '@zeltjs/kv/adaptor-redis';
// ---cut---
@Config
class MySessionConfig extends SessionConfig {
  constructor(kv = inject(RedisKVAdaptor)) {
    super(undefined, kv);
  }

  override readonly kvStoreNamespace = 'sessions:';
}
```

Redisを使用するには、adaptorが接続を解決できるよう(`@zeltjs/redis` の)`RedisConfig` を登録する必要があります。

## User Contextとの統合 {#integration-with-user-context}

セッションは自動的にuser contextを設定しません。両者をつなぐmiddlewareを追加します。

```typescript
import { Middleware, Injectable, inject, setUser, type Next } from '@zeltjs/core';
import { getSession } from '@zeltjs/auth-session';

type User = { id: string; name: string; email: string; roles: string[] };

@Injectable()
class UserRepository {
  async findById(id: string): Promise<User> {
    return { id, name: '', email: '', roles: [] };
  }
}
// ---cut---
@Middleware
export class SessionAuthMiddleware {
  constructor(private userRepo = inject(UserRepository)) {}

  async use(next: Next): Promise<Response | undefined> {
    const session = getSession() as { userId?: string } | undefined;

    if (session?.userId) {
      const user = await this.userRepo.findById(session.userId);
      setUser(
        { id: user.id, name: user.name, email: user.email },
        user.roles
      );
    }

    await next();
    return undefined;
  }
}
```

`SessionMiddleware` の後に登録します。

```typescript
import { createApp, Config, Controller, Get, Middleware, Injectable, inject, setUser, type Next, http } from '@zeltjs/core';
import { MemoryKVService } from '@zeltjs/kv';
import { SessionMiddleware, SessionConfig, getSession } from '@zeltjs/auth-session';

type User = { id: string; name: string; email: string; roles: string[] };

@Injectable()
class UserRepository {
  async findById(id: string): Promise<User> {
    return { id, name: '', email: '', roles: [] };
  }
}

@Config
class MySessionConfig extends SessionConfig {
  override readonly kvStoreNamespace = 'sessions:';
}

@Middleware
class SessionAuthMiddleware {
  constructor(private userRepo = inject(UserRepository)) {}
  async use(next: Next) {
    const session = getSession() as { userId?: string } | undefined;
    if (session?.userId) {
      const user = await this.userRepo.findById(session.userId);
      setUser({ id: user.id, name: user.name, email: user.email }, user.roles);
    }
    await next();
    return undefined;
  }
}

@Controller('/users')
class UserController {
  @Get('/') findAll() { return { users: [] }; }
}
// ---cut---
const app = createApp([http({
    controllers: [UserController],
    middlewares: [SessionMiddleware, SessionAuthMiddleware],
  })], { configs: [MySessionConfig] });
```

## セキュリティ上の注意点 {#security-considerations}

### CSRF Protection {#csrf-protection}

セッションベースの認証にはCSRF対策が必要です。以下の方法を検討してください。

- `SameSite=Strict` cookie(最も強力だが、UXに影響する場合がある)
- 変更を伴う操作に対する `SameSite=Lax` cookie + CSRFトークン
- Double-submit cookieパターン

### Session Fixation {#session-fixation}

ログイン後は必ずセッションIDを再生成してください。

```typescript
import { Controller, Post } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import { destroySession, setSession } from '@zeltjs/auth-session';
import * as v from 'valibot';
const LoginSchema = v.object({ email: v.string(), password: v.string() });
declare function validateCredentials(email: string, password: string): Promise<{ id: string; name: string }>;
// ---cut---
@Controller('/auth')
class AuthController {
  @Post('/login')
  async login(req = request(LoginSchema)) {
    const body = await req.body();
    const user = await validateCredentials(body.email, body.password);
    
    destroySession();  // 古いセッションをクリア
    setSession({ userId: user.id, name: user.name });  // 新しいIDを作成
    
    return { success: true };
  }
}
```

### Secure Cookies {#secure-cookies}

本番環境では、必ずsecure cookieを使用してください。

```typescript
import { SessionConfig } from '@zeltjs/auth-session';
declare const _: SessionConfig;
// ---cut---
const cookieOptions = {
  httpOnly: true,
  secure: true,  // HTTPSのみ
  sameSite: 'Strict' as const,
  path: '/',
};
```
