---
sidebar_position: 5
---

# Custom Authentication

Build your own authentication using Zelt's built-in primitives. No package required.

## When to Use Custom Auth

- API key authentication
- OAuth/OIDC with your own flow
- mTLS or certificate-based auth
- Proprietary authentication systems
- Simple prototypes

## Core Primitives

| Function | Description |
|----------|-------------|
| `setUser(user, roles)` | Set the authenticated user in request context |
| `currentUser()` | Get the current user |
| `currentRoles()` | Get the current user's roles |
| `@Authorized(roles?)` | Require authentication/roles on routes |

These are available from `@zeltjs/core` — no additional packages needed.

## API Key Authentication

### Simple Header-Based

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';
declare const db: {
  apiKeys: {
    findByKey(key: string): Promise<{ id: string; name: string; scopes: string[] } | null>;
  };
};
// ---cut---
export const apiKeyAuth: FunctionMiddleware = async (c, next) => {
  const apiKey = c.req.header('X-API-Key');
  
  if (apiKey) {
    const client = await db.apiKeys.findByKey(apiKey);
    if (client) {
      setUser(
        { id: client.id, name: client.name, type: 'api' },
        client.scopes  // e.g., ['read:users', 'write:posts']
      );
    }
  }
  
  await next();
};
```

### With Rate Limiting per Key

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';
import { HTTPException } from 'hono/http-exception';
declare const db: {
  apiKeys: {
    findByKey(key: string): Promise<{ id: string; name: string; tier: string; scopes: string[]; revokedAt?: Date } | null>;
    updateLastUsed(key: string): Promise<void>;
  };
};
// ---cut---
export const apiKeyAuth: FunctionMiddleware = async (c, next) => {
  const apiKey = c.req.header('X-API-Key');
  
  if (!apiKey) {
    await next();
    return;
  }
  
  const client = await db.apiKeys.findByKey(apiKey);
  if (!client) {
    throw new HTTPException(401, { message: 'Invalid API key' });
  }
  
  if (client.revokedAt) {
    throw new HTTPException(401, { message: 'API key revoked' });
  }
  
  await db.apiKeys.updateLastUsed(apiKey);
  
  setUser(
    { id: client.id, name: client.name, type: 'api', tier: client.tier },
    client.scopes
  );
  
  await next();
};
```

## Basic Authentication

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';
declare function validateCredentials(username: string, password: string): Promise<{ id: string; name: string; roles: string[] } | null>;
// ---cut---
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

## OAuth Integration

### With an OAuth Library

For OAuth integration, use a `@Config` class to manage credentials:

```typescript
declare class OAuth2Client {
  constructor(config: { clientId: string | undefined; clientSecret: string | undefined });
  verifyAccessToken(token: string): Promise<{ sub: string }>;
}
declare const db: {
  users: {
    findByOAuthId(sub: string): Promise<{ id: string; name: string; email: string; roles: string[] } | null>;
  };
};
// ---cut---
import { Config, EnvConfig, inject, Middleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';
import type { RequestContext, Next } from '@zeltjs/core';

@Config
class OAuthConfig {
  static readonly Token = OAuthConfig;

  constructor(private env = inject(EnvConfig)) {}

  get clientId() {
    return this.env.get('OAUTH_CLIENT_ID');
  }

  get clientSecret() {
    return this.env.get('OAUTH_CLIENT_SECRET');
  }
}

@Middleware
export class OAuthMiddleware {
  private oauth: OAuth2Client;

  constructor(config = inject(OAuthConfig)) {
    this.oauth = new OAuth2Client({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
  }

  async use(c: RequestContext, next: Next) {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      try {
        const tokenInfo = await this.oauth.verifyAccessToken(token);
        const user = await db.users.findByOAuthId(tokenInfo.sub);
        
        if (user) {
          setUser(
            { id: user.id, name: user.name, email: user.email },
            user.roles
          );
        }
      } catch {
        // Invalid token — continue without user
      }
    }
  
    await next();
    return undefined;
  }
}
```

### OAuth Callback Handler

