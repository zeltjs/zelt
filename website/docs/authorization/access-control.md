---
sidebar_position: 2
---

# Access Control

The `@Authorized` decorator enforces authentication and role requirements on routes.

## Basic Usage

### Require Authentication

Use `@Authorized()` without arguments to require any authenticated user:

```typescript
import { Controller, Get, Authorized } from '@zeltjs/core';
// ---cut---
@Controller('/dashboard')
class DashboardController {
  @Authorized()
  @Get('/')
  index() {
    return { stats: [] };
  }
}
```

If no user is set, returns `401 Unauthorized`:

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

### Require Specific Roles

Pass role names to restrict access:

```typescript
import { Controller, Get, Authorized } from '@zeltjs/core';
// ---cut---
@Controller('/admin')
class AdminController {
  @Authorized(['admin'])
  @Get('/users')
  listUsers() {
    return { users: [] };
  }
}
```

If the user lacks required roles, returns `403 Forbidden`:

```json
{
  "code": "FORBIDDEN",
  "message": "Insufficient permissions"
}
```

## Role Matching

### OR Logic (Any Role)

By default, access is granted if the user has **any** of the specified roles:

```typescript
import { Controller, Authorized, Delete } from '@zeltjs/core';
// ---cut---
@Controller('/admin')
class AdminController {
  @Authorized(['admin', 'moderator'])
  @Delete('/posts/:id')
  removePost() {
    // User needs 'admin' OR 'moderator'
  }
}
```

### AND Logic (All Roles)

For AND logic, use multiple `@Authorized` decorators:

```typescript
import { Controller, Authorized, Get } from '@zeltjs/core';
// ---cut---
@Controller('/content')
class ContentController {
  @Authorized(['verified'])
  @Authorized(['premium'])
  @Get('/exclusive-content')
  exclusiveContent() {
    // User needs 'verified' AND 'premium'
  }
}
```

Or check in the handler:

```typescript
import { Controller, Authorized, Get, currentRoles } from '@zeltjs/core';
import { HTTPException } from 'hono/http-exception';
// ---cut---
@Controller('/content')
class ContentController {
  @Authorized()
  @Get('/exclusive-content')
  exclusiveContent(roles = currentRoles()) {
    if (!roles.includes('verified') || !roles.includes('premium')) {
      throw new HTTPException(403, { message: 'Premium verified users only' });
    }
    return { content: '...' };
  }
}
```

## Decorator Placement

### Method Level

Apply to specific routes:

```typescript
import { Controller, Get, Post, Delete, Authorized } from '@zeltjs/core';
// ---cut---
@Controller('/posts')
class PostController {
  @Get('/')
  list() {
    // Public — no auth required
  }

  @Authorized()
  @Post('/')
  create() {
    // Requires authentication
  }

  @Authorized(['admin'])
  @Delete('/:id')
  delete() {
    // Requires admin role
  }
}
```

### With Other Decorators

`@Authorized` works with other method decorators:

```typescript
import { Controller, Authorized, Post } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import { RateLimit } from '@zeltjs/rate-limit';
import * as v from 'valibot';

const CreatePostSchema = v.object({ title: v.string(), content: v.string() });
// ---cut---
@Controller('/api')
class ApiController {
  @Authorized()
  @RateLimit({ limit: 100, windowSec: 60, key: 'posts' })
  @Post('/posts')
  async create(req = request(CreatePostSchema)) {
    const data = await req.body();
    return { created: true };
  }
}
```

## Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No user set (not authenticated) |
| 403 | `FORBIDDEN` | User lacks required roles |

### Customizing Error Messages

Handle authorization errors in your error handler:

