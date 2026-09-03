---
sidebar_position: 2
---

# User Context

Zeltは、認証済みユーザーへアクセスし管理するための、request-scopedな関数を提供します。

## Core Functions {#core-functions}

| 関数 | 説明 |
|----------|-------------|
| `setUser(user, roles)` | 認証済みユーザーを設定する(middlewareで呼び出す) |
| `currentUser()` | 現在のユーザーを取得する(未認証なら `undefined` を返す) |
| `currentRoles()` | 現在のユーザーのroleを取得する(未認証なら `[]` を返す) |

## ユーザーを設定する {#setting-the-user}

認証情報を検証した後、認証middleware内で `setUser()` を呼び出します。

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

### Parameters {#parameters}

- **user** — 認証済みユーザーを表す任意のオブジェクト
- **roles** — role文字列の配列(例: `['admin', 'user']`)

## ユーザーへアクセスする {#accessing-the-user}

### Route Handler内で {#in-route-handlers}

認証済みユーザーへアクセスするには `currentUser()` を使います。

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

### デフォルト引数を使う {#with-default-parameters}

ハンドラーのシグネチャをすっきりさせるには、デフォルト引数を使います。

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

## Typed Access {#typed-access}

`currentUser()` は常に `Record<string, unknown> | undefined` を返します。`setUser()` に渡した形は型レベルでは追跡されないため、特定のフィールドを読み取るには手動でのアサーションや絞り込みが必要です。

handlerで利用できる、具体的に絞り込まれた型の値が必要な場合は、代わりにmiddleware経由で提供します。`Next<T>` に宣言して `next(value)` に渡し、`resultOf(M)` で読み取ります。詳細は[Middleware Results](../middleware.md#middleware-results)を参照してください。

## User設計のBest Practices {#user-design-best-practices}

### 最小限に保つ {#keep-it-minimal}

ハンドラーで必要なフィールドだけを含めます。データベースレコード全体をコピーしないでください。

```typescript
import { setUser } from '@zeltjs/core';
// ---cut---
// ✅ Good — 最小限のuser
setUser({ id: '123', name: 'Alice' }, ['user']);

// ❌ Avoid — レコード全体をコピーする
setUser({
  id: '123',
  name: 'Alice',
  email: 'alice@example.com',
  passwordHash: '...',  // 機微なデータは含めない
  createdAt: new Date(),
  updatedAt: new Date(),
  preferences: {},
  // ...さらに20個のフィールド
}, ['user']);
```

### 必要な時に追加データを取得する {#fetch-additional-data-when-needed}

特定のハンドラー内で、ユーザーIDを使ってより多くのデータを取得します。

```typescript
import { Controller, Get, Authorized, Injectable, inject, currentUser } from '@zeltjs/core';

type FullUser = { preferences: object };
type SessionUser = { id: string };

const isSessionUser = (u: Record<string, unknown> | undefined): u is SessionUser =>
  typeof u?.id === 'string';

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
    if (!isSessionUser(user)) return;
    const fullUser = await this.userRepo.findById(user.id);
    return { preferences: fullUser.preferences };
  }
}
```

### Roleの粒度を考える {#consider-role-granularity}

roleはシンプルな文字列にすべきです。複雑な権限ロジックはサービス層に置きます。

```typescript
// ---cut---
// ✅ Good — シンプルなrole
type GoodRoles = ('admin' | 'editor' | 'viewer')[];

// ❌ Avoid — 過度に具体的なrole
type BadRoles = ('can_edit_posts' | 'can_delete_posts' | 'can_view_analytics')[];
```

きめ細かい権限が必要な場合は、サービス層でroleをチェックします。

```typescript
import { currentUser, currentRoles } from '@zeltjs/core';
interface Post { authorId: string; }
type SessionUser = { id: string };
const isSessionUser = (u: Record<string, unknown> | undefined): u is SessionUser =>
  typeof u?.id === 'string';
// ---cut---
function canEdit(post: Post): boolean {
  const user = currentUser();
  const roles = currentRoles();
  if (roles.includes('admin')) return true;
  if (roles.includes('editor') && isSessionUser(user) && post.authorId === user.id) return true;
  return false;
}
```
