---
sidebar_position: 1
---

# Roles

RoleはZeltの認可システムの基盤です。ユーザーが何をできるかを定義します。

## Roleとは何か? {#what-is-a-role}

roleは、権限レベルや能力を表すシンプルな文字列です。

```typescript
const adminRoles = ['admin', 'editor', 'viewer'];
const teamRoles = ['owner', 'member', 'guest'];
const permissionRoles = ['read:users', 'write:users', 'delete:users'];
```

roleは、認証時に `setUser()` を通じて割り当てられます。

```typescript
import { setUser } from '@zeltjs/core';
declare const user: { id: string; name: string };
// ---cut---
setUser(
  { id: user.id, name: user.name },
  ['admin', 'user']  // ← role
);
```

## Role Typeを定義する {#defining-role-types}

`RequestContextSchema` を使ってroleを型付けします。

```typescript
// @noErrors
// 理由: module augmentationには完全なモジュール解決が必要だが、Twoslash VFSでは利用できないため
import '@zeltjs/core';
// ---cut---
declare module '@zeltjs/core' {
  interface RequestContextSchema {
    user: { id: string; name: string };
    authRoles: ('admin' | 'editor' | 'viewer')[];
  }
}
```

これにより次が得られます。
- `setUser()` 呼び出し時の自動補完
- `@Authorized(['...'])` での型チェック
- 型安全な `currentRoles()` の戻り値

## Role設計パターン {#role-design-patterns}

### Hierarchical Roles {#hierarchical-roles}

他のroleを包含するroleを定義します。

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

// userを設定する際、roleを展開する
setUser(user, roleHierarchy[user.primaryRole]);
```

### Resource-Scoped Roles {#resource-scoped-roles}

role名にリソースのcontextを含めます。

```typescript
import { setUser } from '@zeltjs/core';
declare const user: { id: string; name: string };
// ---cut---
type Role = 
  | 'admin'
  | `project:${string}:owner`
  | `project:${string}:member`
  | `team:${string}:admin`;

// userはproject-123のowner、team-456のmember
setUser(user, ['project:123:owner', 'team:456:admin']);
```

### Permission-Based Roles {#permission-based-roles}

きめ細かい権限文字列を使います。

```typescript
type Permission = 
  | 'read:users'
  | 'write:users'
  | 'delete:users'
  | 'read:posts'
  | 'write:posts';

// roleはpermissionにマッピングされる
const rolePermissions: Record<string, Permission[]> = {
  admin: ['read:users', 'write:users', 'delete:users', 'read:posts', 'write:posts'],
  editor: ['read:users', 'read:posts', 'write:posts'],
  viewer: ['read:users', 'read:posts'],
};
```

## Roleはどこから来るのか {#where-roles-come-from}

### Database {#database}

roleをユーザーレコードと一緒に保存します。

```typescript
import { Middleware, Injectable, inject, setUser, type RequestContext, type Next } from '@zeltjs/core';
import { JwtService } from '@zeltjs/auth-jwt';

type User = { id: string; name: string; roles: string[] };

@Injectable()
class UserRepository {
  async findById(id: string): Promise<User> {
    return { id, name: '', roles: [] };
  }
}
// ---cut---
@Middleware
class AuthMiddleware {
  constructor(
    private jwtService = inject(JwtService),
    private userRepo = inject(UserRepository)
  ) {}

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      const payload = await this.jwtService.verify(token);
      const user = await this.userRepo.findById(payload.sub!);
      setUser({ id: user.id, name: user.name }, user.roles);
    }
    await next();
    return undefined;
  }
}
```

### JWT Claims {#jwt-claims}

JWTのpayloadにroleを含めます。

```typescript
import { Controller, Post, Config, inject } from '@zeltjs/core';
import { JwtService, JwtConfig, type JwtPayload, type ResolveUserResult } from '@zeltjs/auth-jwt';

type User = { id: string; roles: string[] };
// ---cut---
@Controller('/auth')
class AuthController {
  constructor(private jwtService = inject(JwtService)) {}

  @Post('/login')
  async login(user: User) {
    const token = await this.jwtService.sign({
      sub: user.id,
      roles: user.roles,
    });
    return { token };
  }
}

@Config
class MyJwtConfig extends JwtConfig {
  override get resolveUser(): (payload: JwtPayload) => Promise<ResolveUserResult> {
    return async (payload) => ({
      user: { id: payload.sub! },
      roles: payload.roles as string[],
    });
  }
}
```

### Session Data {#session-data}

roleをセッションに保存します。

```typescript
import { Middleware, Injectable, inject, setUser, type RequestContext, type Next } from '@zeltjs/core';

type Session = { userId: string; roles: string[] };
type User = { id: string; name: string };