```typescript
import { createApp, Controller, Get, Authorized, HTTPException, type RequestContext, http } from '@zeltjs/core';

@Controller('/dashboard')
class DashboardController {
  @Authorized() @Get('/')
  index() { return { stats: [] }; }
}

@Controller('/admin')
class AdminController {
  @Authorized(['admin']) @Get('/users')
  listUsers() { return { users: [] }; }
}
// ---cut---
const app = createApp([http({
    controllers: [DashboardController, AdminController],
    // @ts-expect-error shorthand error handler example
    onError: (error: Error, c: RequestContext) => {
      if (error instanceof HTTPException) {
        if (error.status === 401) {
          return c.json({
            error: 'Please log in to continue',
            loginUrl: '/auth/login',
          }, 401);
        }
        if (error.status === 403) {
          return c.json({
            error: 'You do not have permission to access this resource',
            requiredRoles: error.message,
          }, 403);
        }
      }
      throw error;
    },
  })]);
```

## Common Patterns

### Public Routes with Optional Auth

Don't use `@Authorized` — check the user manually:

```typescript
import { Controller, Get, Injectable, inject, request, currentUser } from '@zeltjs/core';

type Post = { authorId: string };
type User = { id: string };

@Injectable()
class PostRepository {
  async findById(id: string): Promise<Post> {
    return { authorId: '' };
  }
}
// ---cut---
@Controller('/posts')
class PostController {
  constructor(private postRepo = inject(PostRepository)) {}

  @Get('/:id')
  async getPost(req = request()) {
    const id = req.pathParam('id');
    const user = currentUser() as User | undefined;
    const post = await this.postRepo.findById(id);

    return {
      ...post,
      canEdit: user?.id === post.authorId,
    };
  }
}
```

### Owner-Only Access

Combine `@Authorized` with ownership checks:

```typescript
import { Controller, Authorized, Put, Injectable, inject, currentUser, currentRoles } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import { HTTPException } from 'hono/http-exception';
import * as v from 'valibot';

const UpdateSchema = v.object({ title: v.string(), content: v.string() });

type Post = { authorId: string };
type User = { id: string };

@Injectable()
class PostRepository {
  async findById(id: string): Promise<Post> {
    return { authorId: '' };
  }

  async update(id: string, _data: unknown): Promise<Post> {
    return { authorId: '' };
  }
}
// ---cut---
@Controller('/posts')
class PostController {
  constructor(private postRepo = inject(PostRepository)) {}

  @Authorized()
  @Put('/:id')
  async updatePost(req = request(UpdateSchema)) {
    const id = req.pathParam('id');
    const data = await req.body();
    const user = currentUser() as User;
    const post = await this.postRepo.findById(id);

    if (post.authorId !== user.id && !currentRoles().includes('admin')) {
      throw new HTTPException(403, { message: 'Not your post' });
    }

    return this.postRepo.update(id, data);
  }
}
```

### Role Hierarchy

Check for any role in a hierarchy:

```typescript
import { Controller, Authorized, Put, currentRoles } from '@zeltjs/core';
import { HTTPException } from 'hono/http-exception';
// ---cut---
const isEditor = (roles: readonly string[]) =>
  roles.some(r => ['admin', 'editor'].includes(r));

@Controller('/posts')
class PostController {
  @Authorized()
  @Put('/:id')
  updatePost(roles = currentRoles()) {
    if (!isEditor(roles)) {
      throw new HTTPException(403, { message: 'Editors only' });
    }
    // ...
  }
}
```

### Resource-Scoped Authorization

For complex scenarios, move logic to a service:

```typescript
import { Controller, Delete, Authorized, Injectable, inject, request, currentUser, currentRoles } from '@zeltjs/core';
import { HTTPException } from 'hono/http-exception';

type Post = { isPublic: boolean; authorId: string };
type User = { id: string };

@Injectable()
class PostRepository {
  async findById(id: string): Promise<Post> {
    return { isPublic: false, authorId: '' };
  }

  async delete(_id: string): Promise<void> {}
}
// ---cut---
@Injectable()
class PostAuthorizationService {
  canView(post: Post): boolean {
    if (post.isPublic) return true;
    const user = currentUser() as User | undefined;
    return user?.id === post.authorId;
  }

  canEdit(post: Post): boolean {
    const user = currentUser() as User | undefined;
    const roles = currentRoles();
    if (roles.includes('admin')) return true;
    return user?.id === post.authorId;
  }

  canDelete(): boolean {
    const roles = currentRoles();
    return roles.includes('admin');
  }
}

@Controller('/posts')
class PostController {
  constructor(
    private postRepo = inject(PostRepository),
    private authService = inject(PostAuthorizationService)
  ) {}

  @Authorized()
  @Delete('/:id')
  async delete(req = request()) {
    const id = req.pathParam('id');
    const post = await this.postRepo.findById(id);

    if (!this.authService.canDelete()) {
      throw new HTTPException(403, { message: 'Cannot delete this post' });
    }

    await this.postRepo.delete(id);
    return { deleted: true };
  }
}
```

