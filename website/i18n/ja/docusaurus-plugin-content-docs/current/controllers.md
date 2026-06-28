---
---

# Controllers

Controllers are responsible for handling incoming **requests** and returning **responses** to the client.

## Defining Controllers

A controller is a class decorated with `@Controller()`. The decorator accepts a path prefix that will be prepended to all routes defined in the controller.

```typescript
import { Controller, Get, Post, response } from '@zeltjs/core';
import { request } from '@zeltjs/validator-valibot';
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
  findOne(req = request()) {
    const id = req.pathParam('id');
    return { id, name: 'John Doe' };
  }

  @Post('/')
  async create(req = request(CreateUserBody), res = response()) {
    const body = await req.body();
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
import { Controller, Get, Post, Put, Patch, Delete } from '@zeltjs/core';
import { request } from '@zeltjs/validator-valibot';
import * as v from 'valibot';
const schema = v.object({ name: v.string() });
// ---cut---
@Controller('/items')
export class ItemController {
  @Get('/')
  findAll() { /* ... */ }

  @Get('/:id')
  findOne(req = request()) {
    const id = req.pathParam('id');
    /* ... */
  }

  @Post('/')
  async create(req = request(schema)) {
    const body = await req.body();
    /* ... */
  }

  @Put('/:id')
  async update(req = request(schema)) {
    const id = req.pathParam('id');
    const body = await req.body();
    /* ... */
  }

  @Patch('/:id')
  async patch(req = request(schema)) {
    const id = req.pathParam('id');
    const body = await req.body();
    /* ... */
  }

  @Delete('/:id')
  remove(req = request()) {
    const id = req.pathParam('id');
    /* ... */
  }
}
```

## Route Parameters

Use `pathParam()` to extract route parameters:

```typescript
import { Controller, Get, request } from '@zeltjs/core';
// ---cut---
@Controller('/items')
class ItemController {
  @Get('/:category/:id')
  findOne(req = request()) {
    const category = req.pathParam('category');
    const id = req.pathParam('id');
    return { category, id };
  }
}
```

## Request Body Validation

Use `request()` with a Valibot schema to validate and type the request body:

```typescript
import { Controller, Post } from '@zeltjs/core';
import { request } from '@zeltjs/validator-valibot';
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
  async create(req = request(CreatePostBody)) {
    const body = await req.body();
    // body is fully typed as { title: string; content: string; tags?: string[] }
    return { id: '1', ...body };
  }
}
```

If validation fails, Zelt automatically returns a 400 response with detailed error information.

## Custom Response Status

Use `response()` to control the HTTP status code:

```typescript
import { Controller, Post, request } from '@zeltjs/core';
// ---cut---
@Controller('/webhooks')
class WebhookController {
  @Post('/github')
  async handleGithubWebhook(req = request()) {
    const payload = await req.body();
    // payload is typed as unknown
    return { received: true };
  }
}
```

## Registering Controllers

Controllers must be registered in `createApp()`:

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

## Next Steps

- Learn about [Middleware](./middleware.md) for request/response processing
