---
---

# Controllers

Controllers are responsible for handling incoming **requests** and returning **responses** to the client.

## Defining Controllers

A controller is a class decorated with `@Controller()`. The decorator accepts a path prefix that will be prepended to all routes defined in the controller.

```typescript
import { Controller, Get, Post, pathParam, response } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
import * as v from 'valibot';

const CreateUserBody = v.object({
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
});

@Controller('/users')
export class UserController {
  @Get('/')
  findAll() {
    return { users: [] };
  }

  @Get('/:id')
  findOne(id = pathParam('id')) {
    return { id, name: 'John Doe' };
  }

  @Post('/')
  create(body = validated(CreateUserBody), res = response()) {
    return res.json({ id: '1', ...body }, 201);
  }
}

// ---cut-after---
import { expect, test } from 'vitest';

test('UserController.findAll returns users array', () => {
  const controller = new UserController();
  expect(controller.findAll()).toEqual({ users: [] });
});
```

## Route Path Rules

The `@Controller` prefix and method decorator path are joined to form the final route. Trailing slashes are stripped; leading slashes on the method path are optional.

| Controller Prefix | Method Path | Final Route |
|-------------------|-------------|-------------|
| `'/users'` | `'/'` | `/users` |
| `'/users'` | `'/:id'` | `/users/:id` |
| `'/api'` | `'/users'` | `/api/users` |
| `'/'` | `'/hello'` | `/hello` |
| `'/api/v1'` | `'/users/:id'` | `/api/v1/users/:id` |

:::tip
Both `@Get('/items')` and `@Get('items')` produce the same result — a leading slash is added automatically if missing.
:::

## HTTP Method Decorators

Zelt provides decorators for all standard HTTP methods:

| Decorator | HTTP Method |
|-----------|-------------|
| `@Get()` | GET |
| `@Post()` | POST |
| `@Put()` | PUT |
| `@Patch()` | PATCH |
| `@Delete()` | DELETE |

```typescript
import { Controller, Get, Post, Put, Patch, Delete, pathParam } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
import * as v from 'valibot';
const schema = v.object({ name: v.string() });
// ---cut---
@Controller('/items')
export class ItemController {
  @Get('/')
  findAll() { /* ... */ }

  @Get('/:id')
  findOne(id = pathParam('id')) { /* ... */ }

  @Post('/')
  create(body = validated(schema)) { /* ... */ }

  @Put('/:id')
  update(id = pathParam('id'), body = validated(schema)) { /* ... */ }

  @Patch('/:id')
  patch(id = pathParam('id'), body = validated(schema)) { /* ... */ }

  @Delete('/:id')
  remove(id = pathParam('id')) { /* ... */ }
}
```

## Route Parameters

Use `pathParam()` to extract route parameters:

```typescript
import { Controller, Get, pathParam } from '@zeltjs/core';
// ---cut---
@Controller('/items')
class ItemController {
  @Get('/:category/:id')
  findOne(
    category = pathParam('category'),
    id = pathParam('id')
  ) {
    return { category, id };
  }
}
```

## Request Body

### With Validation (Recommended)

Use `validated()` with a Valibot schema to validate and type the request body:

```typescript
import { Controller, Post } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
import * as v from 'valibot';
// ---cut---
const CreatePostBody = v.object({
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  content: v.string(),
  tags: v.optional(v.array(v.string())),
});

@Controller('/posts')
class PostController {
  @Post('/')
  create(body = validated(CreatePostBody)) {
    // body is fully typed as { title: string; content: string; tags?: string[] }
    return { id: '1', ...body };
  }
}
```

If validation fails, Zelt automatically returns a 400 response with detailed error information.

### Without Validation

For cases where you don't need validation (e.g., accepting arbitrary JSON), use the `body()` primitive:

```typescript
import { Controller, Post, body } from '@zeltjs/core';
// ---cut---
@Controller('/webhooks')
class WebhookController {
  @Post('/github')
  handleGithubWebhook(payload = body()) {
    // payload is typed as unknown
    return { received: true };
  }
}
```

See [Request & Response Primitives](./primitives.md) for more details on `body()` and other request helpers.

## Returning Responses

Controller methods support two return styles:

### Plain Return (Recommended for 200 OK)

Simply return a value — Zelt automatically serializes it as JSON with status 200:

```typescript
import { Controller, Get } from '@zeltjs/core';
// ---cut---
@Controller('/users')
class UserController {
  @Get('/')
  findAll() {
    return { users: [] }; // → 200 OK, Content-Type: application/json
  }

  @Get('/health')
  health() {
    return 'OK'; // → 200 OK, Content-Type: text/plain
  }
}
```

### response() (For Custom Status Codes or Headers)

Use `response()` when you need a status code other than 200, custom headers, or redirects:

```typescript
import { Controller, Post, Delete, pathParam, response } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
import * as v from 'valibot';
const schema = v.object({ name: v.string() });
// ---cut---
@Controller('/users')
class UserController {
  @Post('/')
  create(body = validated(schema), res = response()) {
    return res.json({ id: '1', ...body }, 201); // 201 Created
  }

  @Delete('/:id')
  remove(id = pathParam('id')) {
    return new Response(null, { status: 204 }); // 204 No Content
  }
}
```

### When to Use Which

| Scenario | Approach |
|----------|----------|
| Return JSON with 200 | `return { data }` |
| Return with custom status (201, 204, etc.) | `response().json(data, status)` |
| Set custom headers | `response().header(name, value).json(data)` |
| Redirect | `response().redirect(url)` |
| Set cookies | `response().setCookie(name, value).json(data)` |
| Stream response | `response().stream(cb)` / `response().sse(cb)` |

See [Request & Response Primitives](./primitives.md) for the full `response()` API.

## Custom Response Status

Use `response()` to control the HTTP status code:

```typescript
import { Controller, Post, Delete, pathParam, response } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
import * as v from 'valibot';
const schema = v.object({ name: v.string() });
// ---cut---
@Controller('/items')
class ItemController {
  @Post('/')
  create(body = validated(schema), res = response()) {
    const created = { id: '1', ...body };
    return res.json(created, 201); // Returns 201 Created
  }

  @Delete('/:id')
  remove(id = pathParam('id')) {
    // Perform delete operation
    return new Response(null, { status: 204 }); // Returns 204 No Content
  }
}
```

## Registering Controllers

Controllers must be registered in `createApp()`:

```typescript
import { createApp, Controller, Get, Post, pathParam, response, http } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
import * as v from 'valibot';

const CreateUserBody = v.object({ name: v.string(), email: v.pipe(v.string(), v.email()) });
@Controller('/users') class UserController {
  @Get('/') findAll() { return { users: [] }; }
  @Get('/:id') findOne(id = pathParam('id')) { return { id }; }
  @Post('/') create(body = validated(CreateUserBody), res = response()) { return res.json({ id: '1', ...body }, 201); }
}
@Controller('/posts') class PostController {
  @Get('/') findAll() { return { posts: [] }; }
}
// ---cut---
export const app = createApp([http({
    controllers: [UserController, PostController],
  })]);
```

## Next Steps

- Learn about [Middleware](./middleware.md) for request/response processing
