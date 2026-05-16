---
sidebar_position: 1
---

# Roles

Roles are the foundation of Zelt's authorization system. They define what a user can do.

## What is a Role?

A role is a simple string that represents a permission level or capability:

```typescript
const adminRoles = ['admin', 'editor', 'viewer'];
const teamRoles = ['owner', 'member', 'guest'];
const permissionRoles = ['read:users', 'write:users', 'delete:users'];
```

Roles are assigned during authentication via `setUser()`:

```typescript
import { setUser } from '@zeltjs/core';
declare const user: { id: string; name: string };
// ---cut---
setUser(
  { id: user.id, name: user.name },
  ['admin', 'user']  // ← roles
);
```

## Defining Role Types

Use `RequestContextSchema` to type your roles:

```typescript
// @noErrors
// Reason: module augmentation requires full module resolution unavailable in Twoslash VFS
import '@zeltjs/core';
// ---cut---
declare module '@zeltjs/core' {
  interface RequestContextSchema {
    user: { id: string; name: string };
    authRoles: ('admin' | 'editor' | 'viewer')[];
  }
}
```

This provides:
- Autocomplete when calling `setUser()`
- Type checking in `@Authorized(['...'])`
- Type-safe `currentRoles()` return value

## Role Design Patterns

### Hierarchical Roles

Define roles that imply other roles:

```typescript
import { setUser } from '@zeltjs/core';
declare const user: { id: string; name: string; primaryRole: 'admin' | 'editor' | 'viewer' };
// ---cut---
type Role = 'admin' | 'editor' | 'viewer';

const roleHierarchy: Record<Role, Role[]> = {
  admin: ['admin', 'editor', 'viewer'],
  editor: ['editor', 'viewer'],
  viewer: ['viewer'],
};

// When setting user, expand roles
setUser(user, roleHierarchy[user.primaryRole]);
```

### Resource-Scoped Roles

Include resource context in role names:

```typescript
import { setUser } from '@zeltjs/core';
declare const user: { id: string; name: string };
// ---cut---
type Role = 
  | 'admin'
  | `project:${string}:owner`
  | `project:${string}:member`
  | `team:${string}:admin`;

// User is owner of project-123, member of team-456
setUser(user, ['project:123:owner', 'team:456:admin']);
```

### Permission-Based Roles

Use fine-grained permission strings:

```typescript
type Permission = 
  | 'read:users'
  | 'write:users'
  | 'delete:users'
  | 'read:posts'
  | 'write:posts';

// Roles map to permissions
const rolePermissions: Record<string, Permission[]> = {
  admin: ['read:users', 'write:users', 'delete:users', 'read:posts', 'write:posts'],
  editor: ['read:users', 'read:posts', 'write:posts'],
  viewer: ['read:users', 'read:posts'],
};
```

## Where Roles Come From

### Database

Store roles with the user record:

```typescript
import { setUser } from '@zeltjs/core';
declare const db: { users: { findById(id: string): Promise<{ id: string; name: string; roles: string[] }> } };
declare const payload: { sub: string };
// ---cut---
// User table
interface User {
  id: string;
  name: string;
  roles: string[];  // ['admin', 'user']
}

// In authentication middleware
const user = await db.users.findById(payload.sub);
setUser(
  { id: user.id, name: user.name },
  user.roles
);
```

### JWT Claims

Include roles in the JWT payload:

```typescript
import { Config } from '@zeltjs/core';
declare const jwtService: { sign(payload: Record<string, unknown>): Promise<string> };
declare const user: { id: string; roles: string[] };
type JwtPayload = { sub: string; roles: unknown };
@Config class JwtConfig {
  static readonly Token = JwtConfig;
  get resolveUser() { return async (p: JwtPayload) => ({ user: { id: p.sub }, roles: p.roles as string[] }); }
}
// ---cut---
// When signing
const token = await jwtService.sign({
  sub: user.id,
  roles: user.roles,
});

// When verifying (extend JwtConfig)
@Config
class MyJwtConfig extends JwtConfig {
  override get resolveUser() {
    return async (payload: JwtPayload) => ({
      user: { id: payload.sub },
      roles: payload.roles as string[],
    });
  }
}
```

### Session Data

Store roles in the session:

```typescript
import { setUser } from '@zeltjs/core';
declare function setSession(data: { userId: string; roles: string[] }): void;
declare function getSession(): { userId: string; roles: string[] } | null;
declare const db: { users: { findById(id: string): Promise<{ id: string; name: string }> } };
declare const user: { id: string; roles: string[] };
// ---cut---
// At login
setSession({ userId: user.id, roles: user.roles });

// In auth middleware
const session = getSession();
if (session) {
  const user = await db.users.findById(session.userId);
  setUser(user, session.roles);
}
```

