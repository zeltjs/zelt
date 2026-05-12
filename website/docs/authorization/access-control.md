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
@Authorized(['admin', 'moderator'])
@Delete('/posts/:id')
removePost() {
  // User needs 'admin' OR 'moderator'
}
```

### AND Logic (All Roles)

For AND logic, use multiple `@Authorized` decorators:

```typescript
@Authorized(['verified'])
@Authorized(['premium'])
@Get('/exclusive-content')
exclusiveContent() {
  // User needs 'verified' AND 'premium'
}
```

Or check in the handler:

```typescript
@Authorized()
@Get('/exclusive-content')
exclusiveContent(roles = currentRoles()) {
  if (!roles.includes('verified') || !roles.includes('premium')) {
    throw new HTTPException(403, { message: 'Premium verified users only' });
  }
  return { content: '...' };
}
```

## Decorator Placement

### Method Level

Apply to specific routes:

```typescript
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
@Authorized()
@UseMiddleware(rateLimitMiddleware)
@Post('/posts')
create(body = bodyParam(CreatePostSchema)) {
  return { created: true };
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
import { createApp, isHttpException } from '@zeltjs/core';

const app = createApp({
  http: {
    controllers: [...],
    onError: (error, c) => {
      if (isHttpException(error)) {
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
  },
});
```

## Common Patterns

### Public Routes with Optional Auth

Don't use `@Authorized` — check the user manually:

```typescript
@Get('/posts/:id')
getPost(id = pathParam('id'), user = currentUser()) {
  const post = await db.posts.findById(id);
  
  return {
    ...post,
    canEdit: user?.id === post.authorId,
  };
}
```

### Owner-Only Access

Combine `@Authorized` with ownership checks:

```typescript
@Authorized()
@Put('/posts/:id')
async updatePost(id = pathParam('id'), body = bodyParam(UpdateSchema)) {
  const user = currentUser();
  const post = await db.posts.findById(id);
  
  if (post.authorId !== user.id && !currentRoles().includes('admin')) {
    throw new HTTPException(403, { message: 'Not your post' });
  }
  
  return db.posts.update(id, body);
}
```

### Role Hierarchy

Check for any role in a hierarchy:

```typescript
const isEditor = (roles: string[]) =>
  roles.some(r => ['admin', 'editor'].includes(r));

@Authorized()
@Put('/posts/:id')
updatePost(roles = currentRoles()) {
  if (!isEditor(roles)) {
    throw new HTTPException(403, { message: 'Editors only' });
  }
  // ...
}
```

### Resource-Scoped Authorization

For complex scenarios, move logic to a service:

```typescript
class PostAuthService {
  canView(post: Post): boolean {
    if (post.isPublic) return true;
    const user = currentUser();
    return user?.id === post.authorId;
  }

  canEdit(post: Post): boolean {
    const user = currentUser();
    const roles = currentRoles();
    if (roles.includes('admin')) return true;
    return user?.id === post.authorId;
  }

  canDelete(post: Post): boolean {
    const roles = currentRoles();
    return roles.includes('admin');
  }
}

@Controller('/posts')
class PostController {
  constructor(private auth = inject(PostAuthService)) {}

  @Authorized()
  @Delete('/:id')
  async delete(id = pathParam('id')) {
    const post = await db.posts.findById(id);
    
    if (!this.auth.canDelete(post)) {
      throw new HTTPException(403, { message: 'Cannot delete this post' });
    }
    
    await db.posts.delete(id);
    return { deleted: true };
  }
}
```

## Testing Protected Routes

### Without Authentication

```typescript
it('returns 401 for unauthenticated requests', async () => {
  const client = createTestClient(app);
  const res = await client.get('/dashboard');
  
  expect(res.status).toBe(401);
});
```

### With Authentication

```typescript
it('returns data for authenticated users', async () => {
  const client = createTestClient(app);
  
  // Set up authentication context
  setUser({ id: '123', name: 'Test' }, ['user']);
  
  const res = await client.get('/dashboard');
  expect(res.status).toBe(200);
});
```

### Testing Role Requirements

```typescript
it('returns 403 for non-admin users', async () => {
  const client = createTestClient(app);
  
  setUser({ id: '123', name: 'Test' }, ['user']);  // Not admin
  
  const res = await client.get('/admin/users');
  expect(res.status).toBe(403);
});

it('allows admin access', async () => {
  const client = createTestClient(app);
  
  setUser({ id: '123', name: 'Test' }, ['admin']);
  
  const res = await client.get('/admin/users');
  expect(res.status).toBe(200);
});
```

## Best Practices

1. **Use `@Authorized()` for protected routes** — Don't manually check `currentUser()` for basic auth requirements

2. **Keep role checks coarse** — Use `@Authorized` for feature-level access, services for resource-level logic

3. **Fail closed** — When in doubt, deny access; it's easier to grant than revoke

4. **Log authorization failures** — Track failed access attempts for security monitoring

5. **Test both paths** — Always test authenticated and unauthenticated scenarios
