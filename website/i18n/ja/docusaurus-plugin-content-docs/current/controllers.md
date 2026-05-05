---
sidebar_position: 3
---

# コントローラー

コントローラーは、受信**リクエスト**を処理し、クライアントに**レスポンス**を返す役割を担います。

## コントローラーの定義

コントローラーは`@Controller()`デコレーターで装飾されたクラスです。デコレーターはパスプレフィックスを受け取り、コントローラー内で定義されたすべてのルートに付加されます。

```typescript
import { Controller, Get, Post, pathParam, validated, response } from '@koya/core';
import * as v from 'valibot';

const CreateUserBody = v.object({
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
});

@Controller('/users')
export class UserController {
  @Get('/')
  findAll() {
    return { users: [] };
  }

  @Get('/:id')
  findOne(id = pathParam('id')) {
    return { id, name: 'John Doe' };
  }

  @Post('/')
  create(body = validated(CreateUserBody), res = response()) {
    return res.json({ id: '1', ...body }, 201);
  }
}
```

## HTTPメソッドデコレーター

Koyaは標準的なHTTPメソッドすべてにデコレーターを提供します：

| デコレーター | HTTPメソッド |
|-----------|-------------|
| `@Get()` | GET |
| `@Post()` | POST |
| `@Put()` | PUT |
| `@Patch()` | PATCH |
| `@Delete()` | DELETE |

```typescript
@Controller('/items')
export class ItemController {
  @Get('/')
  findAll() { /* ... */ }

  @Get('/:id')
  findOne(id = pathParam('id')) { /* ... */ }

  @Post('/')
  create(body = validated(schema)) { /* ... */ }

  @Put('/:id')
  update(id = pathParam('id'), body = validated(schema)) { /* ... */ }

  @Patch('/:id')
  patch(id = pathParam('id'), body = validated(schema)) { /* ... */ }

  @Delete('/:id')
  remove(id = pathParam('id')) { /* ... */ }
}
```

## ルートパラメーター

`pathParam()`を使用してルートパラメーターを抽出します：

```typescript
@Get('/:category/:id')
findOne(
  category = pathParam('category'),
  id = pathParam('id')
) {
  return { category, id };
}
```

## リクエストボディのバリデーション

`validated()`とValibotスキーマを使用してリクエストボディを検証・型付けします：

```typescript
import * as v from 'valibot';

const CreatePostBody = v.object({
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  content: v.string(),
  tags: v.optional(v.array(v.string())),
});

@Post('/')
create(body = validated(CreatePostBody)) {
  // bodyは完全に型付け: { title: string; content: string; tags?: string[] }
  return { id: '1', ...body };
}
```

バリデーションが失敗した場合、Koyaは自動的に詳細なエラー情報を含む400レスポンスを返します。

## カスタムレスポンスステータス

`response()`を使用してHTTPステータスコードを制御します：

```typescript
@Post('/')
create(body = validated(schema), res = response()) {
  const created = { id: '1', ...body };
  return res.json(created, 201); // 201 Createdを返す
}

@Delete('/:id')
remove(id = pathParam('id'), res = response()) {
  return res.json(null, 204); // 204 No Contentを返す
}
```

## コントローラーの登録

コントローラーは`createHttpApp()`で登録する必要があります：

```typescript
import { createHttpApp } from '@koya/core';
import { UserController } from './controllers/user.controller';
import { PostController } from './controllers/post.controller';

export const app = createHttpApp({
  controllers: [UserController, PostController],
});
```

## 次のステップ

- [ミドルウェア](./middleware.md)でリクエスト/レスポンスの処理について学ぶ
