# @koya/adapter-node 設計仕様

- **Date**: 2026-05-04
- **Status**: Approved
- **Scope**: Node.js HTTP サーバーアダプター。HttpApp を Node.js 環境で起動する機能を提供

---

## 1. 概要

`@koya/adapter-node` は、koya の `HttpApp` を Node.js HTTP サーバーとして起動するためのアダプターパッケージ。内部で `@hono/node-server` を使用するが、利用者には koya ネイティブな API を提供する。

### 設計方針

- **シンプルな API**: 99% のユースケースは `serve(app, { port })` で完結
- **Hono 非露出**: 利用者は裏で何を使っているか気にしなくてよい
- **上級者向けエスケープハッチ**: HTTPS/HTTP2/UNIX socket が必要な場合は `createAdaptorServer` を re-export

---

## 2. 公開 API

### 2.1 serve 関数

```typescript
import type { HttpApp } from '@koya/core';
import type { Server } from 'node:http';

type ServeOptions = {
  port?: number;      // default: 3000
  hostname?: string;  // default: '0.0.0.0'
};

type AddressInfo = {
  port: number;
  address: string;
};

// オーバーロード
function serve(app: HttpApp): Server;
function serve(app: HttpApp, callback: (info: AddressInfo) => void): Server;
function serve(app: HttpApp, options: ServeOptions): Server;
function serve(app: HttpApp, options: ServeOptions, callback: (info: AddressInfo) => void): Server;
```

### 2.2 createAdaptorServer (re-export)

`@hono/node-server` の `createAdaptorServer` をそのまま re-export。HTTPS, HTTP/2, UNIX socket など高度なユースケース向け。

```typescript
export { createAdaptorServer } from '@hono/node-server';
```

---

## 3. 使用例

### 3.1 基本的な使用

```typescript
import { serve } from '@koya/adapter-node';
import { app } from './app';

serve(app, { port: 3000 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
```

### 3.2 最小構成

```typescript
import { serve } from '@koya/adapter-node';
import { app } from './app';

serve(app); // localhost:3000 で起動
```

### 3.3 examples/hello への追加

```typescript
// examples/hello/src/entry/node.ts
import { serve } from '@koya/adapter-node';
import { app } from '../app';

serve(app, { port: 3000 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
```

---

## 4. 内部実装

```typescript
import { serve as honoServe, createAdaptorServer } from '@hono/node-server';
import type { HttpApp } from '@koya/core';
import type { Server } from 'node:http';

export { createAdaptorServer };

type ServeOptions = {
  port?: number;
  hostname?: string;
};

type AddressInfo = {
  port: number;
  address: string;
};

export const serve = (
  app: HttpApp,
  optionsOrCallback?: ServeOptions | ((info: AddressInfo) => void),
  maybeCallback?: (info: AddressInfo) => void
): Server => {
  const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback ?? {};
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;

  return honoServe(
    {
      fetch: app.fetch,
      port: options.port ?? 3000,
      hostname: options.hostname ?? '0.0.0.0',
    },
    callback
  );
};
```

---

## 5. テスト方針

### 5.1 単体テスト

- `serve(app)` がデフォルトポート 3000 で起動すること
- `serve(app, { port: 8080 })` が指定ポートで起動すること
- callback が `AddressInfo` を受け取ること
- 返り値が `http.Server` インスタンスであること

### 5.2 統合テスト

- 起動したサーバーに HTTP リクエストを送り、レスポンスが返ること
- サーバーを `server.close()` で停止できること

---

## 6. 依存関係

```json
{
  "dependencies": {
    "@hono/node-server": "2.0.1",
    "@koya/core": "workspace:*"
  }
}
```

---

## 7. 対象外

以下は本仕様のスコープ外：

- HTTPS/HTTP2 の直接サポート（`createAdaptorServer` 経由で可能）
- UNIX socket の直接サポート（`createAdaptorServer` 経由で可能）
- graceful shutdown ヘルパー
- リクエストログ機能
