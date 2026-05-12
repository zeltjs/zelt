---
sidebar_position: 1
---

# Roles

Roles are the foundation of Zelt's authorization system. They define what a user can do.

## What is a Role?

A role is a simple string that represents a permission level or capability:

```typescript
['admin', 'editor', 'viewer']
['owner', 'member', 'guest']
['read:users', 'write:users', 'delete:users']
```

Roles are assigned during authentication via `setUser()`:

```typescript
setUser(
  { id: user.id, name: user.name },
  ['admin', 'user']  // ← roles
);
```

## Defining Role Types

Use `RequestContextSchema` to type your roles:

```typescript
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
// When signing
const token = await jwtService.sign({
  sub: user.id,
  roles: user.roles,
});

// When verifying (in JwtConfig.resolveUser)
override get resolveUser() {
  return async (payload: JwtPayload) => ({
    user: { id: payload.sub },
    roles: payload.roles as string[],
  });
}
```

### Session Data

Store roles in the session:

```typescript
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
// Admin assigns roles via API
@Authorized(['admin'])
@Post('/users/:id/roles')
async assignRoles(id = pathParam('id'), body = bodyParam(RolesSchema)) {
  await db.users.update(id, { roles: body.roles });
  return { success: true };
}
```

### Dynamic Assignment

Roles are computed based on context:

```typescript
// Roles depend on resource ownership
const project = await db.projects.findById(projectId);
const roles = [];

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
import { currentRoles } from '@zeltjs/core';

@Get('/dashboard')
dashboard() {
  const roles = currentRoles();
  
  return {
    canManageUsers: roles.includes('admin'),
    canEditContent: roles.includes('editor') || roles.includes('admin'),
  };
}
```

### In Services

```typescript
class PostService {
  canDelete(post: Post): boolean {
    const roles = currentRoles();
    const user = currentUser();
    
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
['admin', 'editor', 'viewer']

// ❌ Avoid
[{ name: 'admin', level: 10, permissions: [...] }]
```

### Use Roles for Coarse Access

Roles answer "can this user access this feature area?" not "can this user edit this specific record?":

```typescript
// ✅ Role-based: "Can access admin section"
@Authorized(['admin'])
@Get('/admin/dashboard')

// ❌ Not a role: "Can edit post #123"
// → Handle in service logic instead
```

### Avoid Role Explosion

Don't create roles for every action:

```typescript
// ❌ Too many roles
['can_view_users', 'can_create_users', 'can_edit_users', 'can_delete_users', ...]

// ✅ Group into meaningful roles
['admin', 'user_manager', 'viewer']
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
