# Introduction

ZeltJS is a TypeScript backend framework with dependency injection. Controllers,
services, configuration, and other application code are defined separately from server
startup. Runtime adapters are available for Node.js, Bun, Cloudflare Workers, AWS Lambda,
Electron, and in-process tests.

:::caution[Pre-alpha]
ZeltJS is in active development. APIs may change between minor versions during 0.x.
Projects that require stable APIs or long-term support should wait for a stable release.
:::

## What ZeltJS provides

A router can get an HTTP service running quickly. As the service grows, teams also have
to decide how dependency injection, configuration, lifecycle hooks, validation,
authentication, logging, background work, and tests fit together. Those decisions are
application architecture, not routing.

Zelt provides these application-level features and separates them from runtime startup:

- **Application definition:** controllers, services, and features.
- **Runtime entry:** an adapter starts the application on Node.js, Bun, Workers, Lambda,
  Electron, or the test runtime.
- **Generated files:** optional plugins generate OpenAPI documents, GraphQL runtime data,
  and typed clients from the application definition.

Entry files and infrastructure configuration remain specific to each runtime. They are
kept separate from controllers, services, and business rules.

## Suitable use cases

ZeltJS is intended for applications that:

- need built-in dependency injection and lifecycle management;
- use the same application definition in production and in-process tests;
- may run on Node.js, Bun, Workers, Lambda, or Electron;
- expose behavior through more than one transport, such as HTTP, GraphQL, commands, or
  scheduled jobs; or
- generate OpenAPI documents or typed clients from application metadata.

For a small handler that only needs routing, a router is likely sufficient. ZeltJS is also
not yet suitable for production systems that require stable APIs and long-term support.

## Design principles

- **TypeScript APIs** — use modules, async/await, types, and standard decorators.
- **Web Standard APIs for HTTP** — use `Request`, `Response`, and the Fetch API.
- **Separate runtime startup** — put runtime-specific startup and infrastructure in
  adapters and replaceable services.
- **Explicit composition** — assemble controllers and features with `createApp([...])`,
  so the application definition is visible in code.
- **Measured startup time** — the benchmark suite reports both throughput and cold-start
  time. See the [methodology and results](https://github.com/zeltjs/benchmarks).

## Example

```typescript
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

The application definition does not start a server. The Node.js entry does:

```typescript
import { onNode } from '@zeltjs/adapter-node';
import { createApp, http } from '@zeltjs/core';
const app = createApp([http({ controllers: [] })]);
// ---cut---
// node.ts — app is imported from ./app

const node = await onNode(app);
await node.http.listen(3000);
```

## Next steps

- [Try ZeltJS in StackBlitz](https://stackblitz.com/fork/github/zeltjs/zelt/tree/main/examples/stackblitz-node?startScript=dev&title=ZeltJS%20Quickstart) — run and edit a small Node.js app in your browser.
- [Follow Getting Started](./getting-started) — install Zelt locally and choose a runtime.
- [Read the architecture overview](./big-picture) — see how app definitions, generated
  artifacts, adapters, and runtime environments fit together.
- [Explore a complete example](https://github.com/zeltjs/zelt/tree/main/examples/drizzle-todo) — inspect a backend with Drizzle and tests.
