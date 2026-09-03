---
sidebar_position: 2
---

# Access Control

`@Authorized` decoratorは、ルートに対して認証とroleの要件を強制します。

## 基本的な使い方 {#basic-usage}

### 認証を要求する {#require-authentication}

引数なしで `@Authorized()` を使うと、認証済みユーザーであれば誰でも許可されます。

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

userが設定されていない場合、`401 Unauthorized` を返します。

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

### 特定のRoleを要求する {#require-specific-roles}

アクセスを制限するには、role名を渡します。

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

ユーザーが必要なroleを持っていない場合、`403 Forbidden` を返します。

```json
{
  "code": "FORBIDDEN",
  "message": "Insufficient permissions"
}
```

## Roleのマッチング {#role-matching}

### OR Logic(いずれかのRole) {#or-logic-any-role}

デフォルトでは、ユーザーが指定されたroleの**いずれか**を持っていればアクセスが許可されます。

```typescript
import { Controller, Authorized, Delete } from '@zeltjs/core';
// ---cut---
@Controller('/admin')
class AdminController {
  @Authorized(['admin', 'moderator'])
  @Delete('/posts/:id')
  removePost() {
    // 'admin' OR 'moderator' が必要
  }
}
```

### AND Logic(すべてのRole) {#and-logic-all-roles}

AND logicにするには、複数の `@Authorized` decoratorを使います。

```typescript
import { Controller, Authorized, Get } from '@zeltjs/core';
// ---cut---
@Controller('/content')
class ContentController {
  @Authorized(['verified'])
  @Authorized(['premium'])
  @Get('/exclusive-content')
  exclusiveContent() {
    // 'verified' AND 'premium' が必要
  }
}
```

またはハンドラー内でチェックします。

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

## Decoratorの配置 {#decorator-placement}

### Methodレベル {#method-level}

特定のルートに適用します。

```typescript
import { Controller, Get, Post, Delete, Authorized } from '@zeltjs/core';
// ---cut---
@Controller('/posts')
class PostController {
  @Get('/')
  list() {
    // Public — 認証不要
  }

  @Authorized()
  @Post('/')
  create() {
    // 認証が必要
  }

  @Authorized(['admin'])
  @Delete('/:id')
  delete() {
    // admin roleが必要
  }
}
```

### 他のDecoratorとの併用 {#with-other-decorators}

`@Authorized` は他のmethod decoratorと組み合わせて使えます。

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

## エラーレスポンス {#error-responses}

| ステータス | コード | 条件 |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | userが設定されていない(未認証) |
| 403 | `FORBIDDEN` | ユーザーが必要なroleを持っていない |

### エラーメッセージをカスタマイズする {#customizing-error-messages}

エラーハンドラーでauthorizationのエラーを処理します。

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

## よくあるパターン {#common-patterns}

### 任意認証の公開ルート {#public-routes-with-optional-auth}

`@Authorized` を使わず、手動でuserをチェックします。

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

### Owner限定アクセス {#owner-only-access}

`@Authorized` と所有権チェックを組み合わせます。

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

### Role Hierarchy {#role-hierarchy}

hierarchy内のいずれかのroleをチェックします。

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

### Resource-Scoped Authorization {#resource-scoped-authorization}

複雑なシナリオでは、ロジックをサービスへ移します。

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

## 保護されたルートをテストする {#testing-protected-routes}

### 認証なしの場合 {#without-authentication}

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

### 認証ありの場合 {#with-authentication}

request context内でuserを注入するmiddlewareを使います — `setUser()` はテストのセットアップ内ではなく、リクエスト処理中に呼び出す必要があります。

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

### Role要件をテストする {#testing-role-requirements}

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

## Best Practices {#best-practices}

1. **保護されたルートには `@Authorized()` を使う** — 基本的な認証要件のために、手動で `currentUser()` をチェックしない

2. **role checkは粗く保つ** — 機能レベルのアクセスには `@Authorized` を、リソースレベルのロジックにはサービスを使う

3. **fail closed(不明な場合は拒否する)** — 迷ったらアクセスを拒否する。付与するより取り消す方が難しい

4. **authorizationの失敗をログに残す** — セキュリティ監視のためにアクセス失敗の試行を追跡する

5. **両方のパスをテストする** — 認証済み・未認証の両方のシナリオを必ずテストする
