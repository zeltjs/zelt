---
sidebar_label: Cloudflare Workers
---

# Cloudflare Workersではじめる

このガイドでは、Cloudflare Workers上でZeltアプリケーションをゼロから構築する方法を説明します。

## 前提条件

- [Node.js](https://nodejs.org/) v20以上
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- [Cloudflareアカウント](https://dash.cloudflare.com/sign-up)（無料プランあり）

## インストール

```bash
pnpm add @zeltjs/core @zeltjs/adapter-cloudflare-workers
pnpm add -D wrangler @cloudflare/workers-types
```

## プロジェクト構成

```
my-worker/
├── src/
│   ├── app.ts
│   ├── index.ts
│   └── controllers/
│       └── hello.controller.ts
├── package.json
├── tsconfig.json
└── wrangler.toml
```

## Hello World

### ステップ1: コントローラーの作成

コントローラーは受信HTTPリクエストを処理し、レスポンスを返します。各コントローラーは`@Controller`でデコレートされたクラスで、ルートプレフィックスを定義します。

`src/controllers/hello.controller.ts`を作成:

```typescript
import { Controller, Get, pathParam } from '@zeltjs/core';

@Controller('/hello')
export class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) {
    return { message: `Hello, ${name}!` };
  }
}
```

- `@Controller('/hello')` — このコントローラー内のすべてのルートのベースパスを設定
- `@Get('/:name')` — `/hello/:name`へのGETリクエストを処理
- `pathParam('name')` — URLパスから`name`パラメータを抽出

### ステップ2: アプリケーションの作成

`src/app.ts`を作成してコントローラーを接続:

```typescript
import { createHttpApp } from '@zeltjs/core';
import { HelloController } from './controllers/hello.controller';

export const app = createHttpApp({
  controllers: [HelloController],
});
```

### ステップ3: Workerエントリーポイントの作成

Cloudflare Workersのエントリーポイント`src/index.ts`を作成:

```typescript
import { onCloudflareWorkers } from '@zeltjs/adapter-cloudflare-workers';
import { app } from './app';

export default onCloudflareWorkers(app);
```

`onCloudflareWorkers()`関数は、アプリをWorkersランタイム用にラップします。デフォルトでは**遅延初期化**を使用します — コントローラーは起動時ではなく最初のリクエスト時に解決されます。これにより、サーバーレス環境でのコールドスタート時間が最適化されます。

### ステップ4: Wranglerの設定

`wrangler.toml`を作成:

```toml
name = "my-zelt-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
API_HOST = "https://api.example.com"
```

### ステップ5: TypeScriptの設定

`tsconfig.json`を作成:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "experimentalDecorators": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

### ステップ6: ローカルで実行

```bash
npx wrangler dev
```

`http://localhost:8787/hello/world`にアクセスすると:

```json
{ "message": "Hello, world!" }
```

## 設定

### 環境変数

Cloudflare Workersでは、環境変数は`wrangler.toml`で設定し、`EnvService`経由でアクセスします。

```typescript
import { Controller, Get, inject, EnvService } from '@zeltjs/core';

@Controller('/config')
export class ConfigController {
  constructor(private env = inject(EnvService)) {}

  @Get('/api-host')
  getApiHost() {
    return { apiHost: this.env.get('API_HOST') ?? 'localhost' };
  }
}
```

アプリに`EnvConfig`を登録:

```typescript
import { createHttpApp, EnvConfig } from '@zeltjs/core';

export const app = createHttpApp({
  controllers: [ConfigController],
  configs: [EnvConfig],
});
```

**重要:** `EnvConfig`を登録して`onCloudflareWorkers()`を使用すると、アダプターが自動的に`CloudflareWorkersEnvConfig`に置換します。これにより、`process.env`ではなくWorkersランタイム（`cloudflare:workers`モジュール）から環境変数を読み取ります。

### シークレット

機密性の高い値には、`[vars]`の代わりにWranglerシークレットを使用:

```bash
npx wrangler secret put DATABASE_URL
```

`EnvService`経由で同じ方法でアクセスできます:

```typescript
const dbUrl = this.env.get('DATABASE_URL');
```

## サービス

サービスはNode.jsと同じように動作します。`@Injectable`を使用してクラスをサービスとしてマークします。

```typescript
import { Injectable } from '@zeltjs/core';

@Injectable()
export class GreetingService {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}
```

コントローラーに注入:

```typescript
import { Controller, Get, pathParam, inject } from '@zeltjs/core';
import { GreetingService } from '../services/greeting.service';

@Controller('/hello')
export class HelloController {
  constructor(private greetingService = inject(GreetingService)) {}

  @Get('/:name')
  greet(name = pathParam('name')) {
    return { message: this.greetingService.greet(name) };
  }
}
```

## デプロイ

Cloudflareのグローバルネットワークにワーカーをデプロイ:

```bash
npx wrangler deploy
```

ワーカーは`https://my-zelt-worker.<your-subdomain>.workers.dev`で利用可能になります。

## 上級: Warmupオプション

デフォルトでは、`onCloudflareWorkers()`は遅延初期化（`warmup: false`）を使用してコールドスタート時間を最小化します。コントローラーは最初のリクエスト時に解決されます。

すべてのコントローラーを初期化時に解決したい場合（デバッグや、コールドスタート時間があまり重要でない場合に便利）、`warmup: true`を設定:

```typescript
export default onCloudflareWorkers(app, { warmup: true });
```

| オプション | 動作 | ユースケース |
|--------|----------|----------|
| `warmup: false`（デフォルト） | 最初のリクエスト時にコントローラーを解決 | コールドスタートの最適化 |
| `warmup: true` | 初期化時にすべてのコントローラーを解決 | デバッグ、ウォーム環境 |

## 次のステップ

基本的なワーカーが動作するようになったら、さらに多くの機能を探索しましょう:

- [コントローラー](/controllers) — ルーティングとHTTPメソッド
- [サービス](/services) — ビジネスロジックと依存性注入
- [バリデーション](/validation) — Valibotによるリクエストボディの検証
- [ミドルウェア](/middleware) — リクエスト/レスポンスインターセプター
- [設定](/configuration) — 高度な設定パターン
