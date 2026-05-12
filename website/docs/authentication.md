---
---

# Authentication & Authorization

Zelt provides lightweight primitives for managing authentication state and enforcing role-based access control.

## Overview

The authentication API consists of:

- **`setUser(user, roles)`** — Set the authenticated user and their roles in middleware
- **`currentUser()`** — Retrieve the current user in handlers
- **`currentRoles()`** — Retrieve the current user's roles
- **`@Authorized(roles?)`** — Declarative decorator for access control

## Setting Up Authentication

Authentication is typically handled in middleware. Zelt doesn't prescribe a specific authentication strategy—use JWT, session cookies, API keys, or any method that fits your needs.

### Authentication Middleware

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';

export const jwtAuth: FunctionMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (token) {
    const payload = await verifyJwt(token);
    setUser(
      { id: payload.sub, name: payload.name },
      payload.roles // e.g., ['admin', 'user']
    );
  }
  
  await next();
};
```

### Register as Global Middleware

```typescript
import { createApp } from '@zeltjs/core';

const app = createApp({
  http: {
    controllers: [UserController, AdminController],
    middlewares: [jwtAuth],
  },
});
```

## Using Authentication State

### In Handlers

Use `currentUser()` and `currentRoles()` to access authentication state:

```typescript
import { Controller, Get } from '@zeltjs/core';
import { currentUser, currentRoles } from '@zeltjs/core';

@Controller('/profile')
class ProfileController {
  @Get('/me')
  me() {
    const user = currentUser();
    const roles = currentRoles();
    
    return {
      user,
      roles,
      isAdmin: roles.includes('admin'),
    };
  }
}
```

### With Default Parameters

Use default parameters for cleaner handler signatures:

```typescript
@Controller('/profile')
class ProfileController {
  @Get('/me')
  me(user = currentUser()) {
    return user;
  }
}
```

## Authorization with @Authorized

The `@Authorized` decorator provides declarative access control at the method level.

### Require Authentication

Use `@Authorized()` without arguments to require any authenticated user:

```typescript
import { Controller, Get, Authorized } from '@zeltjs/core';

@Controller('/dashboard')
class DashboardController {
  @Authorized()
  @Get('/')
  index() {
    return { stats: [] };
  }
}
```

Returns `401 Unauthorized` if no user is set:

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

### Require Specific Roles

Pass role names to restrict access:

```typescript
@Controller('/admin')
class AdminController {
  @Authorized(['admin'])
  @Get('/users')
  listUsers() {
    return { users: [] };
  }
  
  @Authorized(['admin', 'moderator'])
  @Delete('/posts/:id')
  removePost(id = pathParam('id')) {
    return { deleted: id };
  }
}
```

Access is granted if the user has **any** of the specified roles (OR logic).

Returns `403 Forbidden` if the user lacks required roles:

```json
{
  "code": "FORBIDDEN",
  "message": "Insufficient permissions"
}
```

## Type-Safe User Context

Extend `RequestContextSchema` to type your user object:

```typescript
declare module '@zeltjs/core' {
  interface RequestContextSchema {
    user: {
      id: string;
      name: string;
      email: string;
    };
    authRoles: ('admin' | 'editor' | 'user')[];
  }
}
```

Now `currentUser()` and `setUser()` are fully typed:

```typescript
const user = currentUser();
// TypeScript knows: user?.id, user?.name, user?.email

setUser(
  { id: '123', name: 'Alice', email: 'alice@example.com' },
  ['admin', 'user']
);
```

## Authorization Flow

```
Request
    ↓
Authentication Middleware
    ├── Token valid? → setUser(user, roles)
    └── No token? → continue (user remains undefined)
    ↓
@Authorized() check
    ├── No user? → 401 UNAUTHORIZED
    ├── Missing role? → 403 FORBIDDEN
    └── OK → Route Handler
    ↓
Response
```

## Combining with Other Decorators

`@Authorized` works with other method decorators:

```typescript
@Controller('/posts')
class PostController {
  @Authorized()
  @UseMiddleware(rateLimitMiddleware)
  @Post('/')
  create(body = bodyParam(CreatePostSchema)) {
    return { created: true };
  }
}
```

## Using @zeltjs/auth-jwt

For JWT authentication, Zelt provides the `@zeltjs/auth-jwt` package with ready-to-use middleware and services.

### Installation

```bash
pnpm add @zeltjs/auth-jwt
```

### Basic Setup

1. Set the `JWT_SECRET` environment variable
2. Register the `JwtMiddleware` and `JwtConfig`:

```typescript
import { createApp } from '@zeltjs/core';
import { JwtMiddleware, JwtConfig } from '@zeltjs/auth-jwt';

