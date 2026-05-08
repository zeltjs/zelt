---
---

# Request & Response Primitives

Zelt provides functional primitives for accessing request data and building responses. These primitives can be used as default parameters in controller methods.

## Request Primitives

### Query Parameters

```typescript
import { Controller, Get, queryParam, queryParams, response } from '@zeltjs/core';

@Controller('/search')
export class SearchController {
  @Get('/')
  search(
    q = queryParam('q'),
    tags = queryParams('tag'),
    res = response(),
  ) {
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
import { Controller, Get, header, response } from '@zeltjs/core';

@Controller('/api')
export class ApiController {
  @Get('/info')
  info(
    userAgent = header('User-Agent'),
    acceptLanguage = header('Accept-Language'),
    res = response(),
  ) {
    return res.json({ userAgent, acceptLanguage });
  }
}
```

| Function | Return Type | Description |
|----------|-------------|-------------|
| `header(name)` | `string \| undefined` | Get a request header value |

### Cookies

```typescript
import { Controller, Get, cookie, response } from '@zeltjs/core';

@Controller('/session')
export class SessionController {
  @Get('/')
  getSession(
    sessionId = cookie('session_id'),
    res = response(),
  ) {
    return res.json({ sessionId });
  }
}
```

| Function | Return Type | Description |
|----------|-------------|-------------|
| `cookie(name)` | `string \| undefined` | Get a cookie value |

### URL & Path

```typescript
import { Controller, Get, url, path, method, response } from '@zeltjs/core';

@Controller('/debug')
export class DebugController {
  @Get('/request')
  requestInfo(
    fullUrl = url(),
    requestPath = path(),
    httpMethod = method(),
    res = response(),
  ) {
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
import { Controller, Post, body, response } from '@zeltjs/core';

@Controller('/upload')
export class UploadController {
  @Post('/text')
  async uploadText(res = response()) {
    const text = await body('text');
    return res.json({ received: text });
  }

  @Post('/json')
  async uploadJson(res = response()) {
    const data = await body('json');
    return res.json({ received: data });
  }

  @Post('/form')
  async uploadForm(res = response()) {
    const formData = await body('form');
    return res.json({ fields: Object.fromEntries(formData) });
  }
}
```

| Type | Return Type | Description |
|------|-------------|-------------|
| `body('text')` | `Promise<string>` | Raw text body |
| `body('json')` | `Promise<unknown>` | Parsed JSON body |
| `body('form')` | `Promise<FormData>` | Form data (multipart or urlencoded) |
| `body('arrayBuffer')` | `Promise<ArrayBuffer>` | Raw binary data |
| `body('blob')` | `Promise<Blob>` | Blob data |

:::tip
For validated request bodies with automatic type inference, use [`validated()`](./validation.md) instead.
:::

### Path Parameters

```typescript
import { Controller, Get, pathParam, response } from '@zeltjs/core';

@Controller('/users')
export class UserController {
  @Get('/:id')
  getUser(
    id = pathParam('id'),
    res = response(),
  ) {
    // id: string (throws if not defined)
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

## Chaining Response Methods

Response methods that modify state (`header`, `setCookie`, `deleteCookie`) return the builder, allowing method chaining:

```typescript
@Get('/download')
download(res = response()) {
  return res
    .header('Content-Disposition', 'attachment; filename="report.csv"')
    .header('Cache-Control', 'no-cache')
    .setCookie('download_started', 'true')
    .text('id,name\n1,Alice\n2,Bob');
}
```
