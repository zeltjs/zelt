---
sidebar_position: 3
---

# Controllers

Controllers are responsible for handling incoming **requests** and returning **responses** to the client.

## Defining Controllers

A controller is a class decorated with `@Controller()`. The decorator accepts a path prefix that will be prepended to all routes defined in the controller.

```typescript
import { Controller, Get, Post, pathParam, validated, response } from '@zeltjs/core';
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
@Get('/:category/:id')
findOne(
  category = pathParam('category'),
  id = pathParam('id')
) {
  return { category, id };
}
```

## Request Body Validation

Use `validated()` with a Valibot schema to validate and type the request body:

```typescript
import * as v from 'valibot';

const CreatePostBody = v.object({
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  content: v.string(),
  tags: v.optional(v.array(v.string())),
});

@Post('/')
create(body = validated(CreatePostBody)) {
  // body is fully typed as { title: string; content: string; tags?: string[] }
  return { id: '1', ...body };
}
```

If validation fails, Zelt automatically returns a 400 response with detailed error information.

## Custom Response Status

Use `response()` to control the HTTP status code:

```typescript
@Post('/')
create(body = validated(schema), res = response()) {
  const created = { id: '1', ...body };
  return res.json(created, 201); // Returns 201 Created
}

@Delete('/:id')
remove(id = pathParam('id'), res = response()) {
  return res.json(null, 204); // Returns 204 No Content
}
```

## Registering Controllers

Controllers must be registered in `createHttpApp()`:

```typescript
import { createHttpApp } from '@zeltjs/core';
import { UserController } from './controllers/user.controller';
import { PostController } from './controllers/post.controller';

export const app = createHttpApp({
  controllers: [UserController, PostController],
});
```

## Next Steps

- Learn about [Middleware](./middleware.md) for request/response processing
