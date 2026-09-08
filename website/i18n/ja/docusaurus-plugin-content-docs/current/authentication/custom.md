---
sidebar_position: 5
---

# Custom Authentication

Zeltの組み込みprimitiveを使って、独自の認証を構築します。パッケージは不要です。

## Custom Authを使うべき場面 {#when-to-use-custom-auth}

- APIキー認証
- 独自フローによるOAuth/OIDC
- mTLSや証明書ベースの認証
- 独自の認証システム
- シンプルなプロトタイプ

## コアPrimitive {#core-primitives}

| 関数 | 説明 |
|----------|-------------|
| `setUser(user, roles)` | request contextに認証済みユーザーを設定する |
| `currentUser()` | 現在のユーザーを取得する |
| `currentRoles()` | 現在のユーザーのroleを取得する |
| `@Authorized(roles?)` | ルートに認証/roleを要求する |

これらは `@zeltjs/core` から利用でき、追加のパッケージは不要です。

## APIキー認証 {#api-key-authentication}

認証にデータベースアクセスや他のinjected serviceが必要な場合は、class middlewareを使います。

### Basic API Key Middleware {#basic-api-key-middleware}

```typescript
import { Middleware, Injectable, inject, request, setUser, type Next } from '@zeltjs/core';

@Injectable()
class ApiKeyRepository {
  async findByKey(key: string): Promise<{ id: string; name: string; scopes: string[] } | null> {
    return null;
  }
}
// ---cut---
@Middleware
export class ApiKeyAuthMiddleware {
  constructor(private apiKeyRepo = inject(ApiKeyRepository)) {}

  async use(next: Next, req = request()): Promise<Response | undefined> {
    const apiKey = req.header('X-API-Key');

    if (apiKey) {
      const client = await this.apiKeyRepo.findByKey(apiKey);
      if (client) {
        setUser(
          { id: client.id, name: client.name, type: 'api' },
          client.scopes  // 例: ['read:users', 'write:posts']
        );
      }
    }

    await next();
    return undefined;
  }
}
```

### With Revocation Check and Usage Tracking {#with-revocation-check-and-usage-tracking}

```typescript
import { Middleware, Injectable, inject, request, setUser, type Next } from '@zeltjs/core';
import { HTTPException } from 'hono/http-exception';

type ApiKey = { id: string; name: string; tier: string; scopes: string[]; revokedAt?: Date };

@Injectable()
class ApiKeyService {
  async findByKey(key: string): Promise<ApiKey | null> {
    return null;
  }

  async updateLastUsed(key: string): Promise<void> {}
}
// ---cut---
@Middleware
export class ApiKeyAuthMiddleware {
  constructor(private apiKeyService = inject(ApiKeyService)) {}

  async use(next: Next, req = request()): Promise<Response | undefined> {
    const apiKey = req.header('X-API-Key');

    if (!apiKey) {
      await next();
      return undefined;
    }

    const client = await this.apiKeyService.findByKey(apiKey);
    if (!client) {
      throw new HTTPException(401, { message: 'Invalid API key' });
    }

    if (client.revokedAt) {
      throw new HTTPException(401, { message: 'API key revoked' });
    }

    await this.apiKeyService.updateLastUsed(apiKey);

    setUser(
      { id: client.id, name: client.name, type: 'api', tier: client.tier },
      client.scopes
    );

    await next();
    return undefined;
  }
}
```

## Basic認証 {#basic-authentication}

```typescript
import { Middleware, Injectable, inject, request, setUser, type Next } from '@zeltjs/core';

@Injectable()
class UserService {
  async validateCredentials(
    username: string,
    password: string
  ): Promise<{ id: string; name: string; roles: string[] } | null> {
    return null;
  }
}
// ---cut---
@Middleware
export class BasicAuthMiddleware {
  constructor(private userService = inject(UserService)) {}

  async use(next: Next, req = request()): Promise<Response | undefined> {
    const auth = req.header('Authorization');

    if (auth?.startsWith('Basic ')) {
      const base64 = auth.slice(6);
      const decoded = atob(base64);
      const [username, password] = decoded.split(':');

      const user = await this.userService.validateCredentials(username, password);
      if (user) {
        setUser({ id: user.id, name: user.name }, user.roles);
      }
    }

    await next();
    return undefined;
  }
}
```

