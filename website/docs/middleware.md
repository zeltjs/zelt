---
sidebar_position: 4
---

# Middleware

Middleware functions execute before the route handler and can modify requests, responses, or context.

## Function Middleware

The simplest form of middleware is a function that receives the context and next function:

```typescript
import type { FunctionMiddleware } from '@koya/core';

export const loggingMiddleware: FunctionMiddleware = async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`[${c.req.method}] ${c.req.path} ${c.res.status} ${duration}ms`);
};
```

## Middleware Levels

Koya supports middleware at three levels, executed in order: **global → controller → method**.

### Global Middleware

Apply to all routes via `createHttpApp()`:

```typescript
import { createHttpApp } from '@koya/core';
import { loggingMiddleware } from './middlewares/logging';

export const app = createHttpApp({
  controllers: [UserController],
  middlewares: [loggingMiddleware],
});
```

### Controller Middleware

Apply to all methods in a controller with `@UseMiddleware`:

```typescript
import { Controller, Get, UseMiddleware } from '@koya/core';

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
import { Controller, Get, SkipMiddleware } from '@koya/core';

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
declare module '@koya/core' {
  interface KoyaContextSchema {
    user: { id: number; name: string };
  }
}
```

### Setting Context in Middleware

```typescript
import type { FunctionMiddleware } from '@koya/core';

export const authMiddleware: FunctionMiddleware = async (c, next) => {
  const token = c.req.header('Authorization');
  const user = await verifyToken(token);
  c.set('user', user);
  await next();
};
```

### Reading Context in Handlers

```typescript
import { Controller, Get, getContext } from '@koya/core';

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
import { Middleware, inject, Injectable } from '@koya/core';
import type { KoyaContext, KoyaNext } from '@koya/core';

@Injectable()
class ConfigService {
  getSecret() {
    return process.env.SECRET;
  }
}

@Middleware
export class AuthMiddleware {
  constructor(private config = inject(ConfigService)) {}

  async use(c: KoyaContext, next: KoyaNext): Promise<Response | undefined> {
    const secret = this.config.getSecret();
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
