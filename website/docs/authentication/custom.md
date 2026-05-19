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

Use class middleware when authentication requires database access or other injected services.

### Basic API Key Middleware

```typescript
import { Middleware, Injectable, inject, setUser, type RequestContext, type Next } from '@zeltjs/core';

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

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const apiKey = c.req.header('X-API-Key');

    if (apiKey) {
      const client = await this.apiKeyRepo.findByKey(apiKey);
      if (client) {
        setUser(
          { id: client.id, name: client.name, type: 'api' },
          client.scopes  // e.g., ['read:users', 'write:posts']
        );
      }
    }

    await next();
    return undefined;
  }
}
```

### With Revocation Check and Usage Tracking

```typescript
import { Middleware, Injectable, inject, setUser, type RequestContext, type Next } from '@zeltjs/core';
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

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const apiKey = c.req.header('X-API-Key');

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

## Basic Authentication

```typescript
import { Middleware, Injectable, inject, setUser, type RequestContext, type Next } from '@zeltjs/core';

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

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const auth = c.req.header('Authorization');

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

## OAuth Integration

### With an OAuth Library

For OAuth integration, use `@Config` for credentials and `@Injectable` for services:

```typescript
import { Config, EnvConfig, Injectable, Middleware, inject, setUser, type RequestContext, type Next } from '@zeltjs/core';

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

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

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
import { Controller, Get, Injectable, inject, queryParam } from '@zeltjs/core';

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
  async callback(code = queryParam('code'), _state = queryParam('state')) {
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

## Multi-Provider Authentication

Support multiple auth methods in one middleware. Use the framework-provided `JwtService` from `@zeltjs/auth-jwt`:

```typescript
import { Middleware, Injectable, inject, setUser, type RequestContext, type Next } from '@zeltjs/core';
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

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const auth = c.req.header('Authorization');
    const apiKey = c.req.header('X-API-Key');

    // Try API key first
    if (apiKey) {
      const client = await this.apiKeyRepo.findByKey(apiKey);
      if (client) {
        setUser({ id: client.id, type: 'api' }, client.scopes);
        await next();
        return undefined;
      }
    }

    // Then try Bearer token (JWT)
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7);
      try {
        const payload = await this.jwtService.verify(token);
        setUser({ id: payload.sub, type: 'user' }, payload.roles as string[]);
      } catch {
        // Invalid token
      }
    }

    await next();
    return undefined;
  }
}
```

## Request Signing (HMAC)

For secure machine-to-machine communication:

```typescript
import { Middleware, Injectable, inject, setUser, type RequestContext, type Next } from '@zeltjs/core';
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

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const signature = c.req.header('X-Signature');
    const timestamp = c.req.header('X-Timestamp');
    const clientId = c.req.header('X-Client-ID');

    if (!signature || !timestamp || !clientId) {
      await next();
      return undefined;
    }

    // Check timestamp (5 minute window)
    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);
    if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
      throw new HTTPException(401, { message: 'Request expired' });
    }

    // Get client secret
    const client = await this.clientRepo.findById(clientId);
    if (!client) {
      throw new HTTPException(401, { message: 'Unknown client' });
    }

    // Verify signature
    const body = await c.req.text();
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

## Testing Custom Auth

Mock the user context in tests:

```typescript
import { describe, it, expect } from 'vitest';
import { onTest } from '@zeltjs/testing';
import { createApp, setUser, Controller, Get, Authorized, currentUser, type FunctionMiddleware } from '@zeltjs/core';

@Controller('/users')
class UserController {
  @Authorized() @Get('/me')
  me() { return currentUser(); }
}

// Middleware sets user within request context — required for setUser to work
const mockAuthMiddleware: FunctionMiddleware = async (_c, next) => {
  setUser({ id: '123', name: 'Test User' }, ['admin']);
  await next();
};

const app = createApp({
  http: {
    controllers: [UserController],
    middlewares: [mockAuthMiddleware],
  },
});
// ---cut---
describe('Protected routes', () => {
  it('returns user data when authenticated', async () => {
    const testApp = await onTest(app);
    
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
