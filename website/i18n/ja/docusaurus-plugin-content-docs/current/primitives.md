---
---

# Request & Response Primitives

Zeltは、リクエストデータへアクセスするための`request()`primitiveと、レスポンスを構築するための`response()`primitiveを提供します。`request()`はcontrollerメソッドのデフォルトパラメータとして使うことができ、リクエストアクセサーを返します。

## Request Primitives {#request-primitives}

### Query Parameters {#query-parameters}

```typescript
import { Controller, Get, request, response } from '@zeltjs/core';

@Controller('/search')
export class SearchController {
  @Get('/')
  search(req = request(), res = response()) {
    const q = req.queryParam('q');
    const tags = req.queryParams('tag');
    // q: string | undefined
    // tags: string[](未指定の場合は空配列)
    return res.json({ query: q, tags });
  }
}
```

| Method | Return Type | Description |
|----------|-------------|-------------|
| `req.queryParam(name)` | `string \| undefined` | クエリパラメータを1つ取得 |
| `req.queryParams(name)` | `string[]` | クエリパラメータの全ての値を取得 |

### Headers {#headers}

```typescript
import { Controller, Get, request, response } from '@zeltjs/core';

@Controller('/api')
export class ApiController {
  @Get('/info')
  info(req = request(), res = response()) {
    const userAgent = req.header('User-Agent');
    const acceptLanguage = req.header('Accept-Language');
    return res.json({ userAgent, acceptLanguage });
  }
}
```

| Method | Return Type | Description |
|----------|-------------|-------------|
| `req.header(name)` | `string \| undefined` | リクエストヘッダーの値を取得 |

### Cookies {#cookies}

```typescript
import { Controller, Get, request, response } from '@zeltjs/core';

@Controller('/session')
export class SessionController {
  @Get('/')
  getSession(req = request(), res = response()) {
    const sessionId = req.cookie('session_id');
    return res.json({ sessionId });
  }
}
```

| Method | Return Type | Description |
|----------|-------------|-------------|
| `req.cookie(name)` | `string \| undefined` | Cookieの値を取得 |

### URL & Path {#url--path}

```typescript
import { Controller, Get, request, response } from '@zeltjs/core';

@Controller('/debug')
export class DebugController {
  @Get('/request')
  requestInfo(req = request(), res = response()) {
    const fullUrl = req.url();
    const requestPath = req.path();
    const httpMethod = req.method();
    return res.json({
      url: fullUrl,      // "http://localhost:3000/debug/request?foo=bar"
      path: requestPath, // "/debug/request"
      method: httpMethod // "GET"
    });
  }
}
```

| Method | Return Type | Description |
|----------|-------------|-------------|
| `req.url()` | `string` | クエリ文字列を含む完全なリクエストURL |
| `req.path()` | `string` | クエリ文字列を除いたリクエストパス |
| `req.method()` | `string` | HTTPメソッド(GET、POSTなど) |

### Client IP {#client-ip}

```typescript
import { Controller, Get, request, response } from '@zeltjs/core';

@Controller('/debug')
export class DebugController {
  @Get('/ip')
  clientIp(req = request(), res = response()) {
    const ip = req.ip();
    return res.json({ ip });
  }
}
```

| Method | Return Type | Description |
|----------|-------------|-------------|
| `req.ip()` | `string \| undefined` | クライアントのIPアドレス |

### Request Body {#request-body}

リクエストボディのtargetは`request()`を呼び出す際に設定します。パースされたボディを読むには`await req.body()`を使います。schemaを渡さない場合、`request()`は内部的なany schemaとデフォルトの`json` targetを使います。

```typescript
// @noErrors
import { Controller, Post, request, response } from '@zeltjs/core';
import * as v from 'valibot';

const FormSchema = v.record(v.string(), v.unknown());

@Controller('/upload')
export class UploadController {
  @Post('/json')
  async uploadJson(req = request(), res = response()) {
    const data = await req.body();
    return res.json({ received: data });
  }

  @Post('/form')
  async uploadForm(req = request(FormSchema, { target: 'form' }), res = response()) {
    const formData = await req.body();
    return res.json({ fields: formData });
  }
}
```

| `request()` call | `await req.body()` type | Description |
|------|-------------|-------------|
| `request()` | `unknown` | デフォルトのany schemaでパースされたJSONボディ |
| `request(schema)` | schema output | バリデーション済みのJSONボディ |
| `request(schema, { target: 'form' })` | schema output | バリデーション済みのフォームデータ |

:::tip
自動的な型推論付きでバリデーション済みのリクエストボディを扱うには、代わりに[schemaを渡した`request()`](./validation.md)を使ってください。
:::

### Path Parameters {#path-parameters}

```typescript
import { Controller, Get, request, response } from '@zeltjs/core';

@Controller('/users')
export class UserController {
  @Get('/:id')
  getUser(req = request(), res = response()) {
    const id = req.pathParam('id');
    // id: string(未定義の場合は例外を投げる)
    return res.json({ userId: id });
  }
}
```

| Method | Return Type | Description |
|----------|-------------|-------------|
| `req.pathParam(name)` | `string` | パスパラメータを取得(未定義の場合は例外を投げる) |

## Response Primitives {#response-primitives}

### response() {#response}

`response()`primitiveは、HTTPレスポンスを構築するためのbuilderを返します:

