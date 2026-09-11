# Introduction

ZeltJS is a TypeScript application framework for teams that want a consistent backend
structure without tying their application core to one runtime. Define controllers,
services, configuration, and other features once, then realize the same app with an
adapter for Node.js, Bun, Cloudflare Workers, AWS Lambda, Electron, or in-process tests.

:::caution[Pre-alpha]
ZeltJS is in active development. APIs may change between minor versions during 0.x.
It is ready for exploration and feedback, but not yet a conservative choice for
applications that require a stable API and long-term support.
:::

## The problem Zelt addresses

A router can get an HTTP service running quickly. As the service grows, teams also have
to decide how dependency injection, configuration, lifecycle hooks, validation,
authentication, logging, background work, and tests fit together. Those decisions are
application architecture, not routing.

Zelt provides that application layer while keeping the runtime boundary explicit:

- **Your application core describes behavior.** Controllers, services, and features do
  not start servers or depend on a deployment platform.
- **An adapter realizes the app.** A small entry file selects Node.js, Bun, Workers,
  Lambda, Electron, or the test runtime.
- **Optional plugins derive artifacts.** OpenAPI documents, GraphQL runtime data, and
  typed clients can be generated from the application definition.

The result is not "zero platform-specific code." Entry files and infrastructure
configuration still belong to each platform. The goal is to keep those details at the
edge instead of spreading them through your application.

## When Zelt is a good fit

Consider Zelt when you:

- need framework-level structure and built-in dependency injection, not only a router;
- want the same application core to run in production and in-process tests;
- may deploy the same features to Node.js, Bun, Workers, Lambda, or Electron;
- expose behavior through more than one transport, such as HTTP, GraphQL, commands, or
  scheduled jobs; or
- want build-derived contracts such as OpenAPI or typed clients.

Zelt may not be the right fit for a tiny handler where a router is enough, an application
that intentionally depends on one runtime throughout, or a production system that needs
a mature ecosystem and stable APIs today.

## Design principles

- **TypeScript-native** — use modules, async/await, types, and standard decorators
  instead of introducing a parallel module or reactive programming model.
- **Web-standard at the HTTP boundary** — work with `Request`, `Response`, and the Fetch
  API rather than a framework-specific request/response model.
- **Portable application core** — isolate runtime-specific startup and infrastructure in
  adapters and replaceable services.
- **Explicit composition** — assemble controllers and features with `createApp([...])`,
  so the application's shape is visible in code.
- **Cold-start conscious** — keep startup work small enough for serverless and edge
  environments. See the [benchmark methodology and results](https://github.com/zeltjs/benchmarks).

## A small application

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

The application does not select a runtime. A Node.js entry is only a few lines:

```typescript
import { onNode } from '@zeltjs/adapter-node';
import { createApp, http } from '@zeltjs/core';
const app = createApp([http({ controllers: [] })]);
// ---cut---
// node.ts — app is imported from ./app

const node = await onNode(app);
await node.http.listen(3000);
```

## Choose your next step

- [Try ZeltJS in StackBlitz](https://stackblitz.com/fork/github/zeltjs/zelt/tree/main/examples/stackblitz-node?startScript=dev&title=ZeltJS%20Quickstart) — run and edit a small Node.js app in your browser.
- [Follow Getting Started](./getting-started) — install Zelt locally and choose a runtime.
- [Understand the Big Picture](./big-picture) — see how app definitions, generated
  artifacts, adapters, and runtime environments fit together.
- [Explore a complete example](https://github.com/zeltjs/zelt/tree/main/examples/drizzle-todo) — inspect a backend with Drizzle and tests.
