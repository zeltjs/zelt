# ZeltJS

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

> Portable application framework with DI — Node, Workers, Lambda... anywhere.

ZeltJS is a portable TypeScript application framework with built-in DI. It runs anywhere — Node.js, Bun, Cloudflare Workers, AWS Lambda.

```typescript
import { Controller, Get, Post, validated, pathParam, createApp } from '@zeltjs/core';
import * as v from 'valibot';

const UserSchema = v.object({
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
});

@Controller('/users')
class UserController {
  @Get('/')
  list() {
    return { users: db.users.findMany() };
  }

  @Get('/:id')
  findOne(id = pathParam('id')) {
    return { user: db.users.find(id) };
  }

  @Post('/')
  create(data = validated(UserSchema)) {
    return { user: db.users.create(data) };
  }
}

const app = createApp({
  http: { controllers: [UserController] },
});

// Node.js
const node = await onNode(app);
node.listen(3000);

// Cloudflare Workers
const workers = await onCloudflareWorkers(app);
export default { fetch: workers.fetch };

// Lambda
const lambda = await onLambda(app);
export const handler = lambda.handler;
```

## Why ZeltJS?

- **Run Anywhere** — Node, Bun, Workers, Lambda — portable across runtimes
- **DI Built-in** — First-class dependency injection, type-safe
- **Fast Startup** — Minimal wake-up time, serverless-ready
- **Future-proof Decorators** — TC39 & reflect-metadata dual support
- **Test-friendly** — DI-based testing, easy mock injection, Testcontainers integration
- **Minimal Size** — Tree-shakable, loads only what you need — no unused dependencies

## Status

**pre-alpha** — Breaking changes may occur in minor versions during 0.x.

## License

MIT
