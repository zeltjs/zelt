---
sidebar_label: Electron
---

# Electron で始める

このガイドでは、Electron アプリに Zelt アプリケーションを組み込んでローカル API を処理する方法を説明します。

## 前提条件

- [Node.js](https://nodejs.org/) v20 以上
- [Electron](https://www.electronjs.org/) v28 以上

## インストール

```bash
pnpm add @zeltjs/core @zeltjs/adapter-electron
pnpm add -D electron
```

## ユースケース

Electron アダプターを使用すると、別のサーバーを起動せずに Electron アプリ内で HTTP リクエストを処理できます。これは以下の用途に便利です：

- レンダラープロセス向けのローカル API エンドポイント
- オフライン対応アプリケーション
- バックエンドを組み込んだデスクトップアプリ

## Hello World

### Step 1: アプリケーションの作成

`src/api/app.ts` を作成します：

```typescript
import { createApp, Controller, Get, pathParam, http } from '@zeltjs/core';
// ---cut---
@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) {
    return { message: `Hello, ${name}!` };
  }
}

export const app = createApp([http({
    controllers: [HelloController],
  })]);
```

### Step 2: メインプロセスでの初期化

`src/main.ts` を作成します：

```typescript
// @noErrors
import { app as electronApp, BrowserWindow, protocol } from 'electron';
import { createApp, Controller, Get, pathParam, http } from '@zeltjs/core';
import { onElectron } from '@zeltjs/adapter-electron';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) { return { message: `Hello, ${name}!` }; }
}

const app = createApp([http({ controllers: [HelloController] })]);
// ---cut---
const electronZelt = await onElectron(app);

electronApp.whenReady().then(() => {
  protocol.handle('api', async (request) => {
    return electronZelt.fetch(request);
  });

  const win = new BrowserWindow({ width: 800, height: 600 });
  win.loadFile('index.html');
});

electronApp.on('window-all-closed', async () => {
  await electronZelt.shutdown();
  electronApp.quit();
});
```

`onElectron()` 関数は Electron ランタイム用にアプリを準備します。以下を返します：

- `fetch(request)` — Request を処理して Response を返す
- `shutdown()` — アプリケーションをグレースフルにシャットダウン
- `get<T>(Class)` — DI コンテナからサービスを解決

### Step 3: レンダラーからの API 呼び出し

レンダラープロセスまたはプリロードスクリプトで：

```typescript
const response = await fetch('api://localhost/hello/world');
const data = await response.json();
console.log(data.message); // "Hello, world!"
```

## ウォームアップオプション

デフォルトでは、`onElectron()` は即時初期化（`warmup: true`）を使用します — すべてのコントローラーが起動時に解決されます。

遅延初期化の場合：

```typescript
import { createApp, Controller, Get, pathParam, http } from '@zeltjs/core';
import { onElectron } from '@zeltjs/adapter-electron';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) { return { message: `Hello, ${name}!` }; }
}

const app = createApp([http({ controllers: [HelloController] })]);
// ---cut---
const electronZelt = await onElectron(app, { warmup: false });
```

| オプション | 動作 | ユースケース |
|-----------|------|-------------|
| `warmup: true`（デフォルト） | 起動時にすべてのコントローラーを解決 | デスクトップアプリ |
| `warmup: false` | 最初のリクエストでコントローラーを解決 | 高速起動 |

## 次のステップ

- [コントローラー](../controllers) — ルート処理と HTTP メソッド
- [サービス](../services) — ビジネスロジックと依存性注入
