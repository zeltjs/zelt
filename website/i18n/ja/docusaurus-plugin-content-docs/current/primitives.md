---
---

# Request & Response Primitives

Zelt provides functional primitives for accessing request data and building responses. These primitives can be used as default parameters in controller methods.

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

| Function | Return Type | Description |
|----------|-------------|-------------|
| `queryParam(name)` | `string \| undefined` | Get a single query parameter |
| `queryParams(name)` | `string[]` | Get all values for a query parameter |

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

| Function | Return Type | Description |
|----------|-------------|-------------|
| `header(name)` | `string \| undefined` | Get a request header value |

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

| Function | Return Type | Description |
|----------|-------------|-------------|
| `cookie(name)` | `string \| undefined` | Get a cookie value |

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

| Function | Return Type | Description |
|----------|-------------|-------------|
| `url()` | `string` | Full request URL including query string |
| `path()` | `string` | Request path without query string |
| `method()` | `string` | HTTP method (GET, POST, etc.) |

### Request Body

```typescript
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

The request body target is configured when calling `request()`. When no schema is passed, `request()` uses an internal any schema and the default `json` target.

| Type | Return Type | Description |
|------|-------------|-------------|
| `request()` | `unknown` | Parsed JSON body with the default any schema |
| `request(schema)` | schema output | Validated JSON body |
| `request(schema, { target: 'form' })` | schema output | Validated form data |

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
    return res.json({ userId: id });
  }
}
```

| Function | Return Type | Description |
|----------|-------------|-------------|
| `pathParam(name)` | `string` | Get a path parameter (throws if undefined) |

## Response Primitives

### response()

The `response()` primitive returns a builder for constructing HTTP responses:

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

### Server-Sent Events (SSE)

Use `sse()` for Server-Sent Events:

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

### Error Handling

Both streaming methods accept an optional error handler:

```typescript
type SSEMessage = {
  data: string | Promise<string>;
  event?: string;
  id?: string;
  retry?: number;
};
```

## Chaining Response Methods

Response methods that modify state (`header`, `setCookie`, `deleteCookie`) return the builder, allowing method chaining:

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
