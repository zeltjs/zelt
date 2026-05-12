---
sidebar_position: 2
---

# アクセス制御

`@Authorized`デコレータはルートに認証とロール要件を強制します。

## 基本的な使い方

### 認証を要求

引数なしの`@Authorized()`で認証済みユーザーを要求：

```typescript
import { Controller, Get, Authorized } from '@zeltjs/core';

@Controller('/dashboard')
class DashboardController {
  @Authorized()
  @Get('/')
  index() {
    return { stats: [] };
  }
}
```

ユーザーが設定されていない場合、`401 Unauthorized`を返します：

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

### 特定のロールを要求

ロール名を渡してアクセスを制限：

```typescript
@Controller('/admin')
class AdminController {
  @Authorized(['admin'])
  @Get('/users')
  listUsers() {
    return { users: [] };
  }
}
```

ユーザーが必要なロールを持っていない場合、`403 Forbidden`を返します：

```json
{
  "code": "FORBIDDEN",
  "message": "Insufficient permissions"
}
```

## ロールマッチング

### OR論理（いずれかのロール）

デフォルトでは、ユーザーが指定されたロールの**いずれか**を持っていればアクセスが許可されます：

```typescript
@Authorized(['admin', 'moderator'])
@Delete('/posts/:id')
removePost() {
  // ユーザーは 'admin' または 'moderator' が必要
}
```

### AND論理（すべてのロール）

AND論理の場合、複数の`@Authorized`デコレータを使用：

```typescript
@Authorized(['verified'])
@Authorized(['premium'])
@Get('/exclusive-content')
exclusiveContent() {
  // ユーザーは 'verified' かつ 'premium' が必要
}
```

またはハンドラー内でチェック：

```typescript
@Authorized()
@Get('/exclusive-content')
exclusiveContent(roles = currentRoles()) {
  if (!roles.includes('verified') || !roles.includes('premium')) {
    throw new HTTPException(403, { message: 'プレミアム認証済みユーザー限定' });
  }
  return { content: '...' };
}
```

## デコレータの配置

### メソッドレベル

特定のルートに適用：

```typescript
@Controller('/posts')
class PostController {
  @Get('/')
  list() {
    // パブリック — 認証不要
  }

  @Authorized()
  @Post('/')
  create() {
    // 認証が必要
  }

  @Authorized(['admin'])
  @Delete('/:id')
  delete() {
    // adminロールが必要
  }
}
```

### 他のデコレータと組み合わせ

`@Authorized`は他のメソッドデコレータと連携：

```typescript
@Authorized()
@UseMiddleware(rateLimitMiddleware)
@Post('/posts')
create(body = bodyParam(CreatePostSchema)) {
  return { created: true };
}
```

## エラーレスポンス

| ステータス | コード | 条件 |
|------------|--------|------|
| 401 | `UNAUTHORIZED` | ユーザーが設定されていない（未認証） |
| 403 | `FORBIDDEN` | ユーザーに必要なロールがない |

### エラーメッセージのカスタマイズ

エラーハンドラーで認可エラーを処理：

```typescript
import { createApp, isHttpException } from '@zeltjs/core';

const app = createApp({
  http: {
    controllers: [...],
    onError: (error, c) => {
      if (isHttpException(error)) {
        if (error.status === 401) {
          return c.json({
            error: '続行するにはログインしてください',
            loginUrl: '/auth/login',
          }, 401);
        }
        if (error.status === 403) {
          return c.json({
            error: 'このリソースにアクセスする権限がありません',
            requiredRoles: error.message,
          }, 403);
        }
      }
      throw error;
    },
  },
});
```

## 一般的なパターン

### オプショナル認証のパブリックルート

`@Authorized`を使用せず、ユーザーを手動でチェック：

```typescript
@Get('/posts/:id')
getPost(id = pathParam('id'), user = currentUser()) {
  const post = await db.posts.findById(id);
  
  return {
    ...post,
    canEdit: user?.id === post.authorId,
  };
}
```

### オーナー限定アクセス

`@Authorized`と所有権チェックを組み合わせ：

```typescript
@Authorized()
@Put('/posts/:id')
async updatePost(id = pathParam('id'), body = bodyParam(UpdateSchema)) {
  const user = currentUser();
  const post = await db.posts.findById(id);
  
  if (post.authorId !== user.id && !currentRoles().includes('admin')) {
    throw new HTTPException(403, { message: 'あなたの投稿ではありません' });
  }
  
  return db.posts.update(id, body);
}
```

### ロール階層

階層内の任意のロールをチェック：

```typescript
const isEditor = (roles: string[]) =>
  roles.some(r => ['admin', 'editor'].includes(r));

@Authorized()
@Put('/posts/:id')
updatePost(roles = currentRoles()) {
  if (!isEditor(roles)) {
    throw new HTTPException(403, { message: '編集者のみ' });
  }
  // ...
}
```

### リソーススコープ認可

複雑なシナリオでは、ロジックをサービスに移動：

```typescript
class PostAuthService {
  canView(post: Post): boolean {
    if (post.isPublic) return true;
    const user = currentUser();
    return user?.id === post.authorId;
  }

  canEdit(post: Post): boolean {
    const user = currentUser();
    const roles = currentRoles();
    if (roles.includes('admin')) return true;
    return user?.id === post.authorId;
  }

  canDelete(post: Post): boolean {
    const roles = currentRoles();
    return roles.includes('admin');
  }
}

@Controller('/posts')
class PostController {
  constructor(private auth = inject(PostAuthService)) {}

  @Authorized()
  @Delete('/:id')
  async delete(id = pathParam('id')) {
    const post = await db.posts.findById(id);
    
    if (!this.auth.canDelete(post)) {
      throw new HTTPException(403, { message: 'この投稿を削除できません' });
    }
    
    await db.posts.delete(id);
    return { deleted: true };
  }
}
```

## 保護されたルートのテスト

### 認証なし

```typescript
it('未認証リクエストに401を返す', async () => {
  const client = createTestClient(app);
  const res = await client.get('/dashboard');
  
  expect(res.status).toBe(401);
});
```

### 認証あり

```typescript
it('認証済みユーザーにデータを返す', async () => {
  const client = createTestClient(app);
  
  // 認証コンテキストを設定
  setUser({ id: '123', name: 'Test' }, ['user']);
  
  const res = await client.get('/dashboard');
  expect(res.status).toBe(200);
});
```

### ロール要件のテスト

```typescript
it('非adminユーザーに403を返す', async () => {
  const client = createTestClient(app);
  
  setUser({ id: '123', name: 'Test' }, ['user']);  // adminではない
  
  const res = await client.get('/admin/users');
  expect(res.status).toBe(403);
});

it('adminアクセスを許可', async () => {
  const client = createTestClient(app);
  
  setUser({ id: '123', name: 'Test' }, ['admin']);
  
  const res = await client.get('/admin/users');
  expect(res.status).toBe(200);
});
```

## ベストプラクティス

1. **保護されたルートには`@Authorized()`を使用** — 基本的な認証要件のために手動で`currentUser()`をチェックしない

2. **ロールチェックは粗く保つ** — `@Authorized`は機能レベルのアクセスに、サービスはリソースレベルのロジックに

3. **フェイルクローズ** — 迷ったらアクセスを拒否。許可するより取り消す方が難しい

4. **認可失敗をログ** — セキュリティ監視のために失敗したアクセス試行を追跡

5. **両方のパスをテスト** — 常に認証済みと未認証のシナリオをテスト
