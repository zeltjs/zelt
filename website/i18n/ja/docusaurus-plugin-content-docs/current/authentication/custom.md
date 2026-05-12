---
sidebar_position: 5
---

# カスタム認証

Zeltの組み込みプリミティブを使用して独自の認証を構築します。パッケージは不要です。

## カスタム認証を使用するケース

- APIキー認証
- OAuth/OIDCの独自フロー
- mTLSまたは証明書ベースの認証
- 独自の認証システム
- シンプルなプロトタイプ

## コアプリミティブ

| 関数 | 説明 |
|------|------|
| `setUser(user, roles)` | リクエストコンテキストに認証済みユーザーを設定 |
| `currentUser()` | 現在のユーザーを取得 |
| `currentRoles()` | 現在のユーザーのロールを取得 |
| `@Authorized(roles?)` | ルートで認証/ロールを要求 |

これらは`@zeltjs/core`から利用可能で、追加パッケージは不要です。

## APIキー認証

### シンプルなヘッダーベース

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';

export const apiKeyAuth: FunctionMiddleware = async (c, next) => {
  const apiKey = c.req.header('X-API-Key');
  
  if (apiKey) {
    const client = await db.apiKeys.findByKey(apiKey);
    if (client) {
      setUser(
        { id: client.id, name: client.name, type: 'api' },
        client.scopes  // 例: ['read:users', 'write:posts']
      );
    }
  }
  
  await next();
};
```

### レート制限付き

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';

export const apiKeyAuth: FunctionMiddleware = async (c, next) => {
  const apiKey = c.req.header('X-API-Key');
  
  if (!apiKey) {
    await next();
    return;
  }
  
  const client = await db.apiKeys.findByKey(apiKey);
  if (!client) {
    throw new HTTPException(401, { message: '無効なAPIキー' });
  }
  
  if (client.revokedAt) {
    throw new HTTPException(401, { message: 'APIキーは失効しています' });
  }
  
  await db.apiKeys.updateLastUsed(apiKey);
  
  setUser(
    { id: client.id, name: client.name, type: 'api', tier: client.tier },
    client.scopes
  );
  
  await next();
};
```

## Basic認証

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';

export const basicAuth: FunctionMiddleware = async (c, next) => {
  const auth = c.req.header('Authorization');
  
  if (auth?.startsWith('Basic ')) {
    const base64 = auth.slice(6);
    const decoded = atob(base64);
    const [username, password] = decoded.split(':');
    
    const user = await validateCredentials(username, password);
    if (user) {
      setUser(
        { id: user.id, name: user.name },
        user.roles
      );
    }
  }
  
  await next();
};
```

## OAuth連携

### OAuthライブラリを使用

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';
import { OAuth2Client } from 'your-oauth-library';

const oauth = new OAuth2Client({
  clientId: process.env.OAUTH_CLIENT_ID,
  clientSecret: process.env.OAUTH_CLIENT_SECRET,
});

export const oauthAuth: FunctionMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (token) {
    try {
      const tokenInfo = await oauth.verifyAccessToken(token);
      const user = await db.users.findByOAuthId(tokenInfo.sub);
      
      if (user) {
        setUser(
          { id: user.id, name: user.name, email: user.email },
          user.roles
        );
      }
    } catch {
      // 無効なトークン — ユーザーなしで続行
    }
  }
  
  await next();
};
```

### OAuthコールバックハンドラー

```typescript
import { Controller, Get, queryParam } from '@zeltjs/core';

@Controller('/auth')
class OAuthController {
  @Get('/callback')
  async callback(code = queryParam('code'), state = queryParam('state')) {
    const tokens = await oauth.exchangeCode(code);
    const userInfo = await oauth.getUserInfo(tokens.access_token);
    
    let user = await db.users.findByOAuthId(userInfo.sub);
    if (!user) {
      user = await db.users.create({
        oauthId: userInfo.sub,
        name: userInfo.name,
        email: userInfo.email,
      });
    }
    
    // 独自のセッション/JWTをここで作成
    const token = await createSession(user);
    
    return { token };
  }
}
```

## マルチプロバイダー認証

1つのミドルウェアで複数の認証方式をサポート：

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';

export const multiAuth: FunctionMiddleware = async (c, next) => {
  const auth = c.req.header('Authorization');
  const apiKey = c.req.header('X-API-Key');
  
  // まずAPIキーを試行
  if (apiKey) {
    const client = await db.apiKeys.findByKey(apiKey);
    if (client) {
      setUser({ id: client.id, type: 'api' }, client.scopes);
      await next();
      return;
    }
  }
  
  // 次にBearerトークンを試行
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    try {
      const payload = await verifyJwt(token);
      setUser({ id: payload.sub, type: 'user' }, payload.roles);
    } catch {
      // 無効なトークン
    }
  }
  
  await next();
};
```

## リクエスト署名（HMAC）

セキュアなマシン間通信用：

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';
import { createHmac, timingSafeEqual } from 'crypto';

export const hmacAuth: FunctionMiddleware = async (c, next) => {
  const signature = c.req.header('X-Signature');
  const timestamp = c.req.header('X-Timestamp');
  const clientId = c.req.header('X-Client-ID');
  
  if (!signature || !timestamp || !clientId) {
    await next();
    return;
  }
  
  // タイムスタンプチェック（5分ウィンドウ）
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);
  if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
    throw new HTTPException(401, { message: 'リクエストの有効期限切れ' });
  }
  
  // クライアントシークレットを取得
  const client = await db.clients.findById(clientId);
  if (!client) {
    throw new HTTPException(401, { message: '不明なクライアント' });
  }
  
  // 署名を検証
  const body = await c.req.text();
  const payload = `${timestamp}.${body}`;
  const expected = createHmac('sha256', client.secret)
    .update(payload)
    .digest('hex');
  
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new HTTPException(401, { message: '無効な署名' });
  }
  
  setUser({ id: client.id, name: client.name }, client.permissions);
  await next();
};
```

## カスタム認証のテスト

テストでユーザーコンテキストをモック：

```typescript
import { describe, it, expect } from 'vitest';
import { createTestClient } from '@zeltjs/testing';
import { setUser } from '@zeltjs/core';

describe('保護されたルート', () => {
  it('認証済みの場合ユーザーデータを返す', async () => {
    const client = createTestClient(app);
    
    // 認証をモック
    setUser({ id: '123', name: 'Test User' }, ['admin']);
    
    const res = await client.get('/users/me');
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ id: '123', name: 'Test User' });
  });
});
```

## ベストプラクティス

1. **ミドルウェアではフェイルオープン** — 認証がない場合はエラーをスローしない。アクセス制御は`@Authorized`に任せる
2. **定数時間比較を使用** — シークレットと署名には`timingSafeEqual`を使用
3. **タイムスタンプを検証** — 署名付きリクエストでは、リプレイ攻撃を防ぐため古いタイムスタンプを拒否
4. **認証失敗をログ** — ただしパスワードや完全なトークンなどの機密データはログしない
5. **関心を分離** — ミドルウェアは認証（誰？）、`@Authorized`は認可（できる？）
