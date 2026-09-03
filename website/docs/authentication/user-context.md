---
sidebar_position: 2
---

# User Context

Zelt provides request-scoped functions to access and manage the authenticated user.

## Core Functions

| Function | Description |
|----------|-------------|
| `setUser(user, roles)` | Set the authenticated user (call in middleware) |
| `currentUser()` | Get the current user (returns `undefined` if not authenticated) |
| `currentRoles()` | Get the current user's roles (returns `[]` if not authenticated) |

## Setting the User

Call `setUser()` in your authentication middleware after validating credentials:

```typescript
import { Middleware, request, setUser, type Next } from '@zeltjs/core';
declare function verifyToken(token: string): Promise<{ sub: string; name: string; email: string; roles: string[] }>;
// ---cut---
@Middleware
export class AuthMiddleware {
  async use(next: Next, req = request()): Promise<Response | undefined> {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      const payload = await verifyToken(token);
      setUser(
        { id: payload.sub, name: payload.name, email: payload.email },
        payload.roles
      );
    }

    await next();
    return undefined;
  }
}
```

### Parameters

- **user** — Any object representing the authenticated user
- **roles** — Array of role strings (e.g., `['admin', 'user']`)

## Accessing the User

### In Route Handlers

Use `currentUser()` to access the authenticated user:

```typescript
import { Controller, Get, currentUser, currentRoles } from '@zeltjs/core';
import { HTTPException } from 'hono/http-exception';
// ---cut---
@Controller('/profile')
class ProfileController {
  @Get('/me')
  me() {
    const user = currentUser();
    const roles = currentRoles();
    
    if (!user) {
      throw new HTTPException(401, { message: 'Not authenticated' });
    }
    
    return { user, roles, isAdmin: roles.includes('admin') };
  }
}
```

### With Default Parameters

For cleaner handler signatures, use default parameters:

```typescript
import { Controller, Get, currentUser } from '@zeltjs/core';
// ---cut---
@Controller('/profile')
class ProfileController {
  @Get('/me')
  me(user = currentUser()) {
    return user;
  }
}
```

## Typed Access

`currentUser()` always returns `Record<string, unknown> | undefined` — the shape passed to `setUser()` isn't tracked at the type level, so reading a specific field requires a manual assertion or narrowing.

For a value with a concrete, narrowed type available to handlers, provide it through a middleware instead: declare it with `Next<T>` and pass it to `next(value)`, then read it with `resultOf(M)`. See [Middleware Results](../middleware.md#middleware-results) for details.

## User Design Best Practices

### Keep It Minimal

Only include fields you need in handlers. Don't copy the entire database record:

```typescript
import { setUser } from '@zeltjs/core';
// ---cut---
// ✅ Good — minimal user
setUser({ id: '123', name: 'Alice' }, ['user']);

// ❌ Avoid — copying the entire record
setUser({
  id: '123',
  name: 'Alice',
  email: 'alice@example.com',
  passwordHash: '...',  // Never include sensitive data
  createdAt: new Date(),
  updatedAt: new Date(),
  preferences: {},
  // ... 20 more fields
}, ['user']);
```

### Fetch Additional Data When Needed

Use the user ID to fetch more data in specific handlers:

```typescript
import { Controller, Get, Authorized, Injectable, inject, currentUser } from '@zeltjs/core';

type FullUser = { preferences: object };
type SessionUser = { id: string };

@Injectable()
class UserRepository {
  async findById(id: string): Promise<FullUser> {
    return { preferences: {} };
  }
}
// ---cut---

@Controller('/settings')
class SettingsController {
  constructor(private userRepo = inject(UserRepository)) {}

  @Authorized()
  @Get('/')
  async getSettings() {
    const user = currentUser() as SessionUser | undefined;
    if (!user) return;
    const fullUser = await this.userRepo.findById(user.id);
    return { preferences: fullUser.preferences };
  }
}
```

### Consider Role Granularity

Roles should be simple strings. Complex permission logic belongs in services:

```typescript
// ---cut---
// ✅ Good — simple roles
type GoodRoles = ('admin' | 'editor' | 'viewer')[];

// ❌ Avoid — overly specific roles
type BadRoles = ('can_edit_posts' | 'can_delete_posts' | 'can_view_analytics')[];
```

For fine-grained permissions, check roles in your service layer:

```typescript
import { currentUser, currentRoles } from '@zeltjs/core';
interface Post { authorId: string; }
interface SessionUser { id: string; }
// ---cut---
function canEdit(post: Post): boolean {
  const user = currentUser() as SessionUser | undefined;
  const roles = currentRoles();
  if (roles.includes('admin')) return true;
  if (roles.includes('editor') && post.authorId === user?.id) return true;
  return false;
}
```
