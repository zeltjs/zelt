---
---

# Controllers

Controllerは、送られてくる**リクエスト**を処理し、クライアントへ**レスポンス**を返す責務を持ちます。

## Defining Controllers {#defining-controllers}

controllerは`@Controller()`でデコレートされたクラスです。このデコレータはパスプレフィックスを受け取り、controller内で定義される全てのルートの先頭に付加されます。

```typescript
import { Controller, Get, Post, response } from '@zeltjs/core';
import { request } from '@zeltjs/core';
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
  findOne(req = request()) {
    const id = req.pathParam('id');
    return { id, name: 'John Doe' };
  }

  @Post('/')
  async create(req = request(CreateUserBody), res = response()) {
    const body = await req.body();
    return res.json({ id: '1', ...body }, 201);
  }
}

// ---cut-after---
import { expect, test } from 'vitest';

test('UserController.findAll returns users array', () => {
  const controller = new UserController();
  expect(controller.findAll()).toEqual({ users: [] });
});
```

## Route Path Rules {#route-path-rules}

`@Controller`のプレフィックスとメソッドデコレータのパスは結合されて最終的なルートになります。末尾のスラッシュは取り除かれ、メソッドパスの先頭のスラッシュは省略可能です。

| Controller Prefix | Method Path | Final Route |
|-------------------|-------------|-------------|
| `'/users'` | `'/'` | `/users` |
| `'/users'` | `'/:id'` | `/users/:id` |
| `'/api'` | `'/users'` | `/api/users` |
| `'/'` | `'/hello'` | `/hello` |
| `'/api/v1'` | `'/users/:id'` | `/api/v1/users/:id` |

:::tip
`@Get('/items')`と`@Get('items')`はどちらも同じ結果になります — 先頭のスラッシュが省略されていれば自動で付加されます。
:::

## HTTP Method Decorators {#http-method-decorators}

Zeltは全ての標準HTTPメソッドに対応するデコレータを提供します:

| Decorator | HTTP Method |
|-----------|-------------|
| `@Get()` | GET |
| `@Post()` | POST |
| `@Put()` | PUT |
| `@Patch()` | PATCH |
| `@Delete()` | DELETE |

```typescript
import { Controller, Get, Post, Put, Patch, Delete } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import * as v from 'valibot';
const schema = v.object({ name: v.string() });
// ---cut---
@Controller('/items')
export class ItemController {
  @Get('/')
  findAll() { /* ... */ }

  @Get('/:id')
  findOne(req = request()) {
    const id = req.pathParam('id');
    /* ... */
  }

  @Post('/')
  async create(req = request(schema)) {
    const body = await req.body();
    /* ... */
  }

  @Put('/:id')
  async update(req = request(schema)) {
    const id = req.pathParam('id');
    const body = await req.body();
    /* ... */
  }

  @Patch('/:id')
  async patch(req = request(schema)) {
    const id = req.pathParam('id');
    const body = await req.body();
    /* ... */
  }

  @Delete('/:id')
  remove(req = request()) {
    const id = req.pathParam('id');
    /* ... */
  }
}
```

## Route Parameters {#route-parameters}

`request()`をハンドラのパラメータとして注入し、`req.pathParam()`でルートパラメータを取り出します:

```typescript
import { Controller, Get, request } from '@zeltjs/core';
// ---cut---
@Controller('/items')
class ItemController {
  @Get('/:category/:id')
  findOne(req = request()) {
    const category = req.pathParam('category');
    const id = req.pathParam('id');
    return { category, id };
  }
}
```

## Request Body {#request-body}

### With Validation (Recommended) {#with-validation-recommended}

Valibot schemaを渡した`request()`を使うことで、リクエストボディをバリデーションし型付けできます:

```typescript
import { Controller, Post } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import * as v from 'valibot';
// ---cut---
const CreatePostBody = v.object({
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  content: v.string(),
  tags: v.optional(v.array(v.string())),
});

@Controller('/posts')
class PostController {
  @Post('/')
  async create(req = request(CreatePostBody)) {
    const body = await req.body();
    // bodyは { title: string; content: string; tags?: string[] } として完全に型付けされる
    return { id: '1', ...body };
  }
}
```

バリデーションが失敗すると、Zeltは詳細なエラー情報とともに自動的に400レスポンスを返します。

