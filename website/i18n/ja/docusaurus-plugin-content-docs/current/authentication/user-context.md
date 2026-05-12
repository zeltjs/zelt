---
sidebar_position: 2
---

# ユーザーコンテキスト

Zeltはリクエストスコープの関数を提供し、認証済みユーザーにアクセス・管理できます。

## コア関数

| 関数 | 説明 |
|------|------|
| `setUser(user, roles)` | 認証済みユーザーを設定（ミドルウェアで呼び出す） |
| `currentUser()` | 現在のユーザーを取得（未認証の場合は`undefined`） |
| `currentRoles()` | 現在のユーザーのロールを取得（未認証の場合は`[]`） |

## ユーザーの設定

認証情報を検証した後、認証ミドルウェアで`setUser()`を呼び出します：

```typescript
import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';

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

### パラメータ

- **user** — 認証済みユーザーを表す任意のオブジェクト
- **roles** — ロール文字列の配列（例: `['admin', 'user']`）

## ユーザーへのアクセス

### ルートハンドラー内で

`currentUser()`を使用して認証済みユーザーにアクセス：

```typescript
import { Controller, Get, currentUser, currentRoles } from '@zeltjs/core';

@Controller('/profile')
class ProfileController {
  @Get('/me')
  me() {
    const user = currentUser();
    const roles = currentRoles();
    
    if (!user) {
      throw new HTTPException(401, { message: '認証されていません' });
    }
    
    return { user, roles, isAdmin: roles.includes('admin') };
  }
}
```

### デフォルトパラメータで

ハンドラーシグネチャを簡潔にするには、デフォルトパラメータを使用：

```typescript
@Controller('/profile')
class ProfileController {
  @Get('/me')
  me(user = currentUser()) {
    return user;
  }
}
```

## 型安全なユーザーコンテキスト

デフォルトでは`currentUser()`は`unknown`を返します。`RequestContextSchema`を拡張して完全な型安全性を得られます：

```typescript
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

これですべてのユーザー関連関数が型付けされます：

```typescript
const user = currentUser();
// TypeScriptが認識: user?.id, user?.name, user?.email

const roles = currentRoles();
// TypeScriptが認識: roles は ('admin' | 'editor' | 'user')[]

setUser(
  { id: '123', name: 'Alice', email: 'alice@example.com' },
  ['admin', 'user']
);
// RequestContextSchemaに対して型チェック
```

### 型宣言の配置場所

プロジェクトに`types/zelt.d.ts`ファイルを作成：

```typescript
// types/zelt.d.ts
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

`tsconfig.json`にこのファイルが含まれることを確認：

```json
{
  "include": ["src/**/*", "types/**/*"]
}
```

## ユーザー設計のベストプラクティス

### 最小限に保つ

ハンドラーで必要なフィールドのみを含める。データベースレコード全体をコピーしない：

```typescript
// ✅ 良い — 最小限のコンテキスト
interface RequestContextSchema {
  user: {
    id: string;
    name: string;
  };
}

// ❌ 避ける — データが多すぎる
interface RequestContextSchema {
  user: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;  // 機密データは絶対に含めない
    createdAt: Date;
    updatedAt: Date;
    preferences: object;
    // ... さらに20フィールド
  };
}
```

### 必要時に追加データを取得

ユーザーIDを使用して特定のハンドラーでより多くのデータを取得：

```typescript
@Controller('/settings')
class SettingsController {
  @Authorized()
  @Get('/')
  async getSettings(user = currentUser()) {
    const fullUser = await db.users.findById(user.id);
    return { preferences: fullUser.preferences };
  }
}
```

### ロールの粒度を検討

ロールはシンプルな文字列にすべき。複雑な権限ロジックはサービスに：

```typescript
// ✅ 良い — シンプルなロール
authRoles: ('admin' | 'editor' | 'viewer')[];

// ❌ 避ける — 過度に具体的なロール
authRoles: ('can_edit_posts' | 'can_delete_posts' | 'can_view_analytics' | ...)[];
```

きめ細かい権限については、サービスレイヤーでロールをチェック：

```typescript
class PostService {
  canEdit(post: Post, user = currentUser(), roles = currentRoles()): boolean {
    if (roles.includes('admin')) return true;
    if (roles.includes('editor') && post.authorId === user.id) return true;
    return false;
  }
}
```