const app = createApp({
  http: {
    controllers: [UserController],
    middlewares: [JwtMiddleware],
  },
  configs: [JwtConfig],
});
```

### Generating Tokens

Use `JwtService` to sign tokens:

```typescript
import { Controller, Post, bodyParam, inject } from '@zeltjs/core';
import { JwtService } from '@zeltjs/auth-jwt';
import * as v from 'valibot';

const LoginSchema = v.object({
  email: v.string(),
  password: v.string(),
});

@Controller('/auth')
class AuthController {
  constructor(private jwtService = inject(JwtService)) {}

  @Post('/login')
  async login(body = bodyParam(LoginSchema)) {
    const user = await validateCredentials(body.email, body.password);
    const token = await this.jwtService.sign({ sub: user.id, roles: user.roles });
    return { token };
  }
}
```

### Custom Configuration

Extend `JwtConfig` to customize behavior:

```typescript
import { JwtConfig, type ResolveUserResult, type JwtPayload } from '@zeltjs/auth-jwt';
import { Config } from '@zeltjs/core';

@Config
class CustomJwtConfig extends JwtConfig {
  override get expiresIn(): string {
    return '7d';
  }

  override get resolveUser(): (payload: JwtPayload) => Promise<ResolveUserResult> {
    return async (payload) => {
      const user = await findUserById(payload.sub);
      return {
        user: { id: user.id, name: user.name, email: user.email },
        roles: user.roles,
      };
    };
  }
}
```

Register the custom config:

```typescript
const app = createApp({
  http: {
    controllers: [AuthController, UserController],
    middlewares: [JwtMiddleware],
  },
  configs: [CustomJwtConfig],
});
```

### JwtService Methods

| Method | Description |
|--------|-------------|
| `sign(payload)` | Create a signed JWT token |
| `verify(token)` | Verify and decode a token (throws on invalid) |
| `decode(token)` | Decode without verification (returns `null` on error) |

## Using @zeltjs/auth-session

For session-based authentication with cookies, Zelt provides the `@zeltjs/auth-session` package.

### Installation

```bash
pnpm add @zeltjs/auth-session @zeltjs/kv
```

### Basic Setup

1. Set the `SESSION_SECRET` environment variable
2. Create a custom config that provides a KV store
3. Register the middleware:

```typescript
import { createApp, Config, inject } from '@zeltjs/core';
import { MemoryKVService } from '@zeltjs/kv';
import { SessionMiddleware, SessionConfig } from '@zeltjs/auth-session';

@Config
class MySessionConfig extends SessionConfig {
  private kv = inject(MemoryKVService);

  override get store() {
    return this.kv.namespace('sessions');
  }
}

const app = createApp({
  http: {
    controllers: [UserController],
    middlewares: [SessionMiddleware],
  },
  configs: [MySessionConfig],
  injectables: [MemoryKVService],
});
```

### Type-Safe Sessions with SessionSchema

Extend `SessionSchema` via declaration merging for type-safe session access:

```typescript
declare module '@zeltjs/auth-session' {
  interface SessionSchema {
    userId?: string;
    name?: string;
    cart?: CartItem[];
  }
}
```

Now all session functions are fully typed:

```typescript
const session = getSession();
// TypeScript knows: session?.userId, session?.name, session?.cart

setSession({ userId: '123', name: 'Alice' });
// Type-checked against SessionSchema
```

### Session Functions

Use the session functions in your handlers:

```typescript
import { Controller, Get, Post, bodyParam } from '@zeltjs/core';
import { getSession, setSession, destroySession } from '@zeltjs/auth-session';

@Controller('/auth')
class AuthController {
  @Post('/login')
  login(body = bodyParam(LoginSchema)) {
    setSession({ userId: '123', name: body.name });
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

### Session API

| Function | Description |
|----------|-------------|
| `getSession()` | Get current session data (returns `undefined` if not logged in) |
| `setSession(data)` | Set session data (replaces existing) |
| `updateSession(updater)` | Update session data with a function |
| `destroySession()` | Destroy the session and clear the cookie |
| `isNewSession()` | Check if this is a newly created session |
| `getSessionId()` | Get the current session ID |

### Custom Configuration

Extend `SessionConfig` to customize behavior:

```typescript
@Config
class MySessionConfig extends SessionConfig {
  override get cookieName() {
    return 'my_session';
  }

  override get ttlSec() {
    return 86400 * 7; // 7 days
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

## Best Practices

1. **Set authentication early** — Register auth middleware globally so it runs before route handlers
2. **Use typed context** — Extend `RequestContextSchema` to get type safety for user objects
3. **Keep roles simple** — Use flat role strings; complex permission logic belongs in services
4. **Separate concerns** — Middleware handles authentication, `@Authorized` handles authorization
5. **Default to secure** — Use `@Authorized()` on protected routes rather than checking manually
