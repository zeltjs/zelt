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

## 型安全なUser Context {#type-safe-user-context}

デフォルトでは、`currentUser()` は `Record<string, unknown>` を返します。宣言のマージ(declaration merging)を使って `RequestContextSchema` を拡張すると、完全な型安全性が得られます。

```typescript
// @noErrors
// 理由: module augmentationには完全なモジュール解決が必要だが、Twoslash VFSでは利用できないため
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

これで、ユーザーに関連するすべての関数に型が付きます。

```typescript
// @noErrors
// 理由: module augmentationには完全なモジュール解決が必要だが、Twoslash VFSでは利用できないため
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
// TypeScriptはuser?.id、user?.name、user?.emailを認識する

const roles = currentRoles();
// TypeScriptはrolesが('admin' | 'editor' | 'user')[]であると認識する

setUser(
  { id: '123', name: 'Alice', email: 'alice@example.com' },
  ['admin', 'user']
);
// RequestContextSchemaに対して型チェックされる
```

### 型宣言をどこに置くか {#where-to-put-the-type-declaration}

プロジェクトに `types/zelt.d.ts` ファイルを作成します。

```typescript
// @noErrors
// 理由: module augmentationには完全なモジュール解決が必要だが、Twoslash VFSでは利用できないため
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

`tsconfig.json` がこのファイルをincludeしていることを確認してください。

```json
{
  "include": ["src/**/*", "types/**/*"]
}
```

## User設計のBest Practices {#user-design-best-practices}

### 最小限に保つ {#keep-it-minimal}

ハンドラーで必要なフィールドだけを含めます。データベースレコード全体をコピーしないでください。

```typescript
// ---cut---
// ✅ Good — 最小限のcontext
interface RequestContextSchemaGood {
  user: {
    id: string;
    name: string;
  };
}

// ❌ Avoid — データが多すぎる
interface RequestContextSchemaBad {
  user: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;  // 機微なデータは含めない
    createdAt: Date;
    updatedAt: Date;
    preferences: object;
    // ...さらに20個のフィールド
  };
}
```

### 必要な時に追加データを取得する {#fetch-additional-data-when-needed}

特定のハンドラー内で、ユーザーIDを使ってより多くのデータを取得します。

```typescript
// @noErrors
// 理由: module augmentationには完全なモジュール解決が必要だが、Twoslash VFSでは利用できないため
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
// @noErrors
// 理由: module augmentationには完全なモジュール解決が必要だが、Twoslash VFSでは利用できないため
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
