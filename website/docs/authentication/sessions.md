---
sidebar_position: 4
---

# Session Authentication

`@zeltjs/auth-session` provides cookie-based session management for server-rendered applications.

## Installation

```bash
pnpm add @zeltjs/auth-session @zeltjs/kv
```

## Quick Start

### 1. Set the Secret

Set the `SESSION_SECRET` environment variable:

```bash
# .env
SESSION_SECRET=your-secret-key-at-least-32-characters
```

### 2. Configure Session Store

Sessions are stored in a KV store. By default `SessionConfig` uses the in-memory adaptor under the `session:` namespace. To customize the namespace (or other options), extend `SessionConfig`:

```typescript
import { Config } from '@zeltjs/core';
import { SessionConfig } from '@zeltjs/auth-session';
// ---cut---
@Config
class MySessionConfig extends SessionConfig {
  override readonly kvStoreNamespace = 'sessions:';
}
```

### 3. Register Middleware

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

### 4. Manage Sessions

Use session functions in your handlers:

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

## Session API

| Function | Description |
|----------|-------------|
| `getSession()` | Get current session data (`undefined` if not logged in) |
| `setSession(data)` | Set session data (replaces existing) |
| `updateSession(fn)` | Update session data with a function |
| `destroySession()` | Destroy session and clear cookie |
| `isNewSession()` | Check if this is a newly created session |
| `getSessionId()` | Get the current session ID |

### setSession

Create or replace the session:

```typescript
import { setSession } from '@zeltjs/auth-session';
// ---cut---
setSession({
  userId: '123',
  name: 'Alice',
  cart: [{ productId: 'abc', qty: 2 }],
});
```

### updateSession

Partially update the session:

```typescript
import { updateSession } from '@zeltjs/auth-session';
// ---cut---
updateSession((session) => ({
  ...session,
  lastActivity: Date.now(),
}));
```

### destroySession

Clear the session and cookie (for logout):

```typescript
import { destroySession } from '@zeltjs/auth-session';
// ---cut---
destroySession();
```

## Type-Safe Sessions

Extend `SessionSchema` for type-safe session access:

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

Now all session functions are typed:

```typescript
import { getSession, setSession } from '@zeltjs/auth-session';
// ---cut---
const session = getSession();
// TypeScript knows: session?.userId, session?.name, session?.cart

setSession({ userId: '123', name: 'Alice' });
// Type-checked against SessionSchema
```

## Configuration

Extend `SessionConfig` to customize behavior:

```typescript
import { Config } from '@zeltjs/core';
import { SessionConfig } from '@zeltjs/auth-session';
// ---cut---
@Config
class MySessionConfig extends SessionConfig {
  override readonly kvStoreNamespace = 'sessions:';

  override get cookieName(): string {
    return 'my_session';  // default: 'session'
  }

  override get ttlSec(): number {
    return 86400 * 7;  // 7 days (default: 1 day)
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

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `kv` | `KVAdaptor` | `MemoryKV` | KV adaptor (constructor arg 2) backing session storage |
| `kvStoreNamespace` | `string` | `'session:'` | Namespace prefix for session keys |
| `secret` | `string` | `env.getString('SESSION_SECRET')` | Secret for signing session IDs |
| `cookieName` | `string` | `'session'` | Cookie name |
| `ttlSec` | `number` | `86400` (1 day) | Session TTL in seconds |
| `cookieOptions` | `object` | See below | Cookie configuration |

### Default Cookie Options

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

## Storage Backends

### Memory (Development)

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

### Redis (Production)

`SessionConfig` takes the KV adaptor as its second constructor argument. Pass a `RedisKVAdaptor` to `super()` to store sessions in Redis (leave the first argument as `undefined` to keep the default `Env` injection):

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

Using Redis requires registering `RedisConfig` (from `@zeltjs/redis`) so the adaptor can resolve its connection.

## Integration with User Context

Sessions don't automatically set the user context. Add middleware to bridge them:

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

Register after `SessionMiddleware`:

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

## Security Considerations

### CSRF Protection

Session-based authentication requires CSRF protection. Consider using:

- `SameSite=Strict` cookies (strongest, may affect UX)
- `SameSite=Lax` cookies with CSRF tokens for mutations
- Double-submit cookie pattern

### Session Fixation

Always regenerate the session ID after login:

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
    
    destroySession();  // Clear old session
    setSession({ userId: user.id, name: user.name });  // Creates new ID
    
    return { success: true };
  }
}
```

### Secure Cookies

In production, always use secure cookies:

```typescript
import { SessionConfig } from '@zeltjs/auth-session';
declare const _: SessionConfig;
// ---cut---
const cookieOptions = {
  httpOnly: true,
  secure: true,  // HTTPS only
  sameSite: 'Strict' as const,
  path: '/',
};
```