### External Service

Fetch roles from an identity provider:

```typescript
import { setUser } from '@zeltjs/core';
declare const identityProvider: {
  getUserInfo(token: string): Promise<{ sub: string; name: string }>;
  getRoles(sub: string): Promise<string[]>;
};
declare const token: string;
// ---cut---
const userInfo = await identityProvider.getUserInfo(token);
const roles = await identityProvider.getRoles(userInfo.sub);
setUser(
  { id: userInfo.sub, name: userInfo.name },
  roles
);
```

## Role Assignment Strategies

### Static Assignment

Roles are set once and rarely change:

```typescript
import { Controller, Authorized, Post, pathParam } from '@zeltjs/core';
import { validated } from '@zeltjs/validate-valibot';
import * as v from 'valibot';
const RolesSchema = v.object({ roles: v.array(v.string()) });
declare const db: { users: { update(id: string, data: { roles: string[] }): Promise<void> } };
// ---cut---
// Admin assigns roles via API
@Controller('/users')
class UserRolesController {
  @Authorized(['admin'])
  @Post('/:id/roles')
  async assignRoles(id = pathParam('id'), data = validated(RolesSchema)) {
    await db.users.update(id, { roles: data.roles });
    return { success: true };
  }
}
```

### Dynamic Assignment

Roles are computed based on context:

```typescript
import { setUser } from '@zeltjs/core';
declare const db: { projects: { findById(id: string): Promise<{ ownerId: string; memberIds: string[] }> } };
declare const projectId: string;
declare const user: { id: string; name: string };
// ---cut---
// Roles depend on resource ownership
const project = await db.projects.findById(projectId);
const roles: string[] = [];

if (project.ownerId === user.id) {
  roles.push('project:owner');
}
if (project.memberIds.includes(user.id)) {
  roles.push('project:member');
}

setUser(user, roles);
```

### Time-Based Roles

Roles expire or activate based on time:

```typescript
import { setUser } from '@zeltjs/core';
declare const user: {
  id: string;
  name: string;
  roles: string[];
  roleGrants: Array<{ role: string; startsAt?: number; expiresAt?: number }>;
};
// ---cut---
const roles = user.roles.filter(role => {
  const grant = user.roleGrants.find(g => g.role === role);
  if (!grant) return true;
  
  const now = Date.now();
  if (grant.startsAt && now < grant.startsAt) return false;
  if (grant.expiresAt && now > grant.expiresAt) return false;
  return true;
});

setUser(user, roles);
```

## Accessing Roles

### In Handlers

```typescript
import { Controller, currentRoles, Get } from '@zeltjs/core';
// ---cut---
@Controller('/app')
class AppController {
  @Get('/dashboard')
  dashboard() {
    const roles = currentRoles();
    
    return {
      canManageUsers: roles.includes('admin'),
      canEditContent: roles.includes('editor') || roles.includes('admin'),
    };
  }
}
```

### In Services

```typescript
import { currentRoles, currentUser } from '@zeltjs/core';
type Post = { authorId: string };
interface User { id: string; }
// ---cut---
class PostService {
  canDelete(post: Post): boolean {
    const roles = currentRoles();
    const user = currentUser() as User | undefined;
    
    if (roles.includes('admin')) return true;
    if (post.authorId === user?.id) return true;
    return false;
  }
}
```

## Best Practices

### Keep Roles Simple

Use flat strings, not nested objects:

```typescript
// ✅ Good
const goodRoles = ['admin', 'editor', 'viewer'];

// ❌ Avoid
const badRoles = [{ name: 'admin', level: 10, permissions: [] }];
```

### Use Roles for Coarse Access

Roles answer "can this user access this feature area?" not "can this user edit this specific record?":

```typescript
import { Controller, Authorized, Get } from '@zeltjs/core';
// ---cut---
// ✅ Role-based: "Can access admin section"
@Controller('/admin')
class AdminController {
  @Authorized(['admin'])
  @Get('/dashboard')
  adminDashboard() {}
}

// ❌ Not a role: "Can edit post #123"
// → Handle in service logic instead
```

### Avoid Role Explosion

Don't create roles for every action:

```typescript
// ❌ Too many roles
const tooManyRoles = ['can_view_users', 'can_create_users', 'can_edit_users', 'can_delete_users'];

// ✅ Group into meaningful roles
const meaningfulRoles = ['admin', 'user_manager', 'viewer'];
```

### Document Your Roles

Maintain a central reference:

```typescript
/**
 * Application Roles
 * 
 * - admin: Full system access
 * - editor: Can create and modify content
 * - viewer: Read-only access
 * - moderator: Can manage user-generated content
 */
type Role = 'admin' | 'editor' | 'viewer' | 'moderator';
```
