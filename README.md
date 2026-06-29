<p align="center">
  <img src="website/static/img/logo.svg" alt="ZeltJS" height="80">
  <br>
  <b>ZeltJS</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@zeltjs/core"><img src="https://img.shields.io/npm/v/@zeltjs/core.svg" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

A portable TypeScript application framework with built-in DI. Swap adapters to run on **Node.js**, **Bun**, **Cloudflare Workers**, or **AWS Lambda**. Building large-scale applications that work across different infrastructure — that's what ZeltJS aims for.

📖 **Documentation**: [zeltjs.com](https://zeltjs.com)

## Features

- **TS-Native** — Use import/export, async/await, and types. No reinventing what TypeScript already provides
- **Web-Standard** — Align with Request/Response and Fetch API. No custom abstractions
- **Transport-Agnostic** — REST, GraphQL, CLI, Queue — they're all just entry points. Your application core stays the same
- **Cold-Start Friendly** — Runs on serverless, Workers, Edge. No startup cost penalty
- **Built-in DI** — Type-safe dependency injection with `@Injectable` and `inject()`

## Supported Runtimes

| Runtime | Adapter |
| ------- | ------- |
| Node.js | `@zeltjs/adapter-node` |
| Bun | `@zeltjs/adapter-bun` |
| Cloudflare Workers | `@zeltjs/adapter-cloudflare-workers` |
| AWS Lambda | `@zeltjs/adapter-lambda` |
| Electron | `@zeltjs/adapter-electron` |

## Installation

```bash
npm i @zeltjs/core @zeltjs/adapter-node valibot
```

## Quick Start

### 1. Define a Controller

```typescript
import { Controller, Get, Post, request, response } from '@zeltjs/core';
import * as v from 'valibot';

const CreateUserBody = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  email: v.pipe(v.string(), v.email()),
});

@Controller('/users')
class UserController {
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
```

### 2. Add a Service with Dependency Injection

```typescript
import { Injectable, inject } from '@zeltjs/core';

@Injectable()
class UserService {
  private users = new Map<string, { id: string; name: string }>();

  findAll() {
    return Array.from(this.users.values());
  }

  create(name: string) {
    const id = crypto.randomUUID();
    const user = { id, name };
    this.users.set(id, user);
    return user;
  }
}

@Controller('/users')
class UserController {
  constructor(private userService = inject(UserService)) {}

  @Get('/')
  findAll() {
    return { users: this.userService.findAll() };
  }
}
```

### 3. Create and Run the Application

```typescript
import { createApp } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

const app = createApp({
  http: {
    controllers: [UserController],
  },
});

const nodeApp = await onNode(app);
const server = await nodeApp.listen({ port: 3000 });
console.log(`Server running at http://localhost:${server.address.port}`);
```

## Deploy Anywhere

Same application code, different adapters:

```typescript
// Node.js
import { onNode } from '@zeltjs/adapter-node';
const nodeApp = await onNode(app);
await nodeApp.listen({ port: 3000 });

// Bun
import { onBun } from '@zeltjs/adapter-bun';
const bunApp = await onBun(app);
bunApp.serve({ port: 3000 });

// Cloudflare Workers
import { onCloudflareWorkers } from '@zeltjs/adapter-cloudflare-workers';
const workers = await onCloudflareWorkers(app);
export default { fetch: workers.fetch };

// AWS Lambda
import { onLambda } from '@zeltjs/adapter-lambda';
const lambdaApp = await onLambda(app);
export const handler = lambdaApp.handler;
```

## Benchmark

Zelt balances runtime performance with cold-start speed — ideal for serverless.

| Framework | Requests/sec | Cold Start (ms) |
| --------- | -----------: | --------------: |
| Fastify   |       44,033 |             101 |
| **Zelt**  |   **37,331** |          **68** |
| Hono      |       37,262 |              37 |
| AdonisJS  |       33,548 |             149 |
| NestJS    |       23,597 |             268 |

[View full benchmark details →](https://github.com/zeltjs/benchmarks)

## Status

**pre-alpha** — Breaking changes may occur in minor versions during 0.x.

## License

MIT
