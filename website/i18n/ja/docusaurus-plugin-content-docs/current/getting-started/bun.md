---
sidebar_label: Bun
---

# Bun で始める

このガイドでは、Bun 上で Zelt アプリケーションを構築する方法を説明します。

## 前提条件

- [Bun](https://bun.sh/) v1.0 以上

## インストール

```bash
bun add @zeltjs/core @zeltjs/adapter-bun
```

## プロジェクト構成

```
my-app/
├── src/
│   ├── app.ts
│   ├── index.ts
│   └── controllers/
│       └── hello.controller.ts
├── package.json
└── tsconfig.json
```

## Hello World

### Step 1: コントローラーの作成

`src/controllers/hello.controller.ts` を作成します：

```typescript
// @noErrors
import { Controller, Get, request } from '@zeltjs/core';
// ---cut---
@Controller('/hello')
export class HelloController {
  @Get('/:name')
  greet(req = request()) {
    const name = req.pathParam('name');
    return { message: `Hello, ${name}!` };
  }
}
```

### Step 2: アプリケーションの作成

`src/app.ts` を作成します：

```typescript
// @noErrors
import { createApp, Controller, Get, request, http, command } from '@zeltjs/core';
@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; }
}
// ---cut---
export const app = createApp([http({
    controllers: [HelloController],
  })]);
```

### Step 3: エントリーポイントの作成

`src/index.ts` を作成します：

```typescript
// @noErrors
import { createApp, Controller, Get, request, http, command } from '@zeltjs/core';
import { onBun } from '@zeltjs/adapter-bun';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; }
}

const app = createApp([http({ controllers: [HelloController] })]);
// ---cut---
const bunApp = await onBun(app);

const server = bunApp.http.serve({ port: 3000 });
console.log(`Server running at http://${server.address.hostname}:${server.address.port}`);
```

`onBun()` 関数は Bun ランタイム用にアプリを準備します。以下のオブジェクトを返します：

- `http.serve(options?)` — `Bun.serve()` を使用して HTTP サーバーを起動
- `shutdown()` — アプリケーションをグレースフルにシャットダウン
- `get<T>(Class)` — DI コンテナからサービスを解決
- `args` — コマンドライン引数 (`Bun.argv.slice(2)`)

### Step 4: サーバーの起動

```bash
bun run src/index.ts
```

`http://localhost:3000/hello/world` にアクセスすると：

```json
{ "message": "Hello, world!" }
```

## サーバーオプション

`http.serve()` メソッドはポートとホスト名のオプションを受け付けます：

```typescript
// @noErrors
import { createApp, Controller, Get, request, http, command } from '@zeltjs/core';
import { onBun } from '@zeltjs/adapter-bun';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; }
}

const app = createApp([http({ controllers: [HelloController] })]);
const bunApp = await onBun(app);
// ---cut---
const server = bunApp.http.serve({
  port: 8080,
  hostname: '127.0.0.1',
});
```

| オプション | デフォルト | 説明 |
|-----------|-----------|------|
| `port` | `3000` | リッスンするポート |
| `hostname` | `'0.0.0.0'` | バインドするホスト名 |

## コマンドサポート

アプリにコマンドが含まれている場合、`onBun()` は CLI 実行用の機能を `commands` namespace に保持します：

```typescript
// @noErrors
import { createApp, Command, Arg, Controller, Get, http, command } from '@zeltjs/core';
import { onBun } from '@zeltjs/adapter-bun';

@Controller('/hello')
class HelloController {
  @Get('/') greet() { return { message: 'Hello!' }; }
}

@Command('greet')
class GreetCommand {
  constructor(private name = Arg(0)) {}
  run() { console.log(`Hello, ${this.name}!`); }
}

const app = createApp([http({ controllers: [HelloController] }), command([GreetCommand])]);
// ---cut---
const bunApp = await onBun(app);

const result = await bunApp.commands.execCommand(['greet', 'world']);
console.log(result.exitCode); // 0 or 1
```

## ウォームアップオプション

デフォルトでは、`onBun()` は即時初期化（`warmup: true`）を使用します — すべてのコントローラーが起動時に解決されます。

遅延初期化（最初のリクエストでコントローラーを解決）の場合：

```typescript
// @noErrors
import { createApp, Controller, Get, request, http, command } from '@zeltjs/core';
import { onBun } from '@zeltjs/adapter-bun';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; }
}

const app = createApp([http({ controllers: [HelloController] })]);
// ---cut---
const bunApp = await onBun(app, { warmup: false });
```

| オプション | 動作 | ユースケース |
|-----------|------|-------------|
| `warmup: true`（デフォルト） | 起動時にすべてのコントローラーを解決 | 長時間稼働サーバー |
| `warmup: false` | 最初のリクエストでコントローラーを解決 | コールドスタート最適化 |

## 次のステップ

- [コントローラー](../controllers) — ルート処理と HTTP メソッド
- [サービス](../services) — ビジネスロジックと依存性注入
- [コマンド](../command) — CLI コマンド
