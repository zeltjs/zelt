---
---

# Middleware

Middleware functions execute before the route handler and can modify requests, responses, or context.

## Function Middleware

The simplest form of middleware is a function that receives the context and next function:

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';

export const loggingMiddleware: FunctionMiddleware = async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`[${c.req.method}] ${c.req.path} ${c.res.status} ${duration}ms`);
};
```

## Middleware Levels

Zelt supports middleware at three levels, executed in order: **global → controller → method**.

### Global Middleware

Apply to all routes via `createApp()`:

```typescript
import { createApp } from '@zeltjs/core';
import { loggingMiddleware } from './middlewares/logging';

export const app = createApp({
  http: {
    controllers: [UserController],
    middlewares: [loggingMiddleware],
  },
});
```

### Controller Middleware

Apply to all methods in a controller with `@UseMiddleware`:

```typescript
import { Controller, Get, UseMiddleware } from '@zeltjs/core';

@UseMiddleware(authMiddleware)
@Controller('/admin')
export class AdminController {
  @Get('/dashboard')
  dashboard() {
    return { stats: [] };
  }
}
```

### Method Middleware

Apply to specific methods:

```typescript
@Controller('/posts')
export class PostController {
  @Get('/')
  findAll() {
    return { posts: [] };
  }

  @UseMiddleware(adminOnlyMiddleware)
  @Delete('/:id')
  remove(id = pathParam('id')) {
    return { deleted: id };
  }
}
```

## Skipping Middleware

Use `@SkipMiddleware` to exclude specific middleware from a method:

```typescript
import { Controller, Get, SkipMiddleware } from '@zeltjs/core';

@Controller('/api')
export class ApiController {
  @Get('/protected')
  protected() {
    return { secret: 'data' };
  }

  @SkipMiddleware(authMiddleware)
  @Get('/health')
  health() {
    return { status: 'ok' };
  }
}
```

## Context Sharing

Middleware can share data with handlers via `setContext()` and `getContext()`.

### Type-Safe Context

Define your context shape using module augmentation:

```typescript
declare module '@zeltjs/core' {
  interface RequestContextSchema {
    user: { id: number; name: string };
  }
}
```

### Setting Context in Middleware

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';

export const authMiddleware: FunctionMiddleware = async (c, next) => {
  const token = c.req.header('Authorization');
  const user = await verifyToken(token);
  c.set('user', user);
  await next();
};
```

### Reading Context in Handlers

```typescript
import { Controller, Get, getContext } from '@zeltjs/core';

@Controller('/profile')
export class ProfileController {
  @Get('/')
  getProfile(user = getContext('user')) {
    return { id: user?.id, name: user?.name };
  }
}
```

## Class Middleware

For middleware that requires dependency injection, use `@Middleware`:

```typescript
import { Config, EnvConfig, Middleware, injectConfig } from '@zeltjs/core';
import type { RequestContext, Next } from '@zeltjs/core';

@Config
class AuthConfig {
  static readonly Token = AuthConfig;

  constructor(private env = injectConfig(EnvConfig)) {}

  get secret() {
    return this.env.get('AUTH_SECRET');
  }
}

@Middleware
export class AuthMiddleware {
  constructor(private config = injectConfig(AuthConfig)) {}

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const secret = this.config.secret;
    // ... authentication logic
    await next();
    return undefined;
  }
}
```

Use class middleware the same way as function middleware:

```typescript
@UseMiddleware(AuthMiddleware)
@Controller('/admin')
export class AdminController {
  // ...
}
```

## Parameterized Middleware

For middleware that requires configuration options, use the tuple syntax `[MiddlewareClass, options]`:

```typescript
@Middleware
export class RateLimitMiddleware {
  async use(c: RequestContext, next: Next, options?: { limit: number; windowSec: number }) {
    const limit = options?.limit ?? 100;
    const windowSec = options?.windowSec ?? 60;
    // ... rate limiting logic
    await next();
    return undefined;
  }
}

@Controller('/api')
export class ApiController {
  @UseMiddleware([RateLimitMiddleware, { limit: 10, windowSec: 60 }])
  @Post('/submit')
  submit() {
    return { submitted: true };
  }
}
```

The options parameter is passed to the middleware's `use()` method at runtime.

## Request Flow

```
Request
    ↓
Global Middleware (before next)
    ↓
Controller Middleware (before next)
    ↓
Method Middleware (before next)
    ↓
Route Handler
    ↓
Method Middleware (after next)
    ↓
Controller Middleware (after next)
    ↓
Global Middleware (after next)
    ↓
Response
```

Middleware can process both before and after the route handler by placing logic before or after `await next()`.

## Execution Order

Middleware executes in this order:

1. **Global middleware** (in array order)
2. **Controller middleware** (in decorator order)
3. **Method middleware** (in decorator order)
4. **Route handler**
5. **Post-handler middleware** (reverse order after `next()`)

```typescript
const globalMw: FunctionMiddleware = async (c, next) => {
  console.log('1. global before');
  await next();
  console.log('6. global after');
};

const controllerMw: FunctionMiddleware = async (c, next) => {
  console.log('2. controller before');
  await next();
  console.log('5. controller after');
};

const methodMw: FunctionMiddleware = async (c, next) => {
  console.log('3. method before');
  await next();
  console.log('4. method after');
};
```

## Common Patterns

You can write middleware as functions or classes. Use functions for simple cases, and classes when you need dependency injection or state.

### Restrict Access

Use class middleware when you need to inject services:

```typescript
@Middleware
export class RequireAdmin {
  constructor(private authService = inject(AuthService)) {}

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const user = c.get('user');
    if (!this.authService.isAdmin(user)) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
    return undefined;
  }
}
```

### Transform Response

Function middleware works well for simple transformations:

```typescript
const wrapResponse: FunctionMiddleware = async (c, next) => {
  await next();
  const body = await c.res.json();
  c.res = c.json({ success: true, data: body });
};
```

### Measure Response Time

```typescript
const timing: FunctionMiddleware = async (c, next) => {
  const start = Date.now();
  await next();
  c.res.headers.set('X-Response-Time', `${Date.now() - start}ms`);
};
```

### Cache Response

Use class middleware when you need to maintain state:

```typescript
@Middleware
export class CacheResponse {
  private cache = new Map<string, Response>();

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const key = c.req.url;
    const cached = this.cache.get(key);
    if (cached) return cached.clone();

    await next();
    this.cache.set(key, c.res.clone());
    return undefined;
  }
}
```
