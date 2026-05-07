---
sidebar_position: 2
---

# はじめに

このガイドでは、Zeltの基本を学びます。基本的なCRUDアプリケーションを構築しながら、必要不可欠な構成要素に慣れていきましょう。

## 前提条件

- [Node.js](https://nodejs.org/)（v20以上）
- パッケージマネージャー：[pnpm](https://pnpm.io/)（推奨）、npm、またはbun

## インストール

```bash
pnpm add @zeltjs/core @zeltjs/adapter-node
```

## シンプルなアプリケーションの作成

シンプルな「Hello World」アプリケーションを作成しましょう。

### プロジェクト構成

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

### ステップ1：コントローラーの作成

コントローラーは受信リクエストを処理し、レスポンスを返します。`src/controllers/hello.controller.ts`を作成：

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

### ステップ2：アプリケーションの作成

`src/app.ts`を作成してコントローラーを接続：

```typescript
import { createHttpApp } from '@zeltjs/core';
import { HelloController } from './controllers/hello.controller';

export const app = createHttpApp({
  controllers: [HelloController],
});
```

### ステップ3：サーバーの起動

Node.jsエントリーポイント`src/main.ts`を作成：

```typescript
import { serve } from '@zeltjs/adapter-node';
import { app } from './app';

serve(app, { port: 3000 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
```

### ステップ4：TypeScriptの設定

`tsconfig.json`を作成：

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

### ステップ5：アプリケーションの実行

```bash
npx tsx src/main.ts
```

`http://localhost:3000/hello/world`にアクセスすると：

```json
{ "message": "Hello, world!" }
```

## 次のステップ

基本的なアプリケーションが動作するようになったら、さらに学びましょう：

- [コントローラー](/controllers) — HTTPリクエストの処理
- [サービス](/services) — ビジネスロジックと依存性注入
- [バリデーション](/validation) — Valibotによるリクエストボディの検証