## OAuth連携 {#oauth-integration}

### With an OAuth Library {#with-an-oauth-library}

OAuth連携では、認証情報には `@Config` を、サービスには `@Injectable` を使います。

```typescript
import { Config, Env, Injectable, Middleware, inject, request, setUser, type Next } from '@zeltjs/core';

@Config
class OAuthConfig {
  static readonly Token = OAuthConfig;

  constructor(private env = inject(Env)) {}

  get clientId() {
    return this.env.getString('OAUTH_CLIENT_ID');
  }

  get clientSecret() {
    return this.env.getString('OAUTH_CLIENT_SECRET');
  }
}

type User = { id: string; name: string; email: string; roles: string[] };

@Injectable()
class UserRepository {
  async findByOAuthId(sub: string): Promise<User | null> {
    return null;
  }
}

@Injectable()
class OAuth2Service {
  constructor(private _config = inject(OAuthConfig)) {}

  async verifyAccessToken(token: string): Promise<{ sub: string }> {
    return { sub: '' };
  }
}
// ---cut---
@Middleware
export class OAuthMiddleware {
  constructor(
    private oauth = inject(OAuth2Service),
    private userRepo = inject(UserRepository)
  ) {}

  async use(next: Next, req = request()): Promise<Response | undefined> {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      try {
        const tokenInfo = await this.oauth.verifyAccessToken(token);
        const user = await this.userRepo.findByOAuthId(tokenInfo.sub);

        if (user) {
          setUser(
            { id: user.id, name: user.name, email: user.email },
            user.roles
          );
        }
      } catch {
        // 無効なトークン — userなしで続行
      }
    }

    await next();
    return undefined;
  }
}
```

### OAuth Callback Handler {#oauth-callback-handler}

```typescript
import { Controller, Get, Injectable, inject, request } from '@zeltjs/core';

type User = { id: string; oauthId?: string; name?: string; email?: string };

@Injectable()
class OAuth2Service {
  async exchangeCode(code: string | undefined): Promise<{ access_token: string }> {
    return { access_token: '' };
  }

  async getUserInfo(token: string): Promise<{ sub: string; name: string; email: string }> {
    return { sub: '', name: '', email: '' };
  }
}

@Injectable()
class UserRepository {
  async findByOAuthId(sub: string): Promise<User | null> {
    return null;
  }

  async create(data: { oauthId: string; name: string; email: string }): Promise<User> {
    return { id: '', ...data };
  }
}

@Injectable()
class SessionService {
  async createSession(user: User): Promise<string> {
    return '';
  }
}
// ---cut---
@Controller('/auth')
class OAuthController {
  constructor(
    private oauth = inject(OAuth2Service),
    private userRepo = inject(UserRepository),
    private sessionService = inject(SessionService)
  ) {}

  @Get('/callback')
  async callback(req = request()) {
    const code = req.queryParam('code');
    const _state = req.queryParam('state');
    const tokens = await this.oauth.exchangeCode(code);
    const userInfo = await this.oauth.getUserInfo(tokens.access_token);

    let user = await this.userRepo.findByOAuthId(userInfo.sub);
    if (!user) {
      user = await this.userRepo.create({
        oauthId: userInfo.sub,
        name: userInfo.name,
        email: userInfo.email,
      });
    }

    const token = await this.sessionService.createSession(user);

    return { token };
  }
}
```

## 複数プロバイダー認証 {#multi-provider-authentication}

1つのmiddlewareで複数の認証方式をサポートします。`@zeltjs/auth-jwt` が提供する `JwtService` を使います。