## Testing Protected Routes

### Without Authentication

```typescript
import { it, expect } from 'vitest';
import { createApp, Controller, Get, Authorized, http } from '@zeltjs/core';

@Controller('/dashboard')
class DashboardController {
  @Authorized() @Get('/')
  index() { return { stats: [] }; }
}

const app = createApp([http({ controllers: [DashboardController] })]);
const readyApp = await app.createRuntime();
// ---cut---
it('returns 401 for unauthenticated requests', async () => {
  const res = await readyApp.http.request('/dashboard');
  
  expect(res.status).toBe(401);
});
```

### With Authentication

Use a middleware to inject the user within request context — `setUser()` must be called during request handling, not in test setup:

```typescript
import { it, expect } from 'vitest';
import { createApp, Controller, Get, Authorized, Middleware, request, setUser, type Next, http } from '@zeltjs/core';

@Middleware
class MockAuthMiddleware {
  async use(next: Next, req = request()): Promise<Response | undefined> {
    if (req.header('X-Test-User')) {
      setUser({ id: '123', name: 'Test' }, ['user']);
    }
    await next();
    return undefined;
  }
}

@Controller('/dashboard')
class DashboardController {
  @Authorized() @Get('/')
  index() { return { stats: [] }; }
}

const app = createApp([http({ controllers: [DashboardController], middlewares: [MockAuthMiddleware] })]);
const readyApp = await app.createRuntime();
// ---cut---
it('returns data for authenticated users', async () => {
  const res = await readyApp.http.request('/dashboard', { headers: { 'X-Test-User': 'true' } });
  expect(res.status).toBe(200);
});
```

### Testing Role Requirements

```typescript
import { it, expect } from 'vitest';
import { createApp, Controller, Get, Authorized, Middleware, request, setUser, type Next, http } from '@zeltjs/core';

@Middleware
class MockRoleMiddleware {
  async use(next: Next, req = request()): Promise<Response | undefined> {
    const role = req.header('X-Test-Role');
    if (role) {
      setUser({ id: '123', name: 'Test' }, [role]);
    }
    await next();
    return undefined;
  }
}

@Controller('/admin')
class AdminController {
  @Authorized(['admin']) @Get('/users')
  listUsers() { return { users: [] }; }
}

const app = createApp([http({ controllers: [AdminController], middlewares: [MockRoleMiddleware] })]);
const readyApp = await app.createRuntime();
// ---cut---
it('returns 403 for non-admin users', async () => {
  const res = await readyApp.http.request('/admin/users', { headers: { 'X-Test-Role': 'user' } });
  expect(res.status).toBe(403);
});

it('allows admin access', async () => {
  const res = await readyApp.http.request('/admin/users', { headers: { 'X-Test-Role': 'admin' } });
  expect(res.status).toBe(200);
});
```

## Best Practices

1. **Use `@Authorized()` for protected routes** — Don't manually check `currentUser()` for basic auth requirements

2. **Keep role checks coarse** — Use `@Authorized` for feature-level access, services for resource-level logic

3. **Fail closed** — When in doubt, deny access; it's easier to grant than revoke

4. **Log authorization failures** — Track failed access attempts for security monitoring

5. **Test both paths** — Always test authenticated and unauthenticated scenarios
