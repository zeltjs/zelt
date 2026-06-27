---
---

# Request & Response Primitives

Zelt provides a `request()` primitive for accessing request data and a `response()` primitive for building responses. `request()` can be used as a default parameter in controller methods and returns a request accessor.

## Request Primitives

### Query Parameters

```typescript
import { Controller, Get, request, response } from '@zeltjs/core';

@Controller('/search')
export class SearchController {
  @Get('/')
  search(req = request(), res = response()) {
    const q = req.queryParam('q');
    const tags = req.queryParams('tag');
    // q: string | undefined
    // tags: string[] (empty array if not provided)
    return res.json({ query: q, tags });
  }
}
```

| Method | Return Type | Description |
|----------|-------------|-------------|
| `req.queryParam(name)` | `string \| undefined` | Get a single query parameter |
| `req.queryParams(name)` | `string[]` | Get all values for a query parameter |

### Headers

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
| `req.header(name)` | `string \| undefined` | Get a request header value |

### Cookies

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
| `req.cookie(name)` | `string \| undefined` | Get a cookie value |

### URL & Path

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
| `req.url()` | `string` | Full request URL including query string |
| `req.path()` | `string` | Request path without query string |
| `req.method()` | `string` | HTTP method (GET, POST, etc.) |

### Client IP

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
| `req.ip()` | `string \| undefined` | Client IP address |

### Request Body

The request body target is configured when calling `request()`. Use `await req.body()` to read the parsed body:

```typescript
// @noErrors
import { Controller, Post, request, response } from '@zeltjs/core';

@Controller('/upload')
export class UploadController {
  @Post('/json')
  async uploadJson(req = request(), res = response()) {
    const data = await req.body();
    return res.json({ received: data });
  }

  @Post('/form')
  async uploadForm(req = request(undefined, { target: 'form' }), res = response()) {
    const formData = await req.body();
    return res.json({ fields: formData });
  }
}
```

| `request()` call | `await req.body()` type | Description |
|------|-------------|-------------|
| `request()` | `unknown` | Parsed JSON body |
| `request(undefined, { target: 'form' })` | `FormBody` | Form data record (`Record<string, string \| File \| (string \| File)[]>`) |
| `request(undefined, { target: 'text' })` | `string` | Plain text body |

:::tip
For validated request bodies with automatic type inference, use [`request()` with a schema](./validation.md) instead.
:::

### Path Parameters

```typescript
import { Controller, Get, request, response } from '@zeltjs/core';

@Controller('/users')
export class UserController {
  @Get('/:id')
  getUser(req = request(), res = response()) {
    const id = req.pathParam('id');
    // id: string (throws if not defined)
    return res.json({ userId: id });
  }
}
```

| Method | Return Type | Description |
|----------|-------------|-------------|
| `req.pathParam(name)` | `string` | Get a path parameter (throws if undefined) |

## Response Primitives

### response()

The `response()` primitive returns a builder for constructing HTTP responses:

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

### Response Methods

| Method | Description |
|--------|-------------|
| `json(data, status?, headers?)` | JSON response with optional status code and headers |
| `text(data, status?)` | Plain text response |
| `redirect(url, status?)` | HTTP redirect (default: 302) |
| `body(data, status?)` | Raw body response |
| `header(name, value)` | Set a response header (chainable) |
| `stream(cb, onError?)` | Stream binary data |
| `streamText(cb, onError?)` | Stream text data |
| `sse(cb, onError?)` | Server-Sent Events stream |

### Setting Cookies

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
        maxAge: 60 * 60 * 24, // 1 day
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

### Cookie Options

| Option | Type | Description |
|--------|------|-------------|
| `domain` | `string` | Cookie domain |
| `expires` | `Date` | Expiration date |
| `httpOnly` | `boolean` | HTTP-only flag |
| `maxAge` | `number` | Max age in seconds |
| `path` | `string` | Cookie path |
| `secure` | `boolean` | Secure flag |
| `sameSite` | `'Strict' \| 'Lax' \| 'None'` | SameSite attribute |

## Streaming Responses

Zelt provides streaming capabilities for real-time data delivery.

### Basic Streaming

Use `stream()` for binary data or `streamText()` for text data:

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

### Server-Sent Events (SSE)

Use `sse()` for Server-Sent Events:

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

### Stream Writer Methods

| Method | Description |
|--------|-------------|
| `write(input)` | Write `Uint8Array` or `string` to stream |
| `writeln(input)` | Write string with newline |
| `writeSSE(message)` | Write SSE message (SSE streams only) |
| `sleep(ms)` | Pause for specified milliseconds |
| `pipe(body)` | Pipe a `ReadableStream` |
| `close()` | Close the stream |
| `abort()` | Abort the stream |
| `onAbort(listener)` | Register abort handler |

### SSE Message Format

```typescript
type SSEMessage = {
  data: string | Promise<string>;
  event?: string;
  id?: string;
  retry?: number;
};
```

### Error Handling

Both streaming methods accept an optional error handler:

```typescript
import { Controller, Get, response } from '@zeltjs/core';
// ---cut---
@Controller('/stream')
class StreamController {
  @Get('/data')
  streamData(res = response()) {
    return res.stream(
      async (stream) => {
        // ... stream logic
      },
      async (error, stream) => {
        await stream.write(`Error: ${error.message}`);
        await stream.close();
      }
    );
  }
}
```

## Chaining Response Methods

Response methods that modify state (`header`, `setCookie`, `deleteCookie`) return the builder, allowing method chaining:

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
