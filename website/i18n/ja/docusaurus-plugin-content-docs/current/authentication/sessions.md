---
sidebar_position: 4
---

# セッション認証

`@zeltjs/auth-session`はサーバーレンダリングアプリケーション向けのCookieベースのセッション管理を提供します。

## インストール

```bash
pnpm add @zeltjs/auth-session @zeltjs/kv
```

## クイックスタート

### 1. シークレットを設定

`SESSION_SECRET`環境変数を設定：

```bash
# .env
SESSION_SECRET=your-secret-key-at-least-32-characters
```

### 2. セッションストアを設定

セッションデータ用のKVストアを提供するカスタム設定を作成：

```typescript
import { Config, inject } from '@zeltjs/core';
import { MemoryKVService } from '@zeltjs/kv';
import { SessionConfig } from '@zeltjs/auth-session';

@Config
class MySessionConfig extends SessionConfig {
  private kv = inject(MemoryKVService);

  override get store() {
    return this.kv.namespace('sessions');
  }
}
```

### 3. ミドルウェアを登録

```typescript
import { createApp } from '@zeltjs/core';
import { MemoryKVService } from '@zeltjs/kv';
import { SessionMiddleware } from '@zeltjs/auth-session';

const app = createApp({
  http: {
    controllers: [AuthController, UserController],
    middlewares: [SessionMiddleware],
  },
  configs: [MySessionConfig],
  injectables: [MemoryKVService],
});
```

### 4. セッションを管理

ハンドラーでセッション関数を使用：

```typescript
import { Controller, Post, Get, bodyParam } from '@zeltjs/core';
import { getSession, setSession, destroySession } from '@zeltjs/auth-session';

@Controller('/auth')
class AuthController {
  @Post('/login')
  async login(body = bodyParam(LoginSchema)) {
    const user = await validateCredentials(body.email, body.password);
    if (!user) {
      throw new HTTPException(401, { message: '認証情報が無効です' });
    }
    
    setSession({ userId: user.id, name: user.name });
    return { success: true };
  }

  @Get('/me')
  me() {
    const session = getSession();
    if (!session) {
      throw new HTTPException(401, { message: 'ログインしていません' });
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

## セッションAPI

| 関数 | 説明 |
|------|------|
| `getSession()` | 現在のセッションデータを取得（未ログインの場合は`undefined`） |
| `setSession(data)` | セッションデータを設定（既存を置換） |
| `updateSession(fn)` | 関数でセッションデータを更新 |
| `destroySession()` | セッションを破棄しCookieをクリア |
| `isNewSession()` | 新規作成されたセッションかチェック |
| `getSessionId()` | 現在のセッションIDを取得 |

### setSession

セッションを作成または置換：

```typescript
setSession({
  userId: '123',
  name: 'Alice',
  cart: [{ productId: 'abc', qty: 2 }],
});
```

### updateSession

セッションを部分的に更新：

```typescript
updateSession((session) => ({
  ...session,
  lastActivity: Date.now(),
}));
```

### destroySession

セッションとCookieをクリア（ログアウト用）：

```typescript
destroySession();
```

## 型安全なセッション

型安全なセッションアクセスのために`SessionSchema`を拡張：

```typescript
declare module '@zeltjs/auth-session' {
  interface SessionSchema {
    userId?: string;
    name?: string;
    email?: string;
    cart?: CartItem[];
  }
}
```

これですべてのセッション関数が型付けされます：

```typescript
const session = getSession();
// TypeScriptが認識: session?.userId, session?.name, session?.cart

setSession({ userId: '123', name: 'Alice' });
// SessionSchemaに対して型チェック
```

## 設定

`SessionConfig`を継承して動作をカスタマイズ：

```typescript
import { Config, inject } from '@zeltjs/core';
import { RedisKVService } from '@zeltjs/kv-redis';
import { SessionConfig } from '@zeltjs/auth-session';

@Config
class MySessionConfig extends SessionConfig {
  private kv = inject(RedisKVService);

  override get store() {
    return this.kv.namespace('sessions');
  }

  override get cookieName(): string {
    return 'my_session';  // デフォルト: 'session'
  }

  override get ttlSec(): number {
    return 86400 * 7;  // 7日間（デフォルト: 1日）
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

### 設定オプション

| オプション | 型 | デフォルト | 説明 |
|------------|------|---------|------|
| `store` | `KVNamespace` | 必須 | セッションストレージ用KV名前空間 |
| `secret` | `string` | `process.env.SESSION_SECRET` | セッションID署名用シークレット |
| `cookieName` | `string` | `'session'` | Cookie名 |
| `ttlSec` | `number` | `86400`（1日） | セッションTTL（秒） |
| `cookieOptions` | `object` | 下記参照 | Cookie設定 |

### デフォルトCookieオプション

```typescript
{
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Lax',
  path: '/',
}
```

## ストレージバックエンド

### メモリ（開発用）

```typescript
import { MemoryKVService } from '@zeltjs/kv';

@Config
class MySessionConfig extends SessionConfig {
  private kv = inject(MemoryKVService);
  override get store() {
    return this.kv.namespace('sessions');
  }
}
```

### Redis（本番用）

```typescript
import { RedisKVService } from '@zeltjs/kv-redis';

@Config
class MySessionConfig extends SessionConfig {
  private kv = inject(RedisKVService);
  override get store() {
    return this.kv.namespace('sessions');
  }
}
```

### Cloudflare KV

```typescript
import { CloudflareKVService } from '@zeltjs/kv-cloudflare';

@Config
class MySessionConfig extends SessionConfig {
  private kv = inject(CloudflareKVService);
  override get store() {
    return this.kv.namespace('sessions');
  }
}
```

## ユーザーコンテキストとの連携

セッションは自動的にユーザーコンテキストを設定しません。ブリッジするミドルウェアを追加：

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';
import { getSession } from '@zeltjs/auth-session';

export const sessionAuthMiddleware: FunctionMiddleware = async (c, next) => {
  const session = getSession();
  
  if (session?.userId) {
    const user = await db.users.findById(session.userId);
    setUser(
      { id: user.id, name: user.name, email: user.email },
      user.roles
    );
  }
  
  await next();
};
```

`SessionMiddleware`の後に登録：

```typescript
const app = createApp({
  http: {
    controllers: [UserController],
    middlewares: [SessionMiddleware, sessionAuthMiddleware],
  },
  configs: [MySessionConfig],
  injectables: [MemoryKVService],
});
```

## セキュリティ考慮事項

### CSRF保護

セッションベース認証にはCSRF保護が必要です。以下を検討：

- `SameSite=Strict` Cookie（最強、UXに影響する場合あり）
- `SameSite=Lax` Cookieとミューテーション用CSRFトークン
- ダブルサブミットCookieパターン

### セッション固定攻撃

ログイン後は常にセッションIDを再生成：

```typescript
@Post('/login')
async login(body = bodyParam(LoginSchema)) {
  const user = await validateCredentials(body.email, body.password);
  
  destroySession();  // 古いセッションをクリア
  setSession({ userId: user.id, name: user.name });  // 新しいIDを作成
  
  return { success: true };
}
```

### セキュアCookie

本番環境では常にセキュアCookieを使用：

```typescript
override get cookieOptions() {
  return {
    httpOnly: true,
    secure: true,  // HTTPSのみ
    sameSite: 'Strict' as const,
    path: '/',
  };
}
```