```typescript
import { Middleware, Injectable, inject, request, setUser, type Next } from '@zeltjs/core';
import { JwtService } from '@zeltjs/auth-jwt';

@Injectable()
class ApiKeyRepository {
  async findByKey(key: string): Promise<{ id: string; scopes: string[] } | null> {
    return null;
  }
}
// ---cut---
@Middleware
export class MultiAuthMiddleware {
  constructor(
    private apiKeyRepo = inject(ApiKeyRepository),
    private jwtService = inject(JwtService)
  ) {}

  async use(next: Next, req = request()): Promise<Response | undefined> {
    const auth = req.header('Authorization');
    const apiKey = req.header('X-API-Key');

    // まずAPIキーを試す
    if (apiKey) {
      const client = await this.apiKeyRepo.findByKey(apiKey);
      if (client) {
        setUser({ id: client.id, type: 'api' }, client.scopes);
        await next();
        return undefined;
      }
    }

    // 次にBearerトークン(JWT)を試す
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7);
      try {
        const payload = await this.jwtService.verify(token);
        setUser({ id: payload.sub, type: 'user' }, payload.roles as string[]);
      } catch {
        // 無効なトークン
      }
    }

    await next();
    return undefined;
  }
}
```

## リクエスト署名(HMAC) {#request-signing-hmac}

安全なサーバー間通信のために。

```typescript
import { Middleware, Injectable, inject, request, setUser, type Next } from '@zeltjs/core';
import { HTTPException } from 'hono/http-exception';

type Client = { id: string; name: string; secret: string; permissions: string[] };

@Injectable()
class ClientRepository {
  async findById(id: string): Promise<Client | null> {
    return null;
  }
}

@Injectable()
class CryptoService {
  async hmacSha256(secret: string, data: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}
// ---cut---
@Middleware
export class HmacAuthMiddleware {
  constructor(
    private clientRepo = inject(ClientRepository),
    private cryptoService = inject(CryptoService)
  ) {}

  async use(next: Next, req = request()): Promise<Response | undefined> {
    const signature = req.header('X-Signature');
    const timestamp = req.header('X-Timestamp');
    const clientId = req.header('X-Client-ID');

    if (!signature || !timestamp || !clientId) {
      await next();
      return undefined;
    }

    // タイムスタンプをチェック(5分間のウィンドウ)
    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);
    if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
      throw new HTTPException(401, { message: 'Request expired' });
    }

    // クライアントのsecretを取得
    const client = await this.clientRepo.findById(clientId);
    if (!client) {
      throw new HTTPException(401, { message: 'Unknown client' });
    }

    // 署名を検証
    const body = await req.bodyRaw();
    const payload = `${timestamp}.${body}`;
    const expected = await this.cryptoService.hmacSha256(client.secret, payload);

    if (!this.cryptoService.timingSafeEqual(signature, expected)) {
      throw new HTTPException(401, { message: 'Invalid signature' });
    }

    setUser({ id: client.id, name: client.name }, client.permissions);
    await next();
    return undefined;
  }
}
```

## Custom Authをテストする {#testing-custom-auth}

テストではuser contextをモックします。

```typescript
import { describe, it, expect } from 'vitest';
import { onTest } from '@zeltjs/testing';
import { createApp, setUser, Controller, Get, Authorized, currentUser, Middleware, type Next, http } from '@zeltjs/core';

@Controller('/users')
class UserController {
  @Authorized() @Get('/me')
  me() { return currentUser(); }
}

// Middlewareがrequest context内でuserを設定する — setUserが機能するために必要
@Middleware
class MockAuthMiddleware {
  async use(next: Next): Promise<Response | undefined> {
    setUser({ id: '123', name: 'Test User' }, ['admin']);
    await next();
    return undefined;
  }
}

const app = createApp([http({
    controllers: [UserController],
    middlewares: [MockAuthMiddleware],
  })]);
const readyApp = await app.createRuntime();
// ---cut---
describe('Protected routes', () => {
  it('returns user data when authenticated', async () => {
    const testApp = await onTest(app);
    
    const res = await testApp.http.request('/users/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '123', name: 'Test User' });
  });
});
```

## Best Practices {#best-practices}

1. **middlewareではfail open** — 認証がないことをエラーにしない。access controlは `@Authorized` に任せる
2. **一定時間比較を使う** — secretや署名の比較には `timingSafeEqual` を使う
3. **タイムスタンプを検証する** — 署名付きリクエストでは、古いタイムスタンプを拒否してリプレイ攻撃を防ぐ
4. **認証の失敗をログに残す** — ただし、パスワードや完全なトークンなど機微なデータはログに残さない
5. **関心を分離する** — middlewareは認証(誰か?)を、`@Authorized` は認可(できるか?)を担当する
