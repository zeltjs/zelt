---
sidebar_position: 10
---

# サンプル

Zeltには実際の使用パターンを示すサンプルアプリケーションが含まれています。

## Drizzle Todo

Drizzle ORMとSQLiteを使用したシンプルなTodo API。

**場所:** `examples/drizzle-todo`

### 機能

- Drizzle ORMによるCRUD操作
- Valibotによるリクエストバリデーション
- better-sqlite3によるSQLiteデータベース
- クリーンアップのためのDisposableパターン

### 実行

```bash
cd examples/drizzle-todo
pnpm install
pnpm dev
```

### 主要コード

**バリデーション付きコントローラー:**

```typescript
import { Controller, Get, Post, inject, pathParam, validated } from '@zeltjs/core';
import * as v from 'valibot';

const CreateTodoBody = v.object({
  title: v.pipe(v.string(), v.minLength(1)),
});

@Controller('/todos')
class TodoController {
  constructor(private todoService = inject(TodoService)) {}

  @Get('/')
  findAll() {
    return this.todoService.findAll();
  }

  @Post('/')
  create(body = validated(CreateTodoBody), res = response()) {
    const todo = this.todoService.create({ title: body.title });
    return res.json(todo, 201);
  }
}
```

**Disposable付きDrizzleサービス:**

```typescript
import { Injectable } from '@zeltjs/core';
import type { Disposable } from '@zeltjs/core';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

@Injectable()
class DrizzleService implements Disposable {
  private sqlite: Database.Database;
  readonly db;

  constructor() {
    this.sqlite = new Database('./data/todo.db');
    this.db = drizzle(this.sqlite, { schema });
  }

  dispose() {
    this.sqlite.close();
  }
}
```

### APIエンドポイント

| メソッド | パス | 説明 |
|--------|------|-------------|
| GET | `/todos` | すべてのTodoを一覧 |
| GET | `/todos/:id` | IDでTodoを取得 |
| POST | `/todos` | 新しいTodoを作成 |
| PATCH | `/todos/:id` | Todoを更新 |
| DELETE | `/todos/:id` | Todoを削除 |

---

## Workers URL Shortener

Cloudflare Workers上で動作するKVストレージを使用したURL短縮サービス。

**場所:** `examples/workers-url-shortener`

### 機能

- Cloudflare Workersデプロイ
- 永続化のためのKVストレージ
- URLバリデーション
- 分析用ヒットカウンター

### 実行

```bash
cd examples/workers-url-shortener
pnpm install
pnpm dev
```

### 主要コード

**Workerエントリーポイント:**

```typescript
import { app } from './app';

export default {
  fetch: app.fetch,
};
```

**KVアクセス付きコントローラー:**

```typescript
import { Controller, Get, Post, inject, pathParam, requestContext, validated } from '@zeltjs/core';
import * as v from 'valibot';

const ShortenBody = v.object({
  url: v.pipe(v.string(), v.url()),
});

@Controller('/')
class UrlController {
  constructor(private kv = inject(KVService)) {}

  @Post('/shorten')
  async shorten(body = validated(ShortenBody), res = response(), ctx = requestContext()) {
    const code = generateCode();
    await this.kv.set(ctx, code, { url: body.url, createdAt: Date.now(), hits: 0 });
    return res.json({ code, shortUrl: `/${code}` }, 201);
  }

  @Get('/:code')
  async redirect(code = pathParam('code'), res = response(), ctx = requestContext()) {
    const record = await this.kv.get(ctx, code);
    if (!record) throw new HTTPException(404, { message: 'URL not found' });
    await this.kv.incrementHits(ctx, code);
    return res.redirect(record.url, 302);
  }
}
```

**KVサービス:**

```typescript
import { Injectable } from '@zeltjs/core';

@Injectable()
class KVService {
  async get(c: RequestContext, code: string) {
    return c.env.URLS.get(`url:${code}`, 'json');
  }

  async set(c: RequestContext, code: string, record: UrlRecord) {
    await c.env.URLS.put(`url:${code}`, JSON.stringify(record));
  }
}
```

### APIエンドポイント

| メソッド | パス | 説明 |
|--------|------|-------------|
| POST | `/shorten` | 短縮URLを作成 |
| GET | `/:code` | 元のURLにリダイレクト |
| GET | `/stats/:code` | URL統計を取得 |

### wrangler.toml

```toml
name = "url-shortener"
main = "src/worker.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "URLS"
id = "your-kv-namespace-id"
```

---

## サンプルの実行

すべてのサンプルは`examples/`ディレクトリにあります。各サンプルには独自の`package.json`があります：

```bash
# サンプルの依存関係をインストール
cd examples/<example-name>
pnpm install

# 開発モードで実行
pnpm dev

# テストを実行（利用可能な場合）
pnpm test
```
