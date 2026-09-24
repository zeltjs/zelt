<p align="center">
  <img src="website/static/img/logo.svg" alt="ZeltJS" height="80">
  <br>
  <strong>A TypeScript backend framework with dependency injection</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@zeltjs/core"><img src="https://img.shields.io/npm/v/@zeltjs/core.svg" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/status-pre--alpha-orange.svg" alt="Status: pre-alpha">
</p>

ZeltJS provides controllers, services, configuration, lifecycle hooks, validation, and
testing. Application code is defined separately from server startup. Runtime adapters are
available for **Node.js**, **Bun**, **Cloudflare Workers**, **AWS Lambda**, **Electron**,
and in-process tests.

<p align="center">
  <a href="https://zeltjs.com">Documentation</a> ·
  <a href="https://stackblitz.com/fork/github/zeltjs/zelt/tree/main/examples/stackblitz-node?startScript=dev&title=ZeltJS%20Quickstart">Try in StackBlitz</a> ·
  <a href="https://zeltjs.com/docs/big-picture">Architecture</a>
</p>

> [!CAUTION]
> ZeltJS is pre-alpha. APIs may change between minor versions during 0.x.

## What ZeltJS Provides

- **Dependency injection and lifecycle** — services, configuration, lifecycle hooks,
  validation, authentication, logging, background work, and tests use the same DI container.
- **Runtime adapters** — small entry files start the application on Node.js, Bun,
  Cloudflare Workers, AWS Lambda, Electron, or in-process tests.
- **In-process testing** — `onTest` starts the application and its DI lifecycle without
  opening a network port.
- **Web Standard APIs** — HTTP features use `Request`, `Response`, and Fetch APIs.
- **Generated API artifacts** — optional plugins generate OpenAPI documents, GraphQL
  runtime data, and typed clients from the application definition.

ZeltJS is intended for backend applications that need dependency injection and shared
application structure across controllers, jobs, and tests. For a small HTTP handler that
only needs routing, a router is likely sufficient.

## Application Definition and Node.js Entry

Controllers and services are defined in the application:

```typescript
// app.ts
import { Controller, Get, Injectable, createApp, http, inject } from '@zeltjs/core';

@Injectable()
class GreetingService {
  greet() {
    return 'Hello from ZeltJS!';
  }
}

@Controller('/')
class GreetingController {
  constructor(private greetings = inject(GreetingService)) {}

  @Get('/')
  hello() {
    return { message: this.greetings.greet() };
  }
}

export const app = createApp([http({ controllers: [GreetingController] })]);
```

The Node.js entry starts the server:

```typescript
// node.ts
import { onNode } from '@zeltjs/adapter-node';
import { app } from './app';

const node = await onNode(app);
await node.http.listen(3000);
```

Other runtime entries import the same application definition and use a different adapter.

## Try it

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/fork/github/zeltjs/zelt/tree/main/examples/stackblitz-node?startScript=dev&title=ZeltJS%20Quickstart)

Or start locally with Node.js:

```bash
npm install @zeltjs/core @zeltjs/adapter-node
```

Follow the [Node.js Getting Started guide](https://zeltjs.com/docs/getting-started/node) for
the project setup, or read the [architecture overview](https://zeltjs.com/docs/big-picture).

## Supported Runtimes

| Runtime | Adapter |
| ------- | ------- |
| Node.js | `@zeltjs/adapter-node` |
| Bun | `@zeltjs/adapter-bun` |
| Cloudflare Workers | `@zeltjs/adapter-cloudflare-workers` |
| AWS Lambda | `@zeltjs/adapter-lambda` |
| Electron | `@zeltjs/adapter-electron` |

## Benchmark

The current benchmark snapshot measures both steady-state throughput and startup time.

| Framework | Requests/sec | Cold Start (ms) |
| --------- | -----------: | --------------: |
| Fastify   |       44,033 |             101 |
| **Zelt**  |   **37,331** |          **68** |
| Hono      |       37,262 |              37 |
| AdonisJS  |       33,548 |             149 |
| NestJS    |       23,597 |             268 |

[View full benchmark details →](https://github.com/zeltjs/benchmarks)

## License

MIT