@Injectable()
class SessionService {
  getSession(): Session | null {
    return null;
  }

  setSession(_data: Session): void {}
}

@Injectable()
class UserRepository {
  async findById(id: string): Promise<User> {
    return { id, name: '' };
  }
}
// ---cut---
@Middleware
class SessionAuthMiddleware {
  constructor(
    private sessionService = inject(SessionService),
    private userRepo = inject(UserRepository)
  ) {}

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const session = this.sessionService.getSession();
    if (session) {
      const user = await this.userRepo.findById(session.userId);
      setUser(user, session.roles);
    }
    await next();
    return undefined;
  }
}
```

### External Service {#external-service}

identity providerからroleを取得します。

```typescript
import { Middleware, Injectable, inject, setUser, type RequestContext, type Next } from '@zeltjs/core';

type UserInfo = { sub: string; name: string };

@Injectable()
class IdentityProviderService {
  async getUserInfo(token: string): Promise<UserInfo> {
    return { sub: '', name: '' };
  }

  async getRoles(sub: string): Promise<string[]> {
    return [];
  }
}
// ---cut---
@Middleware
class ExternalAuthMiddleware {
  constructor(private idp = inject(IdentityProviderService)) {}

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      const userInfo = await this.idp.getUserInfo(token);
      const roles = await this.idp.getRoles(userInfo.sub);
      setUser({ id: userInfo.sub, name: userInfo.name }, roles);
    }

    await next();
    return undefined;
  }
}
```

## Role割り当ての戦略 {#role-assignment-strategies}

### Static Assignment {#static-assignment}

roleは一度設定されると、めったに変わりません。

```typescript
import { Controller, Authorized, Post, Injectable, inject } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import * as v from 'valibot';

const RolesSchema = v.object({ roles: v.array(v.string()) });

@Injectable()
class UserRepository {
  async updateRoles(id: string, roles: string[]): Promise<void> {}
}
// ---cut---
@Controller('/users')
class UserRolesController {
  constructor(private userRepo = inject(UserRepository)) {}

  @Authorized(['admin'])
  @Post('/:id/roles')
  async assignRoles(req = request(RolesSchema)) {
    const id = req.pathParam('id');
    const data = await req.body();
    await this.userRepo.updateRoles(id, data.roles);
    return { success: true };
  }
}
```

### Dynamic Assignment {#dynamic-assignment}

roleはcontextに応じて計算されます。

```typescript
import { Middleware, Injectable, inject, setUser, currentUser, type RequestContext, type Next } from '@zeltjs/core';

type Project = { ownerId: string; memberIds: string[] };
type User = { id: string; name: string };

@Injectable()
class ProjectRepository {
  async findById(id: string): Promise<Project> {
    return { ownerId: '', memberIds: [] };
  }
}
// ---cut---
@Middleware
class ProjectRolesMiddleware {
  constructor(private projectRepo = inject(ProjectRepository)) {}

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const user = currentUser() as User | undefined;
    const projectId = c.req.param('projectId');

    if (user && projectId) {
      const project = await this.projectRepo.findById(projectId);
      const roles: string[] = [];

      if (project.ownerId === user.id) {
        roles.push('project:owner');
      }
      if (project.memberIds.includes(user.id)) {
        roles.push('project:member');
      }

      setUser(user, roles);
    }

    await next();
    return undefined;
  }
}
```

### Time-Based Roles {#time-based-roles}

roleが時間に応じて失効・有効化されます。

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

## Roleへアクセスする {#accessing-roles}

### Handler内で {#in-handlers}

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

### Service内で {#in-services}

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

## Best Practices {#best-practices}

### Roleをシンプルに保つ {#keep-roles-simple}

ネストしたオブジェクトではなく、フラットな文字列を使います。

```typescript
// ✅ Good
const goodRoles = ['admin', 'editor', 'viewer'];

// ❌ Avoid
const badRoles = [{ name: 'admin', level: 10, permissions: [] }];
```

### Roleは粗いアクセス制御に使う {#use-roles-for-coarse-access}

roleが答えるのは「このユーザーはこの機能領域にアクセスできるか?」であり、「このユーザーはこの特定のレコードを編集できるか?」ではありません。

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

### Roleの爆発を避ける {#avoid-role-explosion}

すべての操作ごとにroleを作らないでください。

```typescript
// ❌ Too many roles
const tooManyRoles = ['can_view_users', 'can_create_users', 'can_edit_users', 'can_delete_users'];

// ✅ Group into meaningful roles
const meaningfulRoles = ['admin', 'user_manager', 'viewer'];
```

### Roleを文書化する {#document-your-roles}

中央のリファレンスを維持します。

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
