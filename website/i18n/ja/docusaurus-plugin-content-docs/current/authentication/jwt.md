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

### 3. Generate Tokens

Use `JwtService` to sign tokens at login:

```typescript
import { Controller, Post, inject } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
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
  async login(body = validated(LoginSchema)) {
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

## JwtService API

| Method | Description |
|--------|-------------|
| `sign(payload)` | Create a signed JWT token |
| `verify(token)` | Verify and decode a token (throws on invalid) |
| `decode(token)` | Decode without verification (returns `null` on error) |

### Sign

Create a signed token with custom payload:

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

### Verify

Verify a token and get its payload (throws if invalid or expired):

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

### Decode

Decode without verification (useful for reading expired tokens):

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

## Configuration

Extend `JwtConfig` to customize behavior:

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

Register your custom config:

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

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `secret` | `string` | `env.getRequired('JWT_SECRET')` | Secret key for signing |
| `expiresIn` | `string` | `'1h'` | Token expiration (e.g., `'15m'`, `'7d'`) |
| `resolveUser` | `function` | Returns `{ user: sub, roles: [] }` | Resolves user from JWT payload |

## Client Integration

### Sending the Token

Clients should include the token in the `Authorization` header:

```typescript
declare const token: string;
// ---cut---
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
import { Controller, Post, Injectable, inject } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
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
  async refresh(body = validated(RefreshSchema)) {
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