```typescript
import { Controller, Get, queryParam } from '@zeltjs/core';
declare const oauth: {
  exchangeCode(code: string | undefined): Promise<{ access_token: string }>;
  getUserInfo(token: string): Promise<{ sub: string; name: string; email: string }>;
};
declare const db: {
  users: {
    findByOAuthId(sub: string): Promise<{ id: string } | null>;
    create(data: { oauthId: string; name: string; email: string }): Promise<{ id: string }>;
  };
};
declare function createSession(user: { id: string }): Promise<string>;
// ---cut---
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
    
    // Create your own session/JWT here
    const token = await createSession(user);
    
    return { token };
  }
}
```

## Multi-Provider Authentication

Support multiple auth methods in one middleware:

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';
declare const db: {
  apiKeys: {
    findByKey(key: string): Promise<{ id: string; scopes: string[] } | null>;
  };
};
declare function verifyJwt(token: string): Promise<{ sub: string; roles: string[] }>;
// ---cut---
export const multiAuth: FunctionMiddleware = async (c, next) => {
  const auth = c.req.header('Authorization');
  const apiKey = c.req.header('X-API-Key');
  
  // Try API key first
  if (apiKey) {
    const client = await db.apiKeys.findByKey(apiKey);
    if (client) {
      setUser({ id: client.id, type: 'api' }, client.scopes);
      await next();
      return;
    }
  }
  
  // Then try Bearer token
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    try {
      const payload = await verifyJwt(token);
      setUser({ id: payload.sub, type: 'user' }, payload.roles);
    } catch {
      // Invalid token
    }
  }
  
  await next();
};
```

## Request Signing (HMAC)

For secure machine-to-machine communication:

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';
import { HTTPException } from 'hono/http-exception';
declare const db: {
  clients: {
    findById(id: string): Promise<{ id: string; name: string; secret: string; permissions: string[] } | null>;
  };
};
declare function createHmac(algorithm: string, key: string): { update(data: string): { digest(encoding: string): string }; };
declare function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
declare const Buffer: { from(str: string): Uint8Array };
// ---cut---
export const hmacAuth: FunctionMiddleware = async (c, next) => {
  const signature = c.req.header('X-Signature');
  const timestamp = c.req.header('X-Timestamp');
  const clientId = c.req.header('X-Client-ID');
  
  if (!signature || !timestamp || !clientId) {
    await next();
    return;
  }
  
  // Check timestamp (5 minute window)
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);
  if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
    throw new HTTPException(401, { message: 'Request expired' });
  }
  
  // Get client secret
  const client = await db.clients.findById(clientId);
  if (!client) {
    throw new HTTPException(401, { message: 'Unknown client' });
  }
  
  // Verify signature
  const body = await c.req.text();
  const payload = `${timestamp}.${body}`;
  const expected = createHmac('sha256', client.secret)
    .update(payload)
    .digest('hex');
  
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new HTTPException(401, { message: 'Invalid signature' });
  }
  
  setUser({ id: client.id, name: client.name }, client.permissions);
  await next();
};
```

## Testing Custom Auth

Mock the user context in tests:

```typescript
import { describe, it, expect } from 'vitest';
import { onTest } from '@zeltjs/testing';
import { setUser, HttpApp } from '@zeltjs/core';
declare const app: HttpApp;
// ---cut---
describe('Protected routes', () => {
  it('returns user data when authenticated', async () => {
    const testApp = await onTest(app);
    
    // Mock authentication
    setUser({ id: '123', name: 'Test User' }, ['admin']);
    
    const res = await testApp.request('/users/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '123', name: 'Test User' });
  });
});
```

## Best Practices

1. **Fail open in middleware** — Don't throw errors for missing auth; let `@Authorized` handle access control
2. **Use constant-time comparison** — For secrets and signatures, use `timingSafeEqual`
3. **Validate timestamps** — For signed requests, reject old timestamps to prevent replay attacks
4. **Log authentication failures** — But don't log sensitive data like passwords or full tokens
5. **Separate concerns** — Middleware authenticates (who?), `@Authorized` authorizes (can they?)
