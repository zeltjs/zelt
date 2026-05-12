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

Create a custom config that provides a KV store for session data:

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

### 3. Register Middleware

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

### 4. Manage Sessions

Use session functions in your handlers:

```typescript
import { Controller, Post, Get, bodyParam } from '@zeltjs/core';
import { getSession, setSession, destroySession } from '@zeltjs/auth-session';

@Controller('/auth')
class AuthController {
  @Post('/login')
  async login(body = bodyParam(LoginSchema)) {
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
setSession({
  userId: '123',
  name: 'Alice',
  cart: [{ productId: 'abc', qty: 2 }],
});
```

### updateSession

Partially update the session:

```typescript
updateSession((session) => ({
  ...session,
  lastActivity: Date.now(),
}));
```

### destroySession

Clear the session and cookie (for logout):

```typescript
destroySession();
```

## Type-Safe Sessions

Extend `SessionSchema` for type-safe session access:

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

Now all session functions are typed:

```typescript
const session = getSession();
// TypeScript knows: session?.userId, session?.name, session?.cart

setSession({ userId: '123', name: 'Alice' });
// Type-checked against SessionSchema
```

## Configuration

Extend `SessionConfig` to customize behavior:

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
| `store` | `KVNamespace` | Required | KV namespace for session storage |
| `secret` | `string` | `process.env.SESSION_SECRET` | Secret for signing session IDs |
| `cookieName` | `string` | `'session'` | Cookie name |
| `ttlSec` | `number` | `86400` (1 day) | Session TTL in seconds |
| `cookieOptions` | `object` | See below | Cookie configuration |

### Default Cookie Options

```typescript
{
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Lax',
  path: '/',
}
```

## Storage Backends

### Memory (Development)

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

### Redis (Production)

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

## Integration with User Context

Sessions don't automatically set the user context. Add middleware to bridge them:

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

Register after `SessionMiddleware`:

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

## Security Considerations

### CSRF Protection

Session-based authentication requires CSRF protection. Consider using:

- `SameSite=Strict` cookies (strongest, may affect UX)
- `SameSite=Lax` cookies with CSRF tokens for mutations
- Double-submit cookie pattern

### Session Fixation

Always regenerate the session ID after login:

```typescript
@Post('/login')
async login(body = bodyParam(LoginSchema)) {
  const user = await validateCredentials(body.email, body.password);
  
  destroySession();  // Clear old session
  setSession({ userId: user.id, name: user.name });  // Creates new ID
  
  return { success: true };
}
```

### Secure Cookies

In production, always use secure cookies:

```typescript
override get cookieOptions() {
  return {
    httpOnly: true,
    secure: true,  // HTTPS only
    sameSite: 'Strict' as const,
    path: '/',
  };
}
```
