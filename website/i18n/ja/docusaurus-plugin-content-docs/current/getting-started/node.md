---
sidebar_label: Node.js
---

# Node.jsではじめる

このガイドでは、Node.js上でZeltアプリケーションをゼロから構築する方法を説明します。

## 前提条件

- [Node.js](https://nodejs.org/) v20以上
- パッケージマネージャー: [pnpm](https://pnpm.io/)（推奨）、npm、またはbun

## インストール

```bash
pnpm add @zeltjs/core @zeltjs/adapter-node
```

## プロジェクト構成

```
my-app/
├── src/
│   ├── app.ts
│   ├── main.ts
│   └── controllers/
│       └── hello.controller.ts
├── package.json
└── tsconfig.json
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

### ステップ3: サーバーの起動

Node.jsエントリーポイント`src/main.ts`を作成:

```typescript
import { serve } from '@zeltjs/adapter-node';
import { app } from './app';

serve(app, { port: 3000 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
```

### ステップ4: TypeScriptの設定

`tsconfig.json`を作成:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### ステップ5: アプリケーションの実行

```bash
npx tsx src/main.ts
```

`http://localhost:3000/hello/world`にアクセスすると:

```json
{ "message": "Hello, world!" }
```

## サービスの追加

サービスはビジネスロジックを含み、コントローラーに注入できます。`@Injectable`を使用してクラスをサービスとしてマークします。

`src/services/greeting.service.ts`を作成:

```typescript
import { Injectable } from '@zeltjs/core';

@Injectable()
export class GreetingService {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}
```

サービスを使用するようにコントローラーを更新:

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

## 設定

Zeltは環境変数を管理するための設定クラスを提供します。

### 環境変数の使用

```typescript
import { Controller, Get, inject } from '@zeltjs/core';
import { EnvService } from '@zeltjs/core';

@Controller('/config')
export class ConfigController {
  constructor(private env = inject(EnvService)) {}

  @Get('/api-host')
  getApiHost() {
    return { apiHost: this.env.get('API_HOST') ?? 'localhost' };
  }
}
```

アプリに設定を登録:

```typescript
import { createHttpApp, EnvConfig } from '@zeltjs/core';

export const app = createHttpApp({
  controllers: [ConfigController],
  configs: [EnvConfig],
});
```

### Node.js固有の設定

`@zeltjs/adapter-node`パッケージは追加の設定オプションを提供します:

```typescript
import { ProcessEnvConfig, DotEnvConfig } from '@zeltjs/adapter-node';

// ProcessEnvConfig: process.envから読み取り（デフォルト動作）
// DotEnvConfig: .envファイルから読み取り
```

## 次のステップ

基本的なアプリケーションが動作するようになったら、さらに多くの機能を探索しましょう:

- [コントローラー](../controllers) — ルーティングとHTTPメソッド
- [サービス](../services) — ビジネスロジックと依存性注入
- [バリデーション](../validation) — Valibotによるリクエストボディの検証
- [ミドルウェア](../middleware) — リクエスト/レスポンスインターセプター
- [設定](../configuration) — 高度な設定パターン
