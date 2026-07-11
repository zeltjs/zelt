<p align="center">
  <img src="https://raw.githubusercontent.com/zeltjs/zelt/main/website/static/img/logo.svg" alt="ZeltJS" height="80">
  <br>
  <b>ZeltJS</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@zeltjs/core"><img src="https://img.shields.io/npm/v/@zeltjs/core.svg" alt="npm"></a>
  <a href="https://github.com/zeltjs/zelt/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
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

## Runtime Context Storage

Framework integrations can share request-scoped state through Zelt's runtime
context instead of importing a platform-specific async-context API:

```typescript
import { createContextStorage } from '@zeltjs/core';

const traceStorage = createContextStorage<string>('my-package:trace-id');

const result = await traceStorage.run('trace-123', async () => {
  await Promise.resolve();
  return traceStorage.get();
});
```

`run()` propagates the value across asynchronous work, isolates concurrent
executions, and restores an outer value after nested execution. `get()`
returns `undefined` outside an active context.

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
const server = await nodeApp.http.listen({ port: 3000 });
console.log(`Server running at http://localhost:${server.address.port}`);
```

## Background Tasks

Use the built-in tasks feature for process-local side effects that should not
block the current work: run them in the background now, or after the current
HTTP response is sent. Tasks are intentionally ephemeral — they are not
persisted, not retried, and pending tasks are lost when the process exits.
Use an external queue for durable or retryable work.

No feature registration is needed — inject `TaskService` wherever you need it.

```typescript
import { Controller, Post, TaskService, createApp, http, inject } from '@zeltjs/core';

@Controller('/users')
class UserController {
  constructor(private readonly tasks = inject(TaskService)) {}

  @Post('/')
  async create() {
    // Runs after the HTTP response is sent (waitUntil-style)
    this.tasks.afterResponse(() => sendWelcomeEmail(), { name: 'send-welcome-email' });
    return { queued: true };
  }
}

const app = createApp([http({ controllers: [UserController] })]);
const runtime = await app.createRuntime();

const tasks = await runtime.get(TaskService);

// Fire-and-forget background execution
tasks.run(() => rebuildSearchIndex(), { name: 'rebuild-search-index' });

// Wait for completion
await tasks.runAndWait(() => warmUpCaches());
```

Failed background tasks are reported through the built-in logger with the
task name. Outside an HTTP request context, `afterResponse()` behaves like
`run()`. On shutdown the runtime waits for active tasks to settle, so a
long-running task delays shutdown.

How far background execution extends depends on the runtime, resolved through
the `WaitUntilAdaptor` abstraction: on long-lived processes (Node.js, Bun,
Electron) the default no-op adaptor applies and execution is best-effort — a
graceful shutdown drains active tasks, but a crash or forced kill loses them;
on Cloudflare Workers the adapter ties tasks and after-response callbacks to
`ctx.waitUntil`, so they run within the platform's post-response execution
window. AWS Lambda has no equivalent primitive — the execution environment may
freeze right after the response — so use an external queue for post-response
work on Lambda.

## Deploy Anywhere

Same application code, different adapters:

```typescript
// Node.js
import { onNode } from '@zeltjs/adapter-node';
const nodeApp = await onNode(app);
await nodeApp.http.listen({ port: 3000 });

// Bun
import { onBun } from '@zeltjs/adapter-bun';
const bunApp = await onBun(app);
bunApp.http.serve({ port: 3000 });

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
