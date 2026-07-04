---
---

# Middleware

Middleware classes execute before the route handler and can modify requests, responses, or context.

## Class Middleware

The simplest form of middleware is a class with a `use()` method. Use `request()` and `response()` to access HTTP primitives:

```typescript
import { Middleware, request, type Next } from '@zeltjs/core';

@Middleware
export class LoggingMiddleware {
  async use(next: Next, req = request()): Promise<Response | undefined> {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(`[${req.method()}] ${req.path()} ${duration}ms`);
    return undefined;
  }
}
```

## Middleware Levels

Zelt supports middleware at three levels, executed in order: **global → controller → method**.

### Global Middleware

Apply to all routes via `createApp()`:

```typescript
import { createApp, Controller, Get, Middleware, request, type Next, http } from '@zeltjs/core';

@Middleware
class LoggingMiddleware {
  async use(next: Next, req = request()) {
    const start = Date.now();
    await next();
    console.log(`[${req.method()}] ${req.path()} ${Date.now() - start}ms`);
    return undefined;
  }
}
@Controller('/users') class UserController { @Get('/') findAll() { return []; } }
// ---cut---
export const app = createApp([http({
    controllers: [UserController],
    middlewares: [LoggingMiddleware],
  })]);
```

### Controller Middleware

Apply to all methods in a controller with `@UseMiddleware`:

```typescript
import { Controller, Get, Middleware, UseMiddleware, type Next } from '@zeltjs/core';

@Middleware
class AuthMiddleware { async use(next: Next) { await next(); return undefined; } }
// ---cut---
@UseMiddleware(AuthMiddleware)
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
import { Controller, Delete, Get, Middleware, UseMiddleware, request, type Next } from '@zeltjs/core';

@Middleware
class AdminOnlyMiddleware { async use(next: Next) { await next(); return undefined; } }
// ---cut---
@Controller('/posts')
export class PostController {
  @Get('/')
  findAll() {
    return { posts: [] };
  }

  @UseMiddleware(AdminOnlyMiddleware)
  @Delete('/:id')
  remove(req = request()) {
    const id = req.pathParam('id');
    return { deleted: id };
  }
}
```

## Skipping Middleware

Use `@SkipMiddleware` to exclude specific middleware from a method:

```typescript
import { Controller, Get, Middleware, SkipMiddleware, type Next } from '@zeltjs/core';

@Middleware
class AuthMiddleware { async use(next: Next) { await next(); return undefined; } }
// ---cut---
@Controller('/api')
export class ApiController {
  @Get('/protected')
  protected() {
    return { secret: 'data' };
  }

  @SkipMiddleware(AuthMiddleware)
  @Get('/health')
  health() {
    return { status: 'ok' };
  }
}
```

Apply `@SkipMiddleware` to a controller class to exclude middleware from every route in that controller:

```typescript
import { Controller, Get, Middleware, SkipMiddleware, type Next } from '@zeltjs/core';

@Middleware
class AuthMiddleware { async use(next: Next) { await next(); return undefined; } }
// ---cut---
@SkipMiddleware(AuthMiddleware)
@Controller('/public')
export class PublicController {
  @Get('/health')
  health() {
    return { status: 'ok' };
  }

  @Get('/version')
  version() {
    return { version: '1.0.0' };
  }
}
```

Class-level and method-level skip declarations are combined. If a controller skips `AuthMiddleware` and a method skips `LoggingMiddleware`, that method skips both.

More specific middleware attachment wins over a class-level skip. If a controller has `@SkipMiddleware(AuthMiddleware)` but one method also has `@UseMiddleware(AuthMiddleware)`, `AuthMiddleware` runs for that method. If the same method has both `@UseMiddleware(AuthMiddleware)` and `@SkipMiddleware(AuthMiddleware)`, the method-level skip wins.

`CorsMiddleware` and `SecureHeadersMiddleware` are auto-registered on every HTTP app. See [HTTP Security](./http-security.md) for their defaults, configuration options, skip examples, and CORS preflight behavior.

## Context Sharing

Middleware can share data with handlers via `setContext()` and `getContext()`.

### Type-Safe Context

Define your context shape using module augmentation:

```typescript
// @noErrors
// Reason: module augmentation requires full module resolution unavailable in Twoslash VFS
import '@zeltjs/core';
// ---cut---
declare module '@zeltjs/core' {
  interface RequestContextSchema {
    user: { id: number; name: string };
  }
}
```

### Setting Context in Middleware

```typescript
// @noErrors
// Reason: module augmentation requires full module resolution unavailable in Twoslash VFS
import { Middleware, request, setContext, type Next } from '@zeltjs/core';

declare function verifyToken(token: string | undefined): Promise<{ id: number; name: string }>;
declare module '@zeltjs/core' { interface RequestContextSchema { user: { id: number; name: string }; } }
// ---cut---
@Middleware
export class AuthMiddleware {
  async use(next: Next, req = request()): Promise<Response | undefined> {
    const token = req.header('Authorization');
    const user = await verifyToken(token);
    setContext('user', user);
    await next();
    return undefined;
  }
}
```

