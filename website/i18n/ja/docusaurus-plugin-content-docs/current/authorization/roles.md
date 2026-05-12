---
sidebar_position: 1
---

# ロール

ロールはZeltの認可システムの基盤です。ユーザーが何をできるかを定義します。

## ロールとは

ロールは権限レベルや能力を表すシンプルな文字列です：

```typescript
['admin', 'editor', 'viewer']
['owner', 'member', 'guest']
['read:users', 'write:users', 'delete:users']
```

ロールは認証時に`setUser()`で割り当てられます：

```typescript
setUser(
  { id: user.id, name: user.name },
  ['admin', 'user']  // ← ロール
);
```

## ロール型の定義

`RequestContextSchema`を使用してロールを型付け：

```typescript
declare module '@zeltjs/core' {
  interface RequestContextSchema {
    user: { id: string; name: string };
    authRoles: ('admin' | 'editor' | 'viewer')[];
  }
}
```

これにより以下が提供されます：
- `setUser()`呼び出し時の自動補完
- `@Authorized(['...'])`での型チェック
- 型安全な`currentRoles()`の戻り値

## ロール設計パターン

### 階層型ロール

他のロールを暗示するロールを定義：

```typescript
type Role = 'admin' | 'editor' | 'viewer';

const roleHierarchy: Record<Role, Role[]> = {
  admin: ['admin', 'editor', 'viewer'],
  editor: ['editor', 'viewer'],
  viewer: ['viewer'],
};

// ユーザー設定時にロールを展開
setUser(user, roleHierarchy[user.primaryRole]);
```

### リソーススコープ付きロール

ロール名にリソースコンテキストを含める：

```typescript
type Role = 
  | 'admin'
  | `project:${string}:owner`
  | `project:${string}:member`
  | `team:${string}:admin`;

// ユーザーはproject-123のオーナー、team-456の管理者
setUser(user, ['project:123:owner', 'team:456:admin']);
```

### 権限ベースロール

きめ細かい権限文字列を使用：

```typescript
type Permission = 
  | 'read:users'
  | 'write:users'
  | 'delete:users'
  | 'read:posts'
  | 'write:posts';

// ロールは権限にマップ
const rolePermissions: Record<string, Permission[]> = {
  admin: ['read:users', 'write:users', 'delete:users', 'read:posts', 'write:posts'],
  editor: ['read:users', 'read:posts', 'write:posts'],
  viewer: ['read:users', 'read:posts'],
};
```

## ロールの取得元

### データベース

ユーザーレコードとともにロールを保存：

```typescript
// Userテーブル
interface User {
  id: string;
  name: string;
  roles: string[];  // ['admin', 'user']
}

// 認証ミドルウェアで
const user = await db.users.findById(payload.sub);
setUser(
  { id: user.id, name: user.name },
  user.roles
);
```

### JWTクレーム

JWTペイロードにロールを含める：

```typescript
// 署名時
const token = await jwtService.sign({
  sub: user.id,
  roles: user.roles,
});

// 検証時（JwtConfig.resolveUserで）
override get resolveUser() {
  return async (payload: JwtPayload) => ({
    user: { id: payload.sub },
    roles: payload.roles as string[],
  });
}
```

### セッションデータ

セッションにロールを保存：

```typescript
// ログイン時
setSession({ userId: user.id, roles: user.roles });

// 認証ミドルウェアで
const session = getSession();
if (session) {
  const user = await db.users.findById(session.userId);
  setUser(user, session.roles);
}
```

### 外部サービス

IDプロバイダーからロールを取得：

```typescript
const userInfo = await identityProvider.getUserInfo(token);
const roles = await identityProvider.getRoles(userInfo.sub);
setUser(
  { id: userInfo.sub, name: userInfo.name },
  roles
);
```

## ロール割り当て戦略

### 静的割り当て

ロールは一度設定され、めったに変更されない：

```typescript
// 管理者がAPIでロールを割り当て
@Authorized(['admin'])
@Post('/users/:id/roles')
async assignRoles(id = pathParam('id'), body = bodyParam(RolesSchema)) {
  await db.users.update(id, { roles: body.roles });
  return { success: true };
}
```

### 動的割り当て

ロールはコンテキストに基づいて計算される：

```typescript
// ロールはリソースの所有権に依存
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

### 時間ベースロール

ロールは時間に基づいて期限切れまたは有効化：

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

## ロールへのアクセス

### ハンドラー内で

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

### サービス内で

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

## ベストプラクティス

### ロールはシンプルに

フラットな文字列を使用し、ネストしたオブジェクトは避ける：

```typescript
// ✅ 良い
['admin', 'editor', 'viewer']

// ❌ 避ける
[{ name: 'admin', level: 10, permissions: [...] }]
```

### ロールは粗いアクセスに使用

ロールは「このユーザーはこの機能エリアにアクセスできるか？」を答える、「このユーザーはこの特定のレコードを編集できるか？」ではない：

```typescript
// ✅ ロールベース: 「管理セクションにアクセスできる」
@Authorized(['admin'])
@Get('/admin/dashboard')

// ❌ ロールではない: 「投稿#123を編集できる」
// → 代わりにサービスロジックで処理
```

### ロール爆発を避ける

すべてのアクションに対してロールを作成しない：

```typescript
// ❌ ロールが多すぎる
['can_view_users', 'can_create_users', 'can_edit_users', 'can_delete_users', ...]

// ✅ 意味のあるロールにグループ化
['admin', 'user_manager', 'viewer']
```

### ロールをドキュメント化

中央リファレンスを維持：

```typescript
/**
 * アプリケーションロール
 * 
 * - admin: システム全体へのフルアクセス
 * - editor: コンテンツの作成・編集が可能
 * - viewer: 読み取り専用アクセス
 * - moderator: ユーザー生成コンテンツの管理が可能
 */
type Role = 'admin' | 'editor' | 'viewer' | 'moderator';
```
