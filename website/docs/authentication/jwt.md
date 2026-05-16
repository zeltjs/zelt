---
sidebar_position: 3
---

# JWT Authentication

`@zeltjs/auth-jwt` provides stateless JWT-based authentication for SPAs, mobile apps, and APIs.

## Installation

```bash
pnpm add @zeltjs/auth-jwt
```

## Quick Start

### 1. Set the Secret

Set the `JWT_SECRET` environment variable:

```bash
# .env
JWT_SECRET=your-secret-key-at-least-32-characters
```

### 2. Register Middleware

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

### 3. Generate Tokens

Use `JwtService` to sign tokens at login:

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

### 4. Protect Routes

Use `@Authorized()` to require authentication:

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

| Method | Description |
|--------|-------------|
| `sign(payload)` | Create a signed JWT token |
| `verify(token)` | Verify and decode a token (throws on invalid) |
| `decode(token)` | Decode without verification (returns `null` on error) |

### Sign

Create a signed token with custom payload:

```typescript
const token = await jwtService.sign({
  sub: user.id,
  roles: ['admin', 'user'],
  customClaim: 'value',
});
```

### Verify

Verify a token and get its payload (throws if invalid or expired):

```typescript
try {
  const payload = await jwtService.verify(token);
  console.log(payload.sub); // user ID
} catch (error) {
  // Token is invalid or expired
}
```

### Decode

Decode without verification (useful for reading expired tokens):

```typescript
const payload = jwtService.decode(token);
if (payload) {
  console.log(payload.sub);
}
```

## Configuration

Extend `JwtConfig` to customize behavior:

```typescript
import { JwtConfig, type JwtPayload, type ResolveUserResult } from '@zeltjs/auth-jwt';
import { Config, EnvConfig, injectConfig } from '@zeltjs/core';

@Config
class CustomJwtConfig extends JwtConfig {
  constructor(private env = injectConfig(EnvConfig)) {
    super();
  }

  override get secret(): string {
    return this.env.get('JWT_SECRET')!;
  }

  override get expiresIn(): string {
    return '7d';  // Token expiration (default: '1h')
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

Register your custom config:

```typescript
const app = createApp({
  http: {
    controllers: [AuthController, UserController],
    middlewares: [JwtMiddleware],
  },
  configs: [CustomJwtConfig],  // Your config replaces JwtConfig
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `secret` | `string` | `env.get('JWT_SECRET')` | Secret key for signing |
| `expiresIn` | `string` | `'1h'` | Token expiration (e.g., `'15m'`, `'7d'`) |
| `resolveUser` | `function` | Returns `{ user: sub, roles: [] }` | Resolves user from JWT payload |

## Client Integration

### Sending the Token

Clients should include the token in the `Authorization` header:

```typescript
fetch('/api/users/me', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

### Token Storage

Store tokens securely on the client:

| Platform | Recommended Storage |
|----------|---------------------|
| Browser SPA | `httpOnly` cookie or memory (avoid `localStorage`) |
| Mobile App | Secure storage (Keychain / Keystore) |
| Server-to-Server | Environment variable |

## Token Refresh Pattern

For long-lived sessions, implement a refresh token flow:

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

## Error Responses

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | No token, invalid token, or expired token |
| 403 | `FORBIDDEN` | Valid token but missing required role |

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

## Edge Runtime Support

`@zeltjs/auth-jwt` uses the `jose` library which supports Web Crypto API, making it compatible with:

- Cloudflare Workers
- Vercel Edge Functions
- Deno Deploy
- Node.js
