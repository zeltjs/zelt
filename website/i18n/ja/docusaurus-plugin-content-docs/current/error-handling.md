---
sidebar_position: 9
---

# エラー処理

ZeltはHonoの`HTTPException`に基づくシンプルなエラー処理機構を提供します。

## エラーレスポンス形式

すべてのエラーは一貫したJSON形式で返されます：

```json
{
  "code": "ERROR_CODE",
  "message": "Error description"
}
```

## 組み込みエラータイプ

### VALIDATION_FAILED

リクエストボディのバリデーションが失敗した場合（ステータス400）：

```json
{
  "code": "VALIDATION_FAILED",
  "issues": [
    {
      "kind": "validation",
      "type": "email",
      "message": "Invalid email",
      "path": ["email"]
    }
  ]
}
```

### INTERNAL_ERROR

未処理のエラーが発生した場合（ステータス500）：

```json
{
  "code": "INTERNAL_ERROR",
  "message": "internal server error"
}
```

開発モード（`NODE_ENV=development`）では、デバッグのため実際のエラーメッセージが含まれます。

## HTTPExceptionのスロー

Honoの`HTTPException`を使用して、ステータスコードとメッセージまたはカスタムレスポンスを指定してHTTPエラーをスローします。

### カスタムメッセージ

基本的なテキストレスポンスには、エラーの`message`を設定：

```typescript
import { HTTPException } from '@zeltjs/core';

throw new HTTPException(401, { message: 'Unauthorized' });
```

### カスタムレスポンス

JSONレスポンスやレスポンスヘッダーを設定するには、`res`オプションを使用：

```typescript
import { HTTPException } from '@zeltjs/core';

const errorResponse = Response.json(
  { code: 'USER_NOT_FOUND', message: 'User not found' },
  { status: 404 }
);

throw new HTTPException(404, { res: errorResponse });
```

カスタムヘッダー付き：

```typescript
const errorResponse = new Response('Unauthorized', {
  status: 401,
  headers: {
    'WWW-Authenticate': 'Bearer error="invalid_token"',
  },
});

throw new HTTPException(401, { res: errorResponse });
```

### Cause

デバッグのため`cause`オプションで元のエラーを添付：

```typescript
try {
  await authorize(c);
} catch (cause) {
  throw new HTTPException(401, { message: 'Authorization failed', cause });
}
```

## カスタムエラーコード

API全体で一貫性を保つため、再利用可能なエラーレスポンスを定義：

```typescript
import { HTTPException } from '@zeltjs/core';

const notFoundResponse = Response.json(
  { code: 'USER_NOT_FOUND', message: 'User not found' },
  { status: 404 }
);

const forbiddenResponse = Response.json(
  { code: 'FORBIDDEN', message: 'Access denied' },
  { status: 403 }
);

// 使用
throw new HTTPException(404, { res: notFoundResponse });
throw new HTTPException(403, { res: forbiddenResponse });
```

またはファクトリ関数を作成：

```typescript
const createErrorResponse = (
  status: number,
  code: string,
  message: string
): Response => {
  return Response.json({ code, message }, { status });
};

// 使用
const response = createErrorResponse(404, 'USER_NOT_FOUND', 'User not found');
throw new HTTPException(404, { res: response });
```

## OpenAPI用エラースキーマ

組み込みエラースキーマを使用してOpenAPI仕様にエラーレスポンスを文書化：

```typescript
import { errorBodySchema, validationErrorBodySchema } from '@zeltjs/core';
```

これらのスキーマはエラーレスポンスの構造を定義：

- `errorBodySchema` — すべてのエラータイプの共用体（VALIDATION_FAILED | INTERNAL_ERROR）
- `validationErrorBodySchema` — バリデーションエラータイプのみ

## エラー処理フロー

```
リクエスト
  │
  ▼
ミドルウェアチェーン
  │
  ▼
ルートハンドラー ─── HTTPExceptionをスロー ──► HTTPException.getResponse()
  │                                                │
  │                                                ▼
  │                                        カスタムエラーレスポンス
  │
  ├─── Errorをスロー ──► handleError()
  │                           │
  │                           ▼
  │                    500 INTERNAL_ERROR
  │
  ▼
成功レスポンス
```

## カスタムエラーハンドラー

より複雑なエラー処理ロジックには、`@ErrorHandler`デコレータを使用して再利用可能なエラーハンドラークラスを作成します。

### エラーハンドラーの作成

```typescript
import { ErrorHandler, RequestContext } from '@zeltjs/core';

@ErrorHandler
class DatabaseErrorHandler {
  onError(error: Error, c: RequestContext): Response | undefined {
    if (error.name === 'PrismaClientKnownRequestError') {
      return Response.json(
        { code: 'DATABASE_ERROR', message: 'Database operation failed' },
        { status: 409 }
      );
    }
    return undefined;
  }
}
```

`onError`メソッドは以下を受け取ります：
- `error` — スローされたエラー
- `c` — Honoリクエストコンテキスト

エラーを処理する場合は`Response`を返し、次のハンドラーに渡す場合は`undefined`を返します。

### エラーハンドラーの登録

`createHttpApp`の`errorHandlers`オプションでエラーハンドラーを渡します：

```typescript
import { createHttpApp } from '@zeltjs/core';

const app = createHttpApp({
  controllers: [UserController],
  middlewares: [LoggingMiddleware],
  errorHandlers: [DatabaseErrorHandler, ValidationErrorHandler],
});
```

### ハンドラーチェーン

エラーハンドラーは登録順に実行されます：

1. 最初のハンドラーの`onError`が呼ばれる
2. `undefined`を返した場合、次のハンドラーが呼ばれる
3. すべてのハンドラーが`undefined`を返した場合、デフォルトエラーハンドラーが実行

```typescript
@ErrorHandler
class FirstHandler {
  onError(error: Error, c: RequestContext) {
    if (error instanceof CustomError) {
      return Response.json({ code: 'CUSTOM' }, { status: 400 });
    }
    return undefined;
  }
}

@ErrorHandler
class FallbackHandler {
  onError(error: Error, c: RequestContext) {
    console.error('Unhandled error:', error);
    return undefined;
  }
}

createHttpApp({
  controllers: [MyController],
  errorHandlers: [FirstHandler, FallbackHandler],
});
```

### 依存性注入

エラーハンドラーは依存性注入をサポートします。コンストラクタ注入でサービスにアクセス：

```typescript
@ErrorHandler
class LoggingErrorHandler {
  constructor(private logger: LoggerService) {}

  onError(error: Error, c: RequestContext) {
    this.logger.error('Request failed', { error, path: c.req.path });
    return undefined;
  }
}
```

## ベストプラクティス

1. **説明的なエラーコードを使用** — `NOT_FOUND`より`USER_NOT_FOUND`を優先
2. **実行可能なメッセージを含める** — API利用者が何が問題かを理解できるように
3. **内部詳細を公開しない** — 本番環境ではスタックトレースや内部エラーメッセージを含めない
4. **エラーレスポンスを文書化** — OpenAPIスキーマですべての可能なエラーコードを文書化
5. **エラーハンドラーを特異度順に配置** — 具体的なハンドラーを汎用的なものより先に配置