### Reading Context in Handlers

```typescript
// @noErrors
// Reason: module augmentation requires full module resolution unavailable in Twoslash VFS
import { Controller, Get, getContext } from '@zeltjs/core';

declare module '@zeltjs/core' { interface RequestContextSchema { user: { id: number; name: string }; } }
// ---cut---
@Controller('/profile')
export class ProfileController {
  @Get('/')
  getProfile(user = getContext('user')) {
    return { id: user?.id, name: user?.name };
  }
}
```

## Dependency Injection

For middleware that requires dependency injection, use `@Middleware`:

```typescript
import { Config, Env, Middleware, inject, request } from '@zeltjs/core';
import type { Next } from '@zeltjs/core';

@Config
class AuthConfig {
  static readonly Token = AuthConfig;

  constructor(private env = inject(Env)) {}

  get secret() {
    return this.env.getString('AUTH_SECRET');
  }
}

@Middleware
export class AuthMiddleware {
  constructor(private config = inject(AuthConfig)) {}

  async use(next: Next, req = request()): Promise<Response | undefined> {
    const secret = this.config.secret;
    // ... authentication logic
    await next();
    return undefined;
  }
}
```

Use class middleware the same way as function middleware:

```typescript
import { Controller, UseMiddleware, Middleware, Get, type Next } from '@zeltjs/core';

@Middleware class AuthMiddleware { async use(next: Next) { await next(); return undefined; } }
// ---cut---
@UseMiddleware(AuthMiddleware)
@Controller('/admin')
export class AdminController {
  @Get('/') index() { return { ok: true }; }
}
```

## Parameterized Middleware

For middleware that requires configuration options, pass options as the second `@UseMiddleware()` argument:

```typescript
import { Controller, UseMiddleware, Middleware, Post, type Next } from '@zeltjs/core';
// ---cut---
@Middleware
export class RateLimitMiddleware {
  async use(next: Next, options: { limit: number; windowSec: number }) {
    const { limit, windowSec } = options;
    // ... rate limiting logic
    await next();
    return undefined;
  }
}

@Controller('/api')
export class ApiController {
  @UseMiddleware(RateLimitMiddleware, { limit: 10, windowSec: 60 })
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
import { Middleware, type Next } from '@zeltjs/core';
// ---cut---
@Middleware
class GlobalMiddleware {
  async use(next: Next) {
    console.log('1. global before');
    await next();
    console.log('6. global after');
  }
}

@Middleware
class ControllerMiddleware {
  async use(next: Next) {
    console.log('2. controller before');
    await next();
    console.log('5. controller after');
  }
}

@Middleware
class MethodMiddleware {
  async use(next: Next) {
    console.log('3. method before');
    await next();
    console.log('4. method after');
  }
}
```

## Common Patterns

Middleware is written as classes. Use `request()`, `response()`, `setContext()`, and `getContext()` for framework primitives.

### Restrict Access

Use class middleware when you need to inject services:

```typescript
// @noErrors
// Reason: module augmentation requires full module resolution unavailable in Twoslash VFS
import { Middleware, Injectable, inject, currentUser, type Next } from '@zeltjs/core';

declare module '@zeltjs/core' { interface RequestContextSchema { user: { id: number; name: string }; } }
@Injectable() class AuthService { isAdmin(user: unknown) { return false; } }
// ---cut---
@Middleware
export class RequireAdmin {
  constructor(private authService = inject(AuthService)) {}

  async use(next: Next): Promise<Response | undefined> {
    const user = currentUser();
    if (!this.authService.isAdmin(user)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    await next();
    return undefined;
  }
}
```

### Add Response Headers

Use `response()` for response headers:

```typescript
import { Middleware, response, type Next } from '@zeltjs/core';
// ---cut---
@Middleware
class PoweredByMiddleware {
  async use(next: Next, res = response()) {
    res.header('X-Powered-By', 'zelt');
    await next();
  }
}
```

Use `{ type: 'append' }` when multiple values for the same header should be preserved:

```typescript
import { Middleware, response, type Next } from '@zeltjs/core';
// ---cut---
@Middleware
class CacheTagMiddleware {
  async use(next: Next, res = response()) {
    res.header('Cache-Tag', 'api');
    res.header('Cache-Tag', 'users', { type: 'append' });
    await next();
  }
}
```

### Measure Response Time

```typescript
import { Middleware, response, type Next } from '@zeltjs/core';
// ---cut---
@Middleware
class TimingMiddleware {
  async use(next: Next, res = response()) {
    const start = Date.now();
    await next();
    res.header('X-Response-Time', `${Date.now() - start}ms`);
  }
}
```