### Without Validation {#without-validation}

バリデーションが不要なケース(任意のJSONを受け入れる場合など)では、`request()`を注入して`req.body()`を使います:

```typescript
import { Controller, Post, request } from '@zeltjs/core';
// ---cut---
@Controller('/webhooks')
class WebhookController {
  @Post('/github')
  async handleGithubWebhook(req = request()) {
    const payload = await req.body();
    // payloadはunknown型として扱われる
    return { received: true };
  }
}
```

`request()`やその他のリクエストヘルパーの詳細は[Request & Response Primitives](./primitives.md)を参照してください。

## Returning Responses {#returning-responses}

Controllerメソッドは2種類の戻り方をサポートします:

### Plain Return (Recommended for 200 OK) {#plain-return-recommended-for-200-ok}

値をそのまま返すだけで、Zeltは自動的にステータス200のJSONとしてシリアライズします:

```typescript
import { Controller, Get } from '@zeltjs/core';
// ---cut---
@Controller('/users')
class UserController {
  @Get('/')
  findAll() {
    return { users: [] }; // → 200 OK, Content-Type: application/jsonを返す
  }

  @Get('/health')
  health() {
    return 'OK'; // → 200 OK, Content-Type: text/plainを返す
  }
}
```

### response() (For Custom Status Codes or Headers) {#response-for-custom-status-codes-or-headers}

200以外のステータスコード、カスタムヘッダー、リダイレクトが必要な場合は`response()`を使います:

```typescript
import { Controller, Post, Delete, response } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import * as v from 'valibot';
const schema = v.object({ name: v.string() });
// ---cut---
@Controller('/users')
class UserController {
  @Post('/')
  async create(req = request(schema), res = response()) {
    const body = await req.body();
    return res.json({ id: '1', ...body }, 201); // 201 Createdを返す
  }

  @Delete('/:id')
  remove(req = request()) {
    const id = req.pathParam('id');
    return new Response(null, { status: 204 }); // 204 No Contentを返す
  }
}
```

### When to Use Which {#when-to-use-which}

| Scenario | Approach |
|----------|----------|
| 200でJSONを返す | `return { data }` |
| カスタムステータス(201、204など)で返す | `response().json(data, status)` |
| カスタムヘッダーを設定する | `response().header(name, value).json(data)` |
| リダイレクトする | `response().redirect(url)` |
| Cookieを設定する | `response().setCookie(name, value).json(data)` |
| レスポンスをストリームする | `response().stream(cb)` / `response().sse(cb)` |

`response()`の完全なAPIは[Request & Response Primitives](./primitives.md)を参照してください。

## Custom Response Status {#custom-response-status}

HTTPステータスコードを制御するには`response()`を使います:

```typescript
import { Controller, Post, Delete, response } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import * as v from 'valibot';
const schema = v.object({ name: v.string() });
// ---cut---
@Controller('/items')
class ItemController {
  @Post('/')
  async create(req = request(schema), res = response()) {
    const body = await req.body();
    const created = { id: '1', ...body };
    return res.json(created, 201); // 201 Createdを返す
  }

  @Delete('/:id')
  remove(req = request()) {
    const id = req.pathParam('id');
    // 削除処理を実行する
    return new Response(null, { status: 204 }); // 204 No Contentを返す
  }
}
```

## Registering Controllers {#registering-controllers}

Controllerは`createApp()`に登録する必要があります:

```typescript
import { createApp, Controller, Get, Post, response, http } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import * as v from 'valibot';

const CreateUserBody = v.object({ name: v.string(), email: v.pipe(v.string(), v.email()) });
@Controller('/users') class UserController {
  @Get('/') findAll() { return { users: [] }; }
  @Get('/:id') findOne(req = request()) { const id = req.pathParam('id'); return { id }; }
  @Post('/') async create(req = request(CreateUserBody), res = response()) { const body = await req.body(); return res.json({ id: '1', ...body }, 201); }
}
@Controller('/posts') class PostController {
  @Get('/') findAll() { return { posts: [] }; }
}
// ---cut---
export const app = createApp([http({
    controllers: [UserController, PostController],
  })]);
```

## Next Steps {#next-steps}

- リクエスト/レスポンス処理のための[Middleware](./middleware.md)について学ぶ
