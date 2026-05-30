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
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';
declare function verifyToken(token: string): Promise<{ sub: string; name: string; email: string; roles: string[] }>;
// ---cut---
export const authMiddleware: FunctionMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (token) {
    const payload = await verifyToken(token);
    setUser(
      { id: payload.sub, name: payload.name, email: payload.email },
      payload.roles
    );
  }
  
  await next();
};
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

## Type-Safe User Context

By default, `currentUser()` returns `Record<string, unknown>`. Extend `RequestContextSchema` via declaration merging to get full type safety:

```typescript
// @noErrors
// Reason: module augmentation requires full module resolution unavailable in Twoslash VFS
import '@zeltjs/core';
// ---cut---
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

Now all user-related functions are typed:

```typescript
// @noErrors
// Reason: module augmentation requires full module resolution unavailable in Twoslash VFS
import '@zeltjs/core';
declare module '@zeltjs/core' {
  interface RequestContextSchema {
    user: { id: string; name: string; email: string };
    authRoles: ('admin' | 'editor' | 'user')[];
  }
}
// ---cut---
import { currentUser, currentRoles, setUser } from '@zeltjs/core';

const user = currentUser();
// TypeScript knows: user?.id, user?.name, user?.email

const roles = currentRoles();
// TypeScript knows: roles is ('admin' | 'editor' | 'user')[]

setUser(
  { id: '123', name: 'Alice', email: 'alice@example.com' },
  ['admin', 'user']
);
// Type-checked against RequestContextSchema
```

### Where to Put the Type Declaration

Create a `types/zelt.d.ts` file in your project:

```typescript
// @noErrors
// Reason: module augmentation requires full module resolution unavailable in Twoslash VFS
// types/zelt.d.ts
import '@zeltjs/core';
// ---cut---
declare module '@zeltjs/core' {
  interface RequestContextSchema {
    user: {
      id: string;
      name: string;
      email: string;
      avatarUrl?: string;
    };
    authRoles: ('admin' | 'moderator' | 'user')[];
  }
}

export {};
```

Make sure your `tsconfig.json` includes this file:

```json
{
  "include": ["src/**/*", "types/**/*"]
}
```

## User Design Best Practices

### Keep It Minimal

Only include fields you need in handlers. Don't copy the entire database record:

```typescript
// ---cut---
// ✅ Good — minimal context
interface RequestContextSchemaGood {
  user: {
    id: string;
    name: string;
  };
}

// ❌ Avoid — too much data
interface RequestContextSchemaBad {
  user: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;  // Never include sensitive data
    createdAt: Date;
    updatedAt: Date;
    preferences: object;
    // ... 20 more fields
  };
}
```

### Fetch Additional Data When Needed

Use the user ID to fetch more data in specific handlers:

```typescript
// @noErrors
// Reason: module augmentation requires full module resolution unavailable in Twoslash VFS
import '@zeltjs/core';
declare module '@zeltjs/core' {
  interface RequestContextSchema {
    user: { id: string };
  }
}
import { Controller, Get, Authorized, Injectable, inject, currentUser } from '@zeltjs/core';

type FullUser = { preferences: object };

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
    const user = currentUser();
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
// @noErrors
// Reason: module augmentation requires full module resolution unavailable in Twoslash VFS
import '@zeltjs/core';
declare module '@zeltjs/core' {
  interface RequestContextSchema {
    user: { id: string };
  }
}
import { currentUser, currentRoles } from '@zeltjs/core';
interface Post { authorId: string; }
// ---cut---
function canEdit(post: Post): boolean {
  const user = currentUser();
  const roles = currentRoles();
  if (roles.includes('admin')) return true;
  if (roles.includes('editor') && post.authorId === user?.id) return true;
  return false;
}
```
