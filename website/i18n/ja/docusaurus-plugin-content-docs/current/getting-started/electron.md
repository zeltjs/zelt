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

### Step 2: メインプロセスでの初期化

`src/main.ts` を作成します：

```typescript
import { createApp, Controller, Get, request, http } from '@zeltjs/core';
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

`onElectron()` 関数は Electron ランタイム用にアプリを準備します。以下を返します：

- `fetch(request)` — Request を処理して Response を返す
- `shutdown()` — アプリケーションをグレースフルにシャットダウン
- `get<T>(Class)` — DI コンテナからサービスを解決

### Step 3: レンダラーからの API 呼び出し

レンダラープロセスまたはプリロードスクリプトで：

```typescript
import { createApp, Controller, Get, request, http } from '@zeltjs/core';
import { onElectron } from '@zeltjs/adapter-electron';
@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; }
}
const app = createApp([http({ controllers: [HelloController] })]);
declare const BrowserWindow: any;
declare const join: (...args: string[]) => string;
// ---cut---
const bootstrap = async () => {
  const electronZelt = await onElectron(app, {
    ipcChannel: 'http://zelt-app',
  });

  const win = new BrowserWindow({
    width: 900,
    height: 670,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.loadFile(join(__dirname, '../renderer/index.html'));
};

void bootstrap();
```

## ウォームアップオプション

デフォルトでは、`onElectron()` は即時初期化（`warmup: true`）を使用します — すべてのコントローラーが起動時に解決されます。

遅延初期化の場合：

```typescript
import { exposeIpc } from '@zeltjs/adapter-electron/preload';
// ---cut---
exposeIpc({ channel: 'http://zelt-app' });
```

| オプション | 動作 | ユースケース |
|-----------|------|-------------|
| `warmup: true`（デフォルト） | 起動時にすべてのコントローラーを解決 | デスクトップアプリ |
| `warmup: false` | 最初のリクエストでコントローラーを解決 | 高速起動 |

## 次のステップ

- [コントローラー](../controllers) — ルート処理と HTTP メソッド
- [サービス](../services) — ビジネスロジックと依存性注入