```typescript
import { Controller, Get, Post, response } from '@zeltjs/core';

@Controller('/api')
export class ApiController {
  @Get('/data')
  getData(res = response()) {
    return res.json({ message: 'Hello' });
  }

  @Get('/redirect')
  redirect(res = response()) {
    return res.redirect('/new-location', 302);
  }

  @Get('/text')
  getText(res = response()) {
    return res.text('Plain text response');
  }

  @Post('/created')
  create(res = response()) {
    return res.json({ id: '123' }, 201);
  }
}
```

### Response Methods {#response-methods}

| Method | Description |
|--------|-------------|
| `json(data, status?, headers?)` | ステータスコードとヘッダーを任意で指定できるJSONレスポンス |
| `text(data, status?)` | プレーンテキストレスポンス |
| `redirect(url, status?)` | HTTPリダイレクト(デフォルト: 302) |
| `body(data, status?)` | 生のボディレスポンス |
| `header(name, value)` | レスポンスヘッダーを設定(チェーン可能) |
| `stream(cb, onError?)` | バイナリデータをストリーム |
| `streamText(cb, onError?)` | テキストデータをストリーム |
| `sse(cb, onError?)` | Server-Sent Eventsストリーム |

### Setting Cookies {#setting-cookies}

```typescript
import { Controller, Post, response } from '@zeltjs/core';

@Controller('/auth')
export class AuthController {
  @Post('/login')
  login(res = response()) {
    return res
      .setCookie('session_id', 'abc123', {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        maxAge: 60 * 60 * 24, // 1日
      })
      .json({ success: true });
  }

  @Post('/logout')
  logout(res = response()) {
    return res
      .deleteCookie('session_id')
      .json({ success: true });
  }
}
```

### Cookie Options {#cookie-options}

| Option | Type | Description |
|--------|------|-------------|
| `domain` | `string` | Cookieのドメイン |
| `expires` | `Date` | 有効期限 |
| `httpOnly` | `boolean` | HTTP-onlyフラグ |
| `maxAge` | `number` | 有効期限(秒) |
| `path` | `string` | Cookieのパス |
| `secure` | `boolean` | Secureフラグ |
| `sameSite` | `'Strict' \| 'Lax' \| 'None'` | SameSite属性 |

## Streaming Responses {#streaming-responses}

Zeltはリアルタイムデータ配信のためのストリーミング機能を提供します。

### Basic Streaming {#basic-streaming}

バイナリデータには`stream()`、テキストデータには`streamText()`を使います:

```typescript
import { Controller, Get, response } from '@zeltjs/core';

@Controller('/stream')
export class StreamController {
  @Get('/data')
  streamData(res = response()) {
    return res.stream(async (stream) => {
      await stream.write('chunk 1');
      await stream.sleep(100);
      await stream.write('chunk 2');
      await stream.close();
    });
  }

  @Get('/lines')
  streamLines(res = response()) {
    return res.streamText(async (stream) => {
      await stream.writeln('line 1');
      await stream.writeln('line 2');
      await stream.close();
    });
  }
}
```

### Server-Sent Events (SSE) {#server-sent-events-sse}

Server-Sent Eventsには`sse()`を使います:

```typescript
import { Controller, Get, response } from '@zeltjs/core';

@Controller('/events')
export class EventController {
  @Get('/updates')
  streamUpdates(res = response()) {
    return res.sse(async (stream) => {
      await stream.writeSSE({ data: 'connected', event: 'open' });

      for (let i = 0; i < 5; i++) {
        await stream.sleep(1000);
        await stream.writeSSE({
          data: JSON.stringify({ count: i }),
          event: 'update',
          id: String(i),
        });
      }

      await stream.close();
    });
  }
}
```

### Stream Writer Methods {#stream-writer-methods}

| Method | Description |
|--------|-------------|
| `write(input)` | `Uint8Array`または`string`をストリームへ書き込む |
| `writeln(input)` | 改行付きで文字列を書き込む |
| `writeSSE(message)` | SSEメッセージを書き込む(SSEストリームのみ) |
| `sleep(ms)` | 指定ミリ秒だけ一時停止 |
| `pipe(body)` | `ReadableStream`をパイプする |
| `close()` | ストリームを閉じる |
| `abort()` | ストリームを中断する |
| `onAbort(listener)` | 中断ハンドラを登録する |

### SSE Message Format {#sse-message-format}

```typescript
type SSEMessage = {
  data: string | Promise<string>;
  event?: string;
  id?: string;
  retry?: number;
};
```

### Error Handling {#error-handling}

両方のストリーミングメソッドは、任意のエラーハンドラを受け付けます:

```typescript
import { Controller, Get, response } from '@zeltjs/core';
// ---cut---
@Controller('/stream')
class StreamController {
  @Get('/data')
  streamData(res = response()) {
    return res.stream(
      async (stream) => {
        // ... streamロジック
      },
      async (error, stream) => {
        await stream.write(`Error: ${error.message}`);
        await stream.close();
      }
    );
  }
}
```

## Chaining Response Methods {#chaining-response-methods}

状態を変更するResponseメソッド(`header`、`setCookie`、`deleteCookie`)はbuilderを返すため、メソッドチェーンが可能です:

```typescript
import { Controller, Get, response } from '@zeltjs/core';
// ---cut---
@Controller('/files')
class FileController {
  @Get('/download')
  download(res = response()) {
    return res
      .header('Content-Disposition', 'attachment; filename="report.csv"')
      .header('Cache-Control', 'no-cache')
      .setCookie('download_started', 'true')
      .text('id,name\n1,Alice\n2,Bob');
  }
}
```
