---
sidebar_label: AWS Lambda
---

# AWS Lambda で始める

このガイドでは、AWS Lambda 上で Zelt アプリケーションを構築する方法を説明します。

## 前提条件

- [Node.js](https://nodejs.org/) v20 以上
- [AWS アカウント](https://aws.amazon.com/)
- [AWS CLI](https://aws.amazon.com/cli/) または [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)

## インストール

```bash
pnpm add @zeltjs/core @zeltjs/adapter-lambda
pnpm add -D @types/aws-lambda esbuild
```

## プロジェクト構成

```
my-lambda/
├── src/
│   ├── app.ts
│   ├── handler.ts
│   └── controllers/
│       └── hello.controller.ts
├── package.json
├── tsconfig.json
└── template.yaml
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

### Step 3: Lambda ハンドラーの作成

`src/handler.ts` を作成します：

```typescript
// @noErrors
import { createApp, Controller, Get, request, http } from '@zeltjs/core';
import { onLambda } from '@zeltjs/adapter-lambda';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; }
}

const app = createApp([http({ controllers: [HelloController] })]);
// ---cut---
const lambdaApp = await onLambda(app);

export const handler = lambdaApp.handler;
```

`onLambda()` 関数は Lambda ランタイム用にアプリを準備します。以下を返します：

- `handler` — API Gateway v2（HTTP API）ハンドラー
- `handlerV1` — API Gateway v1（REST API）ハンドラー
- `shutdown()` — アプリケーションをグレースフルにシャットダウン
- `get<T>(Class)` — DI コンテナからサービスを解決

### Step 4: SAM テンプレートの設定

`template.yaml` を作成します：

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Timeout: 30
    Runtime: nodejs20.x

Resources:
  HelloFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: dist/
      Handler: handler.handler
      Events:
        Api:
          Type: HttpApi
          Properties:
            Path: /{proxy+}
            Method: ANY
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: es2022
        EntryPoints:
          - src/handler.ts

Outputs:
  ApiEndpoint:
    Value: !Sub "https://${ServerlessHttpApi}.execute-api.${AWS::Region}.amazonaws.com"
```

### Step 5: デプロイ

```bash
sam build
sam deploy --guided
```

## API Gateway バージョン

アダプターは両方の API Gateway バージョンをサポートしています：

### HTTP API (v2) — 推奨

```typescript
// @noErrors
import { createApp, Controller, Get, request, http } from '@zeltjs/core';
import { onLambda } from '@zeltjs/adapter-lambda';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; }
}

const app = createApp([http({ controllers: [HelloController] })]);
const lambdaApp = await onLambda(app);
// ---cut---
export const handler = lambdaApp.handler;
```

### REST API (v1)

```typescript
// @noErrors
import { createApp, Controller, Get, request, http } from '@zeltjs/core';
import { onLambda } from '@zeltjs/adapter-lambda';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; }
}

const app = createApp([http({ controllers: [HelloController] })]);
const lambdaApp = await onLambda(app);
// ---cut---
export const handler = lambdaApp.handlerV1;
```

## ウォームアップオプション

デフォルトでは、`onLambda()` は遅延初期化（`warmup: false`）を使用してコールドスタート時間を最小化します。コントローラーは最初のリクエストで解決されます。

即時初期化の場合：

```typescript
// @noErrors
import { createApp, Controller, Get, request, http } from '@zeltjs/core';
import { onLambda } from '@zeltjs/adapter-lambda';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; }
}

const app = createApp([http({ controllers: [HelloController] })]);
// ---cut---
const lambdaApp = await onLambda(app, { warmup: true });
```

| オプション | 動作 | ユースケース |
|-----------|------|-------------|
| `warmup: false`（デフォルト） | 最初のリクエストでコントローラーを解決 | コールドスタート最適化 |
| `warmup: true` | 初期化時にすべてのコントローラーを解決 | プロビジョンドコンカレンシー |

## バイナリレスポンス

アダプターは画像、音声、動画、octet-stream などのバイナリレスポンスを自動的に base64 エンコードして処理します。

```typescript
// @noErrors
import { Controller, Get, response } from '@zeltjs/core';
// ---cut---
@Controller('/files')
export class FileController {
  @Get('/image')
  getImage() {
    const imageBuffer = new Uint8Array([/* ... */]);
    return response()
      .header('Content-Type', 'image/png')
      .body(imageBuffer);
  }
}
```

## 次のステップ

- [コントローラー](../controllers) — ルート処理と HTTP メソッド
- [サービス](../services) — ビジネスロジックと依存性注入
- [設定](../configuration) — 環境変数とシークレット
